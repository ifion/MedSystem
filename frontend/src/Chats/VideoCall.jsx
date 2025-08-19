import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const RING_TIMEOUT_MS = 60_000; // 60 seconds

const VideoCall = () => {
  const { userId: recipientId } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const queryRoomId = searchParams.get('roomId');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL;
  const navigate = useNavigate();

  const [localStream, setLocalStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false); // caller-side: initiating
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);

  // refs and singletons
  const socket = useRef(null);
  const peersRef = useRef([]); // array of { peerId, peer }
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const mounted = useRef(false);

  // timers
  const callTimeoutRef = useRef(null);
  const callTimerInterval = useRef(null);
  const callStartRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const mm = m < 10 ? `0${m}` : `${m}`;
    const ss = s < 10 ? `0${s}` : `${s}`;
    return `${mm}:${ss}`;
  };

  const safeEmit = (event, payload) => {
    try {
      if (socket.current && socket.current.connected) {
        socket.current.emit(event, payload);
      }
    } catch (e) {
      console.warn('Emit failed', event, e);
    }
  };

  // ensure remote stream is attached and playback attempted
  const attachRemoteStream = useCallback((stream) => {
    if (!remoteVideoRef.current) return;
    try {
      if (remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
        // try to play (some browsers require user gesture; this is best-effort)
        const p = remoteVideoRef.current.play();
        if (p && p.catch) p.catch(() => {/* ignore autoplay block */});
      }
    } catch (e) {
      console.warn('attachRemoteStream error', e);
    }
  }, []);

  const stopLocalMediaTracks = useCallback(() => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
    } catch (e) {
      console.warn('stopLocalMediaTracks error', e);
    } finally {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setLocalStream(null);
      localStreamRef.current = null;
      setIsAudioMuted(false);
      setIsVideoEnabled(false);
    }
  }, []);

  const stopAllPeers = useCallback(() => {
    try {
      peersRef.current.forEach(({ peer }) => {
        try { peer.destroy(); } catch (e) {}
      });
    } catch (e) {
      console.warn('stopAllPeers error', e);
    } finally {
      peersRef.current = [];
      setPeers([]);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const startCallTimer = useCallback(() => {
    callStartRef.current = Date.now();
    setCallDuration(0);
    if (callTimerInterval.current) clearInterval(callTimerInterval.current);
    callTimerInterval.current = setInterval(() => {
      if (!callStartRef.current) return;
      const elapsed = Math.floor((Date.now() - callStartRef.current) / 1000);
      setCallDuration(elapsed);
    }, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerInterval.current) {
      clearInterval(callTimerInterval.current);
      callTimerInterval.current = null;
    }
    callStartRef.current = null;
    setCallDuration(0);
  }, []);

  const cleanUpCall = useCallback((navigateOnEnd = false) => {
    // UI-level cleanup (non-destructive)
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    stopCallTimer();
    stopAllPeers();
    stopLocalMediaTracks();

    setInCall(false);
    setIsCalling(false);
    setCallRoomId(null);
    setIsAudioMuted(false);
    setIsVideoEnabled(true);

    if (navigateOnEnd) {
      navigate(`/chat/${recipientId}`);
    }
  }, [navigate, recipientId, stopAllPeers, stopLocalMediaTracks, stopCallTimer]);

  const performDestructiveCleanup = useCallback(() => {
    // Full teardown: peers, tracks, socket listeners & disconnect
    try {
      stopAllPeers();
      stopLocalMediaTracks();

      if (socket.current) {
        try {
          socket.current.removeAllListeners();
          socket.current.disconnect();
        } catch (e) { /* ignore */ }
        socket.current = null;
      }
    } finally {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      stopCallTimer();
      setError(null);
    }
  }, [stopAllPeers, stopLocalMediaTracks, stopCallTimer]);

  // --- Peer creation helpers ---

  const createPeer = useCallback((userToSignal, callerId, stream) => {
    if (!stream) {
      console.error('No local stream for createPeer');
      return null;
    }
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      safeEmit('sending_signal', { userToSignal, callerId, signal });
    });

    peer.on('stream', (remoteStream) => {
      attachRemoteStream(remoteStream);
    });

    peer.on('close', () => {
      peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
      setPeers((prev) => prev.filter((p) => p !== peer));
    });

    peer.on('error', (err) => {
      console.error('Peer error', err);
      setError('Peer connection error. Please try again.');
    });

    return peer;
  }, [attachRemoteStream]);

  const addPeer = useCallback((incomingSignal, callerId, stream) => {
    if (!stream) {
      console.error('No local stream for addPeer');
      return null;
    }
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      safeEmit('returning_signal', { signal, callerId });
    });

    peer.on('stream', (remoteStream) => {
      attachRemoteStream(remoteStream);
    });

    peer.on('close', () => {
      peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
      setPeers((prev) => prev.filter((p) => p !== peer));
    });

    peer.on('error', (err) => {
      console.error('Peer error', err);
      setError('Peer connection error. Please try again.');
    });

    try {
      peer.signal(incomingSignal);
    } catch (e) {
      console.warn('signal error', e);
    }
    return peer;
  }, [attachRemoteStream]);

  // --- Socket initialization & listeners ---
  useEffect(() => {
    mounted.current = true;

    if (!socket.current) {
      socket.current = io(apiUrl, {
        query: { userId: currentUserId, recipientId },
        transports: ['websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.current.on('connect', () => {
        console.log('Video socket connected', socket.current?.id);
        setError(null);
      });

      socket.current.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError('Failed to connect to server. Retrying...');
      });

      socket.current.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
        // If we were in an active call, inform user and cleanup after short timeout
        setError(`Disconnected: ${reason}`);
        if (inCall || isCalling) {
          // try minimal graceful cleanup locally
          cleanUpCall(true);
          performDestructiveCleanup();
        }
      });

      // Caller receives acceptance
      socket.current.on('video_call_accepted', ({ roomId }) => {
        if (!mounted.current) return;
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        setIsCalling(false);
        setInCall(true);
        setCallRoomId(roomId);
        joinVideoRoom(roomId);
        startCallTimer();
      });

      socket.current.on('call_accepted', ({ roomId }) => {
        if (!mounted.current) return;
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        setIsCalling(false);
        setInCall(true);
        setCallRoomId(roomId);
        joinVideoRoom(roomId);
        startCallTimer();
      });

      socket.current.on('video_call_rejected', () => {
        if (!mounted.current) return;
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        setError('Call rejected by the other user.');
        // ensure tracks stopped
        cleanUpCall(true);
        performDestructiveCleanup();
      });

      socket.current.on('video_call_canceled', () => {
        if (!mounted.current) return;
        setError('Call canceled by the caller.');
        // ensure full cleanup and stop camera
        cleanUpCall(true);
        performDestructiveCleanup();
      });

      socket.current.on('video_call_timeout', () => {
        if (!mounted.current) return;
        setError('Call timed out (no answer).');
        cleanUpCall(true);
        performDestructiveCleanup();
      });

      // When we join the room we get existing users
      socket.current.on('all_users', (users) => {
        if (!mounted.current || !localStreamRef.current) return;
        const newPeers = [];
        users.forEach((userId) => {
          if (userId !== currentUserId) {
            const exists = peersRef.current.find((p) => p.peerId === userId);
            if (!exists) {
              const peer = createPeer(userId, socket.current.id, localStreamRef.current);
              peersRef.current.push({ peerId: userId, peer });
              newPeers.push(peer);
            }
          }
        });
        if (newPeers.length) setPeers((prev) => [...prev, ...newPeers]);
      });

      socket.current.on('user_joined', (payload) => {
        if (!mounted.current || !localStreamRef.current) return;
        const exists = peersRef.current.find((p) => p.peerId === payload.callerId);
        if (!exists) {
          const peer = addPeer(payload.signal, payload.callerId, localStreamRef.current);
          peersRef.current.push({ peerId: payload.callerId, peer });
          setPeers((prev) => [...prev, peer]);
        } else {
          try { exists.peer.signal(payload.signal); } catch (e) { /* ignore */ }
        }
      });

      socket.current.on('receiving_returned_signal', (payload) => {
        if (!mounted.current) return;
        const item = peersRef.current.find((p) => p.peerId === payload.id);
        if (item) {
          try { item.peer.signal(payload.signal); } catch (e) { /* ignore */ }
        }
      });

      // remote ended the call
      socket.current.on('call_ended', () => {
        if (!mounted.current) return;
        setError('Call ended by the other user.');
        cleanUpCall(true);
        performDestructiveCleanup();
      });

      socket.current.on('end_call', () => {
        if (!mounted.current) return;
        setError('Call ended by the other user.');
        cleanUpCall(true);
        performDestructiveCleanup();
      });

      socket.current.on('user_left', (id) => {
        if (!mounted.current) return;
        const peerObj = peersRef.current.find((p) => p.peerId === id);
        if (peerObj) {
          try { peerObj.peer.destroy(); } catch (e) {}
        }
        peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
        setPeers((prevPeers) => prevPeers.filter((p) => p.peerId !== id));
        if (peersRef.current.length === 0) {
          setError('All participants left the call.');
          cleanUpCall(true);
          performDestructiveCleanup();
        }
      });
    }

    return () => {
      mounted.current = false;
      // UI cleanup
      cleanUpCall(false);
      // Full destructive cleanup (disconnect)
      performDestructiveCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // handle route type: initiate or accept
  useEffect(() => {
    if (!socket.current) return;
    if (type === 'initiate') {
      startVideoCall();
    } else if (type === 'accept' && queryRoomId) {
      setCallRoomId(queryRoomId);
      acceptVideoCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, queryRoomId]);

  // attach local stream to preview element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        const p = localVideoRef.current.play();
        if (p && p.catch) p.catch(() => {});
      }
    }
  }, [localStream]);

  // --- Actions: start / accept / join / end ---

  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
        const p = localVideoRef.current.play();
        if (p && p.catch) p.catch(() => {});
      }

      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);

      safeEmit('video_call_request', { callerId: currentUserId, recipientId, roomId });

      // Start ring timeout for caller
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        // if still ringing and not answered -> timeout
        if (mounted.current && isCalling && !inCall) {
          setError('Call timed out. No answer.');
          safeEmit('video_call_cancel', { recipientId, roomId }); // inform callee/server
          cleanUpCall(true);
          performDestructiveCleanup();
        }
      }, RING_TIMEOUT_MS);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
    }
  };

  const acceptVideoCall = async () => {
    if (!callRoomId) {
      setError('No call room to accept.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;

      if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
        const p = localVideoRef.current.play();
        if (p && p.catch) p.catch(() => {});
      }

      setInCall(true);
      safeEmit('video_call_accept', { calleeId: currentUserId, roomId: callRoomId });
      joinVideoRoom(callRoomId);
      startCallTimer();
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
    }
  };

  const joinVideoRoom = (roomId) => {
    if (socket.current && mounted.current && roomId) {
      safeEmit('join_video_room', roomId);
    }
  };

  const toggleAudioMute = () => {
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !track.enabled;
        });
        setIsAudioMuted((s) => !s);
      } catch (e) {
        console.warn('toggleAudioMute error', e);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = !track.enabled;
        });
        setIsVideoEnabled((s) => !s);
      } catch (e) {
        console.warn('toggleVideo error', e);
      }
    }
  };

  // just UI swap of which video is maximized
  const [activeVideo, setActiveVideo] = useState('remote');
  const switchCamera = () => setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));

  const endCall = () => {
    // notify server
    try {
      if (isCalling && !inCall) {
        safeEmit('video_call_cancel', { recipientId, roomId: callRoomId });
      } else if (inCall) {
        safeEmit('end_call', { roomId: callRoomId });
      }
    } catch (e) { /* ignore */ }

    cleanUpCall(true);
    performDestructiveCleanup();
  };

  return (
    <div className="video-call-window">
      {error && <div className="error-message">{error}</div>}

      {inCall && (
        <div className="call-duration">
          <span>Duration: {formatDuration(callDuration)}</span>
        </div>
      )}

      {isCalling && !inCall && (
        <div className="ringing">
          <p>Ringing...</p>
          <button onClick={endCall}>Cancel</button>
        </div>
      )}

      {(isCalling || inCall) && (
        <div className="video-container">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={inCall && activeVideo === 'remote' ? 'maximized' : 'hidden'}
            onClick={switchCamera}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={(isCalling || inCall) ? (inCall && activeVideo === 'local' ? 'maximized' : 'minimized') : 'hidden'}
            onClick={switchCamera}
          />
        </div>
      )}

      {inCall && (
        <div className="call-controls">
          <button onClick={toggleAudioMute}>{isAudioMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleVideo}>{isVideoEnabled ? 'Video Off' : 'Video On'}</button>
          <button onClick={endCall}>End Call</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
