// src/components/VideoCall.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const VideoCall = () => {
  const { userId: recipientUserId } = useParams();            // recipient's USER id (not socket.id)
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');                      // 'initiate' or 'accept'
  const queryRoomId = searchParams.get('roomId');             // optional roomId for accept side
  const currentUserId = localStorage.getItem('userId');       // caller's USER id
  const apiUrl = import.meta.env.VITE_SOCKET_URL;             // Socket.IO URL (wss/https in prod)
  const navigate = useNavigate();

  // Media and call state
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');   // 'remote' | 'local'

  // internal refs
  const socket = useRef(null);
  const peersRef = useRef([]);      // [{ peerId: socket.id, peer }]
  const callTimeoutRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const initDoneRef = useRef(false);
  const callerSocketIdRef = useRef(null); // set when recipient receives incoming call

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

  // ---------- Helpers ----------
  const log = (...args) => console.log('[VideoCall]', ...args);

  const stopTracks = useCallback(() => {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
  }, [localStream]);

  const destroyPeers = useCallback(() => {
    peersRef.current.forEach(({ peer }) => {
      try { peer.destroy(); } catch {}
    });
    peersRef.current = [];
  }, []);

  const cleanUpCall = useCallback((emitEnd = true) => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    destroyPeers();
    stopTracks();

    try {
      if (socket.current) {
        if (emitEnd && inCall && callRoomId) {
          socket.current.emit('end_call', callRoomId);
        }
        socket.current.offAny(); // remove all listeners
        socket.current.disconnect();
      }
    } catch {}

    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    callerSocketIdRef.current = null;
  }, [destroyPeers, stopTracks, inCall, callRoomId]);

  const endCall = useCallback(() => {
    cleanUpCall();
    navigate(-1);
  }, [cleanUpCall, navigate]);

  // Attach streams to video tags
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true; // avoid feedback/echo locally
      localVideoRef.current.playsInline = true;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = false; // ensure we hear remote
      remoteVideoRef.current.playsInline = true;
      const play = async () => {
        try { await remoteVideoRef.current.play(); } catch {}
      };
      play();
    }
  }, [remoteStream]);

  // ---------- Peer creation ----------
  const createPeer = (userToSignalSocketId, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.current.emit('sending_signal', {
        userToSignal: userToSignalSocketId,  // target socket.id
        signal,
      });
    });

    // For older browsers simple-peer 'stream' is enough.
    peer.on('stream', (rstream) => setRemoteStream(rstream));

    // For modern browsers (unified plan), 'track' is more reliable:
    peer.on('track', (track, stream) => {
      if (track.kind === 'video' || track.kind === 'audio') {
        setRemoteStream(stream);
      }
    });

    peer.on('connect', () => log('peer connected (initiator)'));
    peer.on('error', (err) => log('peer error (initiator):', err));
    peer.on('close', () => log('peer closed (initiator)'));

    return peer;
  };

  const addPeer = (incomingSignal, callerSocketId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.current.emit('returning_signal', {
        signal,
        callerId: callerSocketId, // target original initiator socket.id
      });
    });

    peer.on('stream', (rstream) => setRemoteStream(rstream));
    peer.on('track', (track, stream) => {
      if (track.kind === 'video' || track.kind === 'audio') {
        setRemoteStream(stream);
      }
    });

    peer.on('connect', () => log('peer connected (receiver)'));
    peer.on('error', (err) => log('peer error (receiver):', err));
    peer.on('close', () => log('peer closed (receiver)'));

    // Important: feed the incoming offer/answer
    peer.signal(incomingSignal);
    return peer;
  };

  // ---------- Flow ----------
  const joinVideoRoom = (roomId) => {
    if (!roomId) return;
    log('join room', roomId);
    socket.current.emit('join_video_room', roomId);
  };

  const ensureLocalStream = async () => {
    if (localStream) return localStream;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    return stream;
  };

  // Caller side: start ring and wait for accept
  const startVideoCall = async () => {
    try {
      const stream = await ensureLocalStream();
      const roomId = [currentUserId, recipientUserId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);

      // Start ringing (60s timeout)
      socket.current.emit(
        'video_call_request',
        { callerId: currentUserId, recipientId: recipientUserId },
        ({ status }) => log('call request ack:', status)
      );

      callTimeoutRef.current = setTimeout(() => {
        if (isCalling) {
          alert('No answer. Call timed out.');
          endCall();
        }
      }, 60_000);

      // When callee accepts, we’ll be told to join room:
      socket.current.on('video_call_accepted', ({ roomId }) => {
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        setInCall(true);
        joinVideoRoom(roomId);
      });

      // If callee rejects/cancels:
      socket.current.on('video_call_rejected', () => {
        clearTimeout(callTimeoutRef.current);
        alert('Call rejected.');
        endCall();
      });

      socket.current.on('video_call_canceled', () => {
        alert('Call was cancelled.');
        endCall();
      });

      // Once we join, server returns all existing sockets in the room (the callee).
      socket.current.on('all_users', async (users) => {
        const s = await ensureLocalStream(); // double-ensure stream is available
        users.forEach((socketId) => {
          const peer = createPeer(socketId, s);
          peersRef.current.push({ peerId: socketId, peer });
        });
      });

      // When callee creates/returns answer:
      socket.current.on('user_joined', (payload) => {
        // Not used on caller (we are initiator), but keep for robustness
        const { signal, callerId } = payload;
        const exists = peersRef.current.find((p) => p.peerId === callerId);
        if (!exists) {
          ensureLocalStream().then((s) => {
            const peer = addPeer(signal, callerId, s);
            peersRef.current.push({ peerId: callerId, peer });
          });
        }
      });

      socket.current.on('receiving_returned_signal', (payload) => {
        const item = peersRef.current.find((p) => p.peerId === payload.id);
        if (item) item.peer.signal(payload.signal);
      });

    } catch (err) {
      console.error(err);
      alert('Camera / Mic permission denied or unavailable.');
      endCall();
    }
  };

  // Callee side: accept incoming request (we’re already on the accept route)
  const acceptVideoCall = async () => {
    try {
      const stream = await ensureLocalStream();
      setInCall(true);

      // We need the caller's socket.id to reply precisely:
      // It should be passed to this page (e.g., through navigation) OR
      // we subscribed to 'incoming_video_call' earlier in your app and navigated here with query params.
      // In this component, we’ll read callerSocketId from search params if present; otherwise rely on memory:
      const callerSocketIdFromQuery = searchParams.get('callerSocketId');
      const callerSocketId =
        callerSocketIdFromQuery || callerSocketIdRef.current;
      if (!callerSocketId) {
        console.warn('No callerSocketId known; answering anyway (caller must be listening).');
      }

      socket.current.emit('video_call_accept', {
        callerSocketId,
        roomId: callRoomId,
      });

      joinVideoRoom(callRoomId);

      // When we join, server will NOT send any users if we joined first.
      // If the caller is already in, we’ll get them via 'user_joined'.
      socket.current.on('all_users', async (users) => {
        // If caller joined first, we’ll see them here and initiate towards them
        const s = await ensureLocalStream();
        users.forEach((socketId) => {
          const peer = createPeer(socketId, s);
          peersRef.current.push({ peerId: socketId, peer });
        });
      });

      // The usual simple-peer handshake for the non-initiator:
      socket.current.on('user_joined', (payload) => {
        const { signal, callerId } = payload; // callerId is socket.id of the initiator
        ensureLocalStream().then((s) => {
          const peer = addPeer(signal, callerId, s);
          peersRef.current.push({ peerId: callerId, peer });
        });
      });

      socket.current.on('receiving_returned_signal', (payload) => {
        const item = peersRef.current.find((p) => p.peerId === payload.id);
        if (item) item.peer.signal(payload.signal);
      });

    } catch (err) {
      console.error(err);
      alert('Camera / Mic permission denied or unavailable.');
      endCall();
    }
  };

  // ---------- Socket lifecycle ----------
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    // Build socket connection
    socket.current = io(apiUrl, {
      query: { userId: currentUserId, recipientId: recipientUserId },
      transports: ['websocket'],
    });

    socket.current.on('connect', () => log('socket connected', socket.current.id));
    socket.current.on('disconnect', () => log('socket disconnected'));

    // If this component is also used to receive the incoming ring:
    socket.current.on('incoming_video_call', ({ callerId, callerSocketId, roomId }) => {
      log('incoming call from', callerId, 'callerSocketId=', callerSocketId, 'room=', roomId);
      callerSocketIdRef.current = callerSocketId;
      // If we arrived with type=accept, we already know roomId via query param.
      if (!queryRoomId) setCallRoomId(roomId);
    });

    // Global call end / peer leave
    socket.current.on('call_ended', () => {
      alert('Call ended.');
      endCall();
    });

    socket.current.on('user_left', (socketId) => {
      const idx = peersRef.current.findIndex((p) => p.peerId === socketId);
      if (idx >= 0) {
        try { peersRef.current[idx].peer.destroy(); } catch {}
        peersRef.current.splice(idx, 1);
      }
      if (peersRef.current.length === 0) endCall();
    });

    // Kick off per route
    if (type === 'initiate') {
      // Caller: get local media first, then start ring
      ensureLocalStream().then(() => startVideoCall());
    } else if (type === 'accept') {
      // Callee: roomId required (query or from incoming event)
      const rid = queryRoomId || callRoomId || [currentUserId, recipientUserId].sort().join('_');
      setCallRoomId(rid);
      ensureLocalStream().then(() => acceptVideoCall());
    }

    return () => cleanUpCall(false); // don’t re-emit end_call on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Controls ----------
  const toggleAudioMute = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsAudioMuted((m) => !m);
  };

  const toggleVideo = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsVideoEnabled((v) => !v);
  };

  const switchCamera = () => setActiveVideo((v) => (v === 'remote' ? 'local' : 'remote'));

  // ---------- UI ----------
  return (
    <div className="video-call-wrapper">
      {/* Ringing overlay */}
      {isCalling && (
        <div className="call-overlay">
          <p>Calling…</p>
          <button onClick={endCall} className="btn decline">Hang up</button>
        </div>
      )}

      {/* Video stage */}
      {(isCalling || inCall) && (
        <div className="video-stage">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`remote-video ${activeVideo === 'remote' ? 'max' : 'min'}`}
            onClick={switchCamera}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`local-video ${activeVideo === 'local' ? 'max' : 'min'}`}
            onClick={switchCamera}
          />
        </div>
      )}

      {/* Controls */}
      {inCall && (
        <div className="call-controls">
          <button onClick={toggleAudioMute} title="Mute / Unmute">
            {isAudioMuted ? '🎤✖' : '🎤'}
          </button>
          <button onClick={toggleVideo} title="Video on / off">
            {isVideoEnabled ? '📹' : '📹✖'}
          </button>
          <button onClick={endCall} className="btn decline" title="End call">
            📞
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
