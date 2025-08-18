// VideoCall.jsx
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

  const [localStream, setLocalStream]   = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCalling, setIsCalling]       = useState(false);
  const [inCall, setInCall]             = useState(false);
  const [callRoomId, setCallRoomId]     = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo]   = useState('remote');
  const [peers, setPeers]               = useState([]);

  const socket = useRef(null);
  const peersRef = useRef([]);
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const initDoneRef    = useRef(false);

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

  const stopTracks = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
  }, [localStream]);

  const cleanUpCall = useCallback(() => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    peersRef.current.forEach(({ peer }) => peer.destroy());
    stopTracks();
    if (socket.current) {
      if (isCalling) socket.current.emit('video_call_cancel', { recipientId });
      else if (inCall) socket.current.emit('end_call', callRoomId);
      socket.current.disconnect();
    }
    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    setPeers([]);
    peersRef.current = [];
  }, [isCalling, inCall, callRoomId, recipientId, stopTracks]);

  const endCall = useCallback(() => {
    cleanUpCall();
    navigate(-1);
  }, [cleanUpCall, navigate]);

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    socket.current = io(apiUrl, {
      query: { userId: currentUserId, recipientId },
      transports: ['websocket'],
    });

    socket.current.on('connect', () => console.log('Video socket connected'));

    socket.current.on('video_call_accepted', ({ roomId }) => {
      clearTimeout(callTimeoutRef.current);
      setIsCalling(false);
      setInCall(true);
      joinVideoRoom(roomId);
    });

    socket.current.on('video_call_rejected', () => {
      clearTimeout(callTimeoutRef.current);
      alert('Call rejected.');
      endCall();
    });

    socket.current.on('video_call_canceled', () => {
      alert('Call was cancelled.');
      endCall();
    });

    socket.current.on('all_users', (users) => {
      const newPeers = [];
      users.forEach((userId) => {
        const peer = createPeer(userId, socket.current.id, localStream);
        peersRef.current.push({ peerId: userId, peer });
        newPeers.push(peer);
      });
      setPeers(newPeers);
    });

    socket.current.on('user_joined', (payload) => {
      const peer = addPeer(payload.signal, payload.callerId, localStream);
      peersRef.current.push({ peerId: payload.callerId, peer });
      setPeers((prev) => [...prev, peer]);
    });

    socket.current.on('receiving_returned_signal', (payload) => {
      const item = peersRef.current.find((p) => p.peerId === payload.id);
      if (item) item.peer.signal(payload.signal);
    });

    socket.current.on('call_ended', () => {
      endCall();
    });

    socket.current.on('user_left', (id) => {
      const peerObj = peersRef.current.find((p) => p.peerId === id);
      if (peerObj) peerObj.peer.destroy();
      setPeers((prev) => prev.filter((p) => p.peerId !== id));
      peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
      if (peersRef.current.length === 0) endCall();
    });

    if (type === 'initiate') startVideoCall();
    else if (type === 'accept' && queryRoomId) {
      setCallRoomId(queryRoomId);
      acceptVideoCall();
    }

    return () => cleanUpCall();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const createPeer = (userToSignal, callerId, stream) => {
    const peer = new Peer({ initiator: true, trickle: false, config: configuration, stream });
    peer.on('signal', (signal) =>
      socket.current.emit('sending_signal', { userToSignal, callerId, signal })
    );
    peer.on('stream', (remoteStream) => setRemoteStream(remoteStream));
    return peer;
  };

  const addPeer = (incomingSignal, callerId, stream) => {
    const peer = new Peer({ initiator: false, trickle: false, config: configuration, stream });
    peer.on('signal', (signal) =>
      socket.current.emit('returning_signal', { signal, callerId })
    );
    peer.on('stream', (remoteStream) => setRemoteStream(remoteStream));
    peer.signal(incomingSignal);
    return peer;
  };

  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);
      socket.current.emit('video_call_request', { callerId: currentUserId, recipientId });
      callTimeoutRef.current = setTimeout(() => {
        if (isCalling) {
          alert('Call timed out.');
          endCall();
        }
      }, 20000);
    } catch (err) {
      console.error(err);
      alert('Camera / Mic permission denied.');
    }
  };

  const acceptVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setInCall(true);
      socket.current.emit('video_call_accept', { callerId: recipientId, roomId: callRoomId });
      joinVideoRoom(callRoomId);
    } catch (err) {
      console.error(err);
      alert('Camera / Mic permission denied.');
    }
  };

  const joinVideoRoom = (roomId) => socket.current.emit('join_video_room', roomId);

  const toggleAudioMute = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsAudioMuted(!isAudioMuted);
  };

  const toggleVideo = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsVideoEnabled(!isVideoEnabled);
  };

  const switchCamera = () =>
    setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));

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