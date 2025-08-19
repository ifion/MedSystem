import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const VideoCall = () => {
  const { userId: recipientId } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const queryRoomId = searchParams.get('roomId');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL;
  const navigate = useNavigate();

  const [localStream, setLocalStream] = useState(null);
  // removed remoteStream state to avoid re-renders/flicker
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);

  // singletons / refs
  const socket = useRef(null);
  const peersRef = useRef([]); // { peerId, peer }
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const mounted = useRef(false);

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

  // Attach remote stream directly to remote video element to avoid React re-rendering
  const attachRemoteStream = useCallback((stream) => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
      remoteVideoRef.current.srcObject = stream;
    }
  }, []);

  // Non-destructive cleanup used during hang-up / cancel:
  // resets UI state and removes peers, but DOES NOT disconnect the socket (socket persists until unmount)
  const cleanUpCall = useCallback(
    (navigateOnEnd = false) => {
      clearTimeout(callTimeoutRef.current);

      // Destroy peers and clear refs
      peersRef.current.forEach(({ peer }) => {
        try { peer.destroy(); } catch (e) { /* ignore */ }
      });
      peersRef.current = [];

      // Stop local tracks (we want to clear localStream for UI)
      if (localStream) {
        localStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) { /* ignore */ }
        });
      }

      // Clear video elements
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      // Reset UI states
      setInCall(false);
      setIsCalling(false);
      setLocalStream(null);
      setCallRoomId(null);
      setPeers([]);
      setIsAudioMuted(false);
      setIsVideoEnabled(true);

      if (navigateOnEnd) {
        navigate(`/chat/${recipientId}`);
      }
    },
    [localStream, navigate, recipientId]
  );

  // Destructive cleanup to be done only on unmount (disconnect socket + destroy peers + stop tracks)
  const performDestructiveCleanup = useCallback(() => {
    // destroy peers
    peersRef.current.forEach(({ peer }) => {
      try { peer.destroy(); } catch (e) { /* ignore */ }
    });
    peersRef.current = [];

    // stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) { /* ignore */ }
      });
    }

    // disconnect socket
    if (socket.current) {
      try {
        socket.current.removeAllListeners();
        socket.current.disconnect();
      } catch (e) {
        /* ignore */
      }
      socket.current = null;
    }

    // clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, [localStream]);

  // Initialize socket once on mount and set up listeners once
  useEffect(() => {
    mounted.current = true;

    // ensure we create the socket only once
    if (!socket.current) {
      socket.current = io(apiUrl, {
        query: { userId: currentUserId, recipientId },
        transports: ['websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // If you want to delay automatic connection, you could use autoConnect: false and call connect()
      });

      // Connect handlers
      socket.current.on('connect', () => {
        console.log('Video socket connected', socket.current?.id);
        setError(null);
      });

      socket.current.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError('Failed to connect to server. Retrying...');
      });

      socket.current.on('video_call_accepted', ({ roomId }) => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        setInCall(true);
        setCallRoomId(roomId);
        joinVideoRoom(roomId);
      });

      socket.current.on('video_call_rejected', () => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setError('Call rejected by the other user.');
        cleanUpCall(true);
      });

      socket.current.on('video_call_canceled', () => {
        if (!mounted.current) return;
        setError('Call was canceled by the caller.');
        cleanUpCall(true);
      });

      socket.current.on('all_users', (users) => {
        if (!mounted.current || !localStream) return;
        const newPeers = [];
        users.forEach((userId) => {
          if (userId !== currentUserId) {
            // create peer only if not already present
            const exists = peersRef.current.find((p) => p.peerId === userId);
            if (!exists) {
              const peer = createPeer(userId, socket.current.id, localStream);
              peersRef.current.push({ peerId: userId, peer });
              newPeers.push(peer);
            }
          }
        });
        if (newPeers.length) setPeers((prev) => [...prev, ...newPeers]);
      });

      socket.current.on('user_joined', (payload) => {
        if (!mounted.current || !localStream) return;
        const exists = peersRef.current.find((p) => p.peerId === payload.callerId);
        if (!exists) {
          const peer = addPeer(payload.signal, payload.callerId, localStream);
          peersRef.current.push({ peerId: payload.callerId, peer });
          setPeers((prev) => [...prev, peer]);
        } else {
          // if exists, still ensure we signal it
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

      socket.current.on('call_ended', () => {
        if (!mounted.current) return;
        setError('Call ended by the other user.');
        cleanUpCall(true);
      });

      socket.current.on('user_left', (id) => {
        if (!mounted.current) return;
        const peerObj = peersRef.current.find((p) => p.peerId === id);
        if (peerObj) {
          try { peerObj.peer.destroy(); } catch (e) { /* ignore */ }
        }
        peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
        setPeers((prevPeers) => prevPeers.filter((p) => p.peerId !== id));
        if (peersRef.current.length === 0) {
          setError('All participants left the call.');
          cleanUpCall(true);
        }
      });
    }

    // on unmount: perform destructive cleanup (disconnect socket etc.)
    return () => {
      mounted.current = false;
      // first run non-destructive cleanup to reset UI
      cleanUpCall(false);
      // then remove everything and disconnect
      performDestructiveCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only once on mount

  // start / accept logic in a separate effect so it doesn't recreate socket
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

  // attach local stream to local video element (UI only)
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream]);

  // Create a new Peer (initiator)
  const createPeer = (userToSignal, callerId, stream) => {
    if (!stream) {
      console.error('No local stream available for peer creation');
      return null;
    }
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      if (mounted.current && socket.current) {
        socket.current.emit('sending_signal', { userToSignal, callerId, signal });
      }
    });

    peer.on('stream', (remoteStream) => {
      // attach directly to remote video ref to avoid re-renders
      if (mounted.current) {
        attachRemoteStream(remoteStream);
      }
    });

    peer.on('close', () => {
      // remove from refs on close
      peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
      setPeers((prev) => prev.filter((p) => p !== peer));
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) {
        setError('Connection error occurred. Please try again.');
      }
    });

    return peer;
  };

  // Add a peer (non-initiator)
  const addPeer = (incomingSignal, callerId, stream) => {
    if (!stream) {
      console.error('No local stream available for adding peer');
      return null;
    }
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      if (mounted.current && socket.current) {
        socket.current.emit('returning_signal', { signal, callerId });
      }
    });

    peer.on('stream', (remoteStream) => {
      if (mounted.current) {
        attachRemoteStream(remoteStream);
      }
    });

    peer.on('close', () => {
      peersRef.current = peersRef.current.filter((p) => p.peer !== peer);
      setPeers((prev) => prev.filter((p) => p !== peer));
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) {
        setError('Connection error occurred. Please try again.');
      }
    });

    try {
      peer.signal(incomingSignal);
    } catch (e) {
      console.warn('signal error', e);
    }
    return peer;
  };

  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);

      if (socket.current) {
        socket.current.emit('video_call_request', { callerId: currentUserId, recipientId });
      }

      callTimeoutRef.current = setTimeout(() => {
        if (mounted.current && isCalling && !inCall) {
          setError('Call timed out. No answer.');
          cleanUpCall(true);
        }
      }, 40000);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
    }
  };

  const acceptVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setInCall(true);
      if (socket.current) {
        socket.current.emit('video_call_accept', { callerId: recipientId, roomId: callRoomId });
      }
      joinVideoRoom(callRoomId);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
    }
  };

  const joinVideoRoom = (roomId) => {
    if (socket.current && mounted.current) {
      socket.current.emit('join_video_room', roomId);
    }
  };

  const toggleAudioMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted((s) => !s);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled((s) => !s);
    }
  };

  const switchCamera = () => {
    setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));
  };

  const endCall = () => {
    // notify server about hangup and clean up UI
    if (socket.current) {
      try {
        if (isCalling && !inCall) {
          socket.current.emit('video_call_cancel', { recipientId });
        } else if (inCall) {
          socket.current.emit('end_call', callRoomId);
        }
      } catch (e) {
        /* ignore */
      }
    }
    cleanUpCall(true);
  };

  return (
    <div className="video-call-window">
      {error && <div className="error-message">{error}</div>}
      {isCalling && (
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
