// src/components/VideoCall.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const VideoCall = () => {
  const { userId: recipientUserId } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const queryRoomId = searchParams.get('roomId');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL;
  const navigate = useNavigate();

  /* ---------- state ---------- */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [callDuration, setCallDuration] = useState(0); // seconds

  /* ---------- refs ---------- */
  const socket = useRef(null);
  const peersRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callTimerRef = useRef(null);
  const initDoneRef = useRef(false);

  /* ---------- ICE config ---------- */
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

  /* ---------- helpers ---------- */
  const stopTracks = () => {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
  };

  const destroyPeers = () => {
    peersRef.current.forEach(({ peer }) => {
      try {
        peer.destroy();
      } catch {}
    });
    peersRef.current = [];
  };

  const cleanUpCall = useCallback((emitEnd = true) => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    destroyPeers();
    stopTracks();
    if (socket.current) {
      if (emitEnd && inCall && callRoomId) {
        socket.current.emit('end_call', callRoomId);
      }
      socket.current.offAny?.();
      socket.current.disconnect();
    }
    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    setCallDuration(0);
  }, [inCall, callRoomId]);

  const endCall = useCallback(() => {
    cleanUpCall();
    navigate(-1);
  }, [cleanUpCall, navigate]);

  /* ---------- media attach ---------- */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.playsInline = true;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = false;
      remoteVideoRef.current.playsInline = true;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  /* ---------- peer helpers ---------- */
  const createPeer = (targetSocketId, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });
    peer.on('signal', (signal) =>
      socket.current.emit('sending_signal', { userToSignal: targetSocketId, signal })
    );
    peer.on('stream', (rstream) => setRemoteStream(rstream));
    peer.on('track', (_, rstream) => setRemoteStream(rstream));
    return peer;
  };

  const addPeer = (incomingSignal, callerSocketId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });
    peer.on('signal', (signal) =>
      socket.current.emit('returning_signal', { signal, callerId: callerSocketId })
    );
    peer.on('stream', (rstream) => setRemoteStream(rstream));
    peer.on('track', (_, rstream) => setRemoteStream(rstream));
    peer.signal(incomingSignal);
    return peer;
  };

  /* ---------- flow ---------- */
  const ensureLocalStream = async () => {
    if (localStream) return localStream;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    return stream;
  };

  const startVideoCall = async () => {
    try {
      const stream = await ensureLocalStream();
      const roomId = [currentUserId, recipientUserId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);

      socket.current.emit('video_call_request', { callerId: currentUserId, recipientId: recipientUserId });
      callTimeoutRef.current = setTimeout(() => {
        if (isCalling) {
          alert('Call timed out (60 s).');
          endCall();
        }
      }, 60_000);

      socket.current.on('video_call_accepted', ({ roomId }) => {
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        setInCall(true);
        socket.current.emit('join_video_room', roomId);
      });

      socket.current.on('video_call_rejected', () => {
        clearTimeout(callTimeoutRef.current);
        alert('Call rejected.');
        endCall();
      });

      socket.current.on('video_call_canceled', () => {
        alert('Call cancelled.');
        endCall();
      });

      socket.current.on('all_users', (users) => {
        ensureLocalStream().then((s) => {
          users.forEach((id) => {
            const peer = createPeer(id, s);
            peersRef.current.push({ peerId: id, peer });
          });
        });
      });

      socket.current.on('user_joined', ({ signal, callerId }) => {
        ensureLocalStream().then((s) => {
          const peer = addPeer(signal, callerId, s);
          peersRef.current.push({ peerId: callerId, peer });
        });
      });

      socket.current.on('receiving_returned_signal', ({ signal, id }) => {
        const item = peersRef.current.find((p) => p.peerId === id);
        if (item) item.peer.signal(signal);
      });
    } catch (err) {
      console.error(err);
      alert('Could not access camera or microphone.');
      endCall();
    }
  };

  const acceptVideoCall = async () => {
    try {
      const stream = await ensureLocalStream();
      setInCall(true);

      socket.current.emit('video_call_accept', {
        callerSocketId: searchParams.get('callerSocketId'),
        roomId: callRoomId || queryRoomId,
      });

      socket.current.emit('join_video_room', callRoomId || queryRoomId);

      socket.current.on('all_users', (users) => {
        ensureLocalStream().then((s) => {
          users.forEach((id) => {
            const peer = createPeer(id, s);
            peersRef.current.push({ peerId: id, peer });
          });
        });
      });

      socket.current.on('user_joined', ({ signal, callerId }) => {
        ensureLocalStream().then((s) => {
          const peer = addPeer(signal, callerId, s);
          peersRef.current.push({ peerId: callerId, peer });
        });
      });

      socket.current.on('receiving_returned_signal', ({ signal, id }) => {
        const item = peersRef.current.find((p) => p.peerId === id);
        if (item) item.peer.signal(signal);
      });
    } catch (err) {
      console.error(err);
      alert('Could not access camera or microphone.');
      endCall();
    }
  };

  /* ---------- socket lifecycle ---------- */
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    socket.current = io(apiUrl, {
      query: { userId: currentUserId, recipientId: recipientUserId },
      transports: ['websocket'],
    });

    socket.current.on('connect', () => console.log('[VideoCall] socket connected', socket.current.id));
    socket.current.on('disconnect', () => console.log('[VideoCall] socket disconnected'));

    socket.current.on('call_ended', () => {
      alert('The other user ended the call.');
      endCall();
    });

    socket.current.on('user_left', (socketId) => {
      const idx = peersRef.current.findIndex((p) => p.peerId === socketId);
      if (idx >= 0) {
        try {
          peersRef.current[idx].peer.destroy();
        } catch {}
        peersRef.current.splice(idx, 1);
      }
      if (peersRef.current.length === 0) endCall();
    });

    if (type === 'initiate') startVideoCall();
    else if (type === 'accept') acceptVideoCall();

    return () => cleanUpCall(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- call timer ---------- */
  useEffect(() => {
    if (!inCall) return;
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(callTimerRef.current);
  }, [inCall]);

  /* ---------- controls ---------- */
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

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-call-wrapper">
      {/* Ringing overlay */}
      {isCalling && (
        <div className="call-overlay">
          <p>Calling…</p>
          <button onClick={endCall} className="btn decline">
            Hang up
          </button>
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

      {/* Controls & timer */}
      {inCall && (
        <div className="call-controls">
          <div className="duration">{formatDuration(callDuration)}</div>
          <button onClick={toggleAudioMute} title="Mute/Unmute">
            {isAudioMuted ? '🎤✖' : '🎤'}
          </button>
          <button onClick={toggleVideo} title="Video on/off">
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