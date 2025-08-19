import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const VideoCall = () => {
  const { userId: recipientId } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL; // make sure this is set
  const navigate = useNavigate();

  // UI / state
  const [localStream, setLocalStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]); // kept for potential UI list
  const [error, setError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [ringing, setRinging] = useState(false);

  // refs
  const socket = useRef(null);
  const peersRef = useRef([]); // { peerId: socketId, peer }
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null); // caller-side 60s timeout
  const incomingTimeoutRef = useRef(null); // recipient-side incoming UI timeout
  const callTimerRef = useRef(null);
  const mounted = useRef(false);
  const localStreamRef = useRef(null);
  const isCallingRef = useRef(false);
  const inCallRef = useRef(false);
  const callRoomIdRef = useRef(null);

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
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const stopStreamTracks = (stream) => {
    try {
      if (!stream) return;
      const tracks = stream.getTracks ? stream.getTracks() : [];
      tracks.forEach((t) => {
        try { t.stop(); } catch (e) { /* ignore */ }
      });
    } catch (e) {
      console.error('stopStreamTracks error:', e);
    }
  };

  const attachRemoteStream = useCallback((stream) => {
    try {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play?.().catch((e) => console.warn('Remote play error:', e));
      }
    } catch (e) {
      console.error('attachRemoteStream error:', e);
      setError('Failed to attach remote stream.');
    }
  }, []);

  // cleanUpCall: navigateOnEnd = whether to navigate back, emitToServer = whether to notify server (avoid loops)
  const cleanUpCall = useCallback((navigateOnEnd = false, emitToServer = true) => {
    clearTimeout(callTimeoutRef.current);
    clearTimeout(incomingTimeoutRef.current);
    clearInterval(callTimerRef.current);

    // Destroy peers
    peersRef.current.forEach(({ peer }) => {
      try { peer.destroy(); } catch (e) { /* ignore */ }
    });
    peersRef.current = [];
    setPeers([]);

    // Stop local stream tracks
    if (localStreamRef.current) {
      stopStreamTracks(localStreamRef.current);
      localStreamRef.current = null;
    }

    // Stop remote video element tracks (if any)
    try {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        stopStreamTracks(remoteVideoRef.current.srcObject);
        remoteVideoRef.current.srcObject = null;
      }
    } catch (e) {
      console.error('Error stopping remote video tracks:', e);
    }

    // detach video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    // notify server (only if this was initiated locally)
    if (emitToServer && socket.current) {
      try {
        if (isCallingRef.current && !inCallRef.current) {
          // caller canceled before connection
          socket.current.emit('video_call_cancel', { recipientId });
        } else if (inCallRef.current) {
          // end active call
          socket.current.emit('end_call', callRoomIdRef.current);
        }
      } catch (e) {
        console.warn('Error emitting call end to server:', e);
      }
    }

    // reset UI + refs
    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setCallRoomId(null);
    setCallDuration(0);
    setIsAudioMuted(false);
    setIsVideoEnabled(true);
    setError(null);
    setIncomingCall(null);
    setRinging(false);

    isCallingRef.current = false;
    inCallRef.current = false;
    callRoomIdRef.current = null;

    if (navigateOnEnd) {
      navigate(`/chat/${recipientId}`);
    }
  }, [recipientId, navigate]);

  const startCallTimer = useCallback(() => {
    clearInterval(callTimerRef.current);
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // --- Socket setup and handlers
  useEffect(() => {
    mounted.current = true;

    if (!socket.current) {
      socket.current = io(apiUrl, {
        query: { userId: currentUserId, recipientId },
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.current.on('connect', () => {
        console.log('Socket connected:', socket.current.id);
        setError(null);
      });

      socket.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        setError('Failed to connect to server. Retrying...');
      });

      socket.current.on('reconnect_attempt', (n) => {
        console.log('Reconnect attempt', n);
        setError('Reconnecting to server...');
      });

      socket.current.on('reconnect_failed', () => {
        console.error('Reconnect failed');
        setError('Unable to reconnect to server.');
      });

      // incoming call (recipient sees this)
      socket.current.on('incoming_video_call', ({ callerId, callerSocketId, roomId }) => {
        if (!mounted.current) return;
        setIncomingCall({ callerId, callerSocketId, roomId });
        setRinging(true);

        // Clear prior incoming timeout and set new 60s timeout to auto-dismiss incoming UI
        clearTimeout(incomingTimeoutRef.current);
        incomingTimeoutRef.current = setTimeout(() => {
          // auto-dismiss incoming call UI after 60s (client-side). Notify caller that call was not accepted.
          if (mounted.current && incomingCall == null) {
            // nothing
          }
          // if still ringing, reject the call (server will notify caller)
          if (ringing && socket.current) {
            socket.current.emit('video_call_reject', { callerSocketId });
          }
          setIncomingCall(null);
          setRinging(false);
        }, 60000);
      });

      // caller receives acceptance from callee
      socket.current.on('video_call_accepted', ({ roomId }) => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        isCallingRef.current = false;
        setInCall(true);
        inCallRef.current = true;
        setCallRoomId(roomId);
        callRoomIdRef.current = roomId;
        joinVideoRoom(roomId);
        startCallTimer();
      });

      socket.current.on('video_call_rejected', () => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setError('Call rejected by the other user.');
        // server-origin: don't re-emit
        cleanUpCall(true, false);
      });

      socket.current.on('video_call_canceled', () => {
        if (!mounted.current) return;
        setError('Call canceled by the caller.');
        // server-origin: don't re-emit
        cleanUpCall(true, false);
      });

      socket.current.on('all_users', (users) => {
        if (!mounted.current || !localStreamRef.current) return;
        const newPeers = [];
        users.forEach((userSocketId) => {
          if (userSocketId !== socket.current.id) {
            const exists = peersRef.current.find((p) => p.peerId === userSocketId);
            if (!exists) {
              const peer = createPeer(userSocketId, socket.current.id, localStreamRef.current);
              if (peer) {
                peersRef.current.push({ peerId: userSocketId, peer });
                newPeers.push(peer);
              }
            }
          }
        });
        if (newPeers.length) setPeers((prev) => [...prev, ...newPeers]);
      });

      socket.current.on('user_joined', ({ signal, callerId }) => {
        if (!mounted.current || !localStreamRef.current) return;
        const exists = peersRef.current.find((p) => p.peerId === callerId);
        if (!exists) {
          const peer = addPeer(signal, callerId, localStreamRef.current);
          if (peer) {
            peersRef.current.push({ peerId: callerId, peer });
            setPeers((prev) => [...prev, peer]);
          }
        }
      });

      socket.current.on('receiving_returned_signal', ({ signal, id }) => {
        if (!mounted.current) return;
        const item = peersRef.current.find((p) => p.peerId === id);
        if (item) {
          try {
            item.peer.signal(signal);
          } catch (e) {
            console.error('Signal error:', e);
            setError('Failed to establish connection.');
          }
        }
      });

      socket.current.on('call_ended', () => {
        if (!mounted.current) return;
        setError('Call ended by the other user.');
        // server-origin: don't re-emit
        cleanUpCall(true, false);
      });

      socket.current.on('user_left', (id) => {
        if (!mounted.current) return;
        const peerObj = peersRef.current.find((p) => p.peerId === id);
        if (peerObj) {
          try { peerObj.peer.destroy(); } catch (e) { console.error('Peer destroy error:', e); }
        }
        peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
        setPeers((prev) => prev.filter((p) => p.peerId !== id));
        // if the other user left and there are no peers, end locally (server-origin)
        if (peersRef.current.length === 0) {
          setError('Other user left the call.');
          cleanUpCall(true, false);
        }
      });
    }

    // Cleanup on unmount
    const handleBeforeUnload = () => {
      // do not emit to server when unloading: server will detect socket disconnect
      cleanUpCall(false, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanUpCall(false, false); // don't emit when unmounting
      if (socket.current) {
        socket.current.off('connect');
        socket.current.off('connect_error');
        socket.current.off('reconnect_attempt');
        socket.current.off('reconnect_failed');
        socket.current.off('incoming_video_call');
        socket.current.off('video_call_accepted');
        socket.current.off('video_call_rejected');
        socket.current.off('video_call_canceled');
        socket.current.off('all_users');
        socket.current.off('user_joined');
        socket.current.off('receiving_returned_signal');
        socket.current.off('call_ended');
        socket.current.off('user_left');
        try { socket.current.disconnect(); } catch (e) { /* ignore */ }
        socket.current = null;
      }
    };
  }, [apiUrl, cleanUpCall, startCallTimer, recipientId, currentUserId]);

  // Auto-initiate if ?type=initiate
  useEffect(() => {
    if (type === 'initiate' && !isCalling && !inCall) {
      startVideoCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Attach local stream to local video element when available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      try {
        localVideoRef.current.srcObject = localStream;
        localStreamRef.current = localStream;
      } catch (e) {
        console.error('Error attaching local stream to video element:', e);
      }
    }
  }, [localStream]);

  // Peer creation helpers
  const createPeer = (userToSignalSocketId, callerSocketId, stream) => {
    if (!stream) {
      setError('No media stream available to create peer.');
      return null;
    }
    const peer = new Peer({
      initiator: true,
      trickle: true,
      config: configuration,
      stream,
    });

    peer._pc.oniceconnectionstatechange = function () {
      const state = this.iceConnectionState;
      console.log('ICE state change:', state);
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        if (mounted.current) {
          setError(`Connection ${state}.`);
          if (inCallRef.current) cleanUpCall(false, true);
        }
      }
    };

    peer.on('signal', (signal) => {
      if (mounted.current && socket.current) {
        socket.current.emit('sending_signal', {
          userToSignal: userToSignalSocketId,
          callerId: callerSocketId,
          signal,
        });
      }
    });

    peer.on('stream', (remoteStream) => {
      if (mounted.current) {
        attachRemoteStream(remoteStream);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) setError('Connection error occurred.');
    });

    peer.on('close', () => {
      if (mounted.current) {
        peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
        setPeers((prev) => prev.filter((p) => p !== peer));
      }
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerSocketId, stream) => {
    if (!stream) {
      setError('No media stream available to add peer.');
      return null;
    }
    const peer = new Peer({
      initiator: false,
      trickle: true,
      config: configuration,
      stream,
    });

    peer._pc.oniceconnectionstatechange = function () {
      const state = this.iceConnectionState;
      console.log('ICE state change:', state);
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        if (mounted.current) {
          setError(`Connection ${state}.`);
          if (inCallRef.current) cleanUpCall(false, true);
        }
      }
    };

    peer.on('signal', (signal) => {
      if (mounted.current && socket.current) {
        socket.current.emit('returning_signal', { signal, callerId: callerSocketId });
      }
    });

    peer.on('stream', (remoteStream) => {
      if (mounted.current) {
        attachRemoteStream(remoteStream);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) setError('Connection error occurred.');
    });

    peer.on('close', () => {
      if (mounted.current) {
        peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
        setPeers((prev) => prev.filter((p) => p !== peer));
      }
    });

    try {
      peer.signal(incomingSignal);
    } catch (e) {
      console.error('Signal error:', e);
      setError('Failed to establish connection.');
    }

    return peer;
  };

  // Start a call (caller)
  const startVideoCall = async () => {
    if (isCalling || inCall) {
      console.warn('Call already in progress or initiated');
      return;
    }
    try {
      // Acquire media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;

      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      callRoomIdRef.current = roomId;
      setIsCalling(true);
      isCallingRef.current = true;
      setError(null);

      // request call
      if (socket.current) {
        socket.current.emit('video_call_request', { callerId: currentUserId, recipientId, roomId });
      }

      // 60-second ring timeout for caller
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        if (mounted.current && isCallingRef.current && !inCallRef.current) {
          setError('Call timed out after 60 seconds.');
          // navigateOnEnd = true, emitToServer = true (let server know)
          cleanUpCall(true, true);
        }
      }, 60000);
    } catch (err) {
      console.error('Media device error:', err);
      setError('Failed to access camera/microphone. Check permissions.');
      cleanUpCall(true, true);
    }
  };

  // Accept an incoming call (callee)
  const acceptVideoCall = async () => {
    if (inCall || !incomingCall) {
      console.warn('Already in call or no incoming call');
      return;
    }
    try {
      // Acquire media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      setInCall(true);
      inCallRef.current = true;
      setCallRoomId(incomingCall.roomId);
      callRoomIdRef.current = incomingCall.roomId;
      setRinging(false);
      setIncomingCall(null);
      clearTimeout(incomingTimeoutRef.current);

      // notify caller
      if (socket.current) {
        socket.current.emit('video_call_accept', {
          callerSocketId: incomingCall.callerSocketId,
          roomId: incomingCall.roomId,
        });
      }
      // join video room (server will send all_users)
      joinVideoRoom(callRoomIdRef.current);
      startCallTimer();
    } catch (err) {
      console.error('Media device error:', err);
      setError('Failed to access camera/microphone. Check permissions.');
      cleanUpCall(true, true);
    }
  };

  const rejectVideoCall = () => {
    if (socket.current && incomingCall) {
      socket.current.emit('video_call_reject', { callerSocketId: incomingCall.callerSocketId });
      setIncomingCall(null);
      setRinging(false);
      clearTimeout(incomingTimeoutRef.current);
    }
  };

  const joinVideoRoom = (roomId) => {
    if (socket.current && mounted.current) {
      socket.current.emit('join_video_room', roomId);
    }
  };

  const toggleAudioMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled((prev) => !prev);
    }
  };

  const switchCamera = () => {
    setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));
  };

  const endCall = () => {
    // this is a local initiated end — navigate after cleaning, and notify server
    cleanUpCall(true, true);
  };

  // UI
  return (
    <div className="video-call-window">
      {error && <div className="error-message">{error}</div>}

      {incomingCall && !inCall && !isCalling && (
        <div className="incoming-call">
          <p>Incoming call from user {incomingCall.callerId}</p>
          <button onClick={acceptVideoCall}>Accept</button>
          <button onClick={rejectVideoCall}>Reject</button>
        </div>
      )}

      {inCall && (
        <div className="call-duration">
          Duration: {formatDuration(callDuration)}
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
            className={(isCalling || inCall) && activeVideo === 'local' ? 'maximized' : 'minimized'}
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