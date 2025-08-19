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
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);

  const socket = useRef(null);
  const peersRef = useRef([]);
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

  const cleanUpCall = useCallback((navigateOnEnd = false) => {
    clearTimeout(callTimeoutRef.current);
    peersRef.current.forEach(({ peer }) => peer.destroy());
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (socket.current && mounted.current) {
      if (isCalling && !inCall) {
        socket.current.emit('video_call_cancel', { recipientId });
      } else if (inCall) {
        socket.current.emit('end_call', callRoomId);
      }
    }
    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    setPeers([]);
    peersRef.current = [];
    if (navigateOnEnd) {
      navigate(`/chat/${recipientId}`);
    }
  }, [isCalling, inCall, callRoomId, recipientId, navigate]);

  useEffect(() => {
    mounted.current = true;
    socket.current = io(apiUrl, {
      query: { userId: currentUserId, recipientId },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.current.on('connect', () => {
      console.log('Video socket connected');
      setError(null);
    });

    socket.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError('Failed to connect to server. Retrying...');
    });

    socket.current.on('video_call_accepted', ({ roomId }) => {
      if (mounted.current) {
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        setInCall(true);
        setCallRoomId(roomId);
        joinVideoRoom(roomId);
      }
    });

    socket.current.on('video_call_rejected', () => {
      if (mounted.current) {
        clearTimeout(callTimeoutRef.current);
        setError('Call rejected by the other user.');
        cleanUpCall(true);
      }
    });

    socket.current.on('video_call_canceled', () => {
      if (mounted.current) {
        setError('Call was canceled by the caller.');
        cleanUpCall(true);
      }
    });

    socket.current.on('all_users', (users) => {
      if (mounted.current && localStream) {
        const newPeers = [];
        users.forEach((userId) => {
          if (userId !== currentUserId) {
            const peer = createPeer(userId, socket.current.id, localStream);
            peersRef.current.push({ peerId: userId, peer });
            newPeers.push(peer);
          }
        });
        setPeers(newPeers);
      }
    });

    socket.current.on('user_joined', (payload) => {
      if (mounted.current && localStream) {
        const peer = addPeer(payload.signal, payload.callerId, localStream);
        peersRef.current.push({ peerId: payload.callerId, peer });
        setPeers((prevPeers) => [...prevPeers, peer]);
      }
    });

    socket.current.on('receiving_returned_signal', (payload) => {
      if (mounted.current) {
        const item = peersRef.current.find((p) => p.peerId === payload.id);
        if (item) {
          item.peer.signal(payload.signal);
        }
      }
    });

    socket.current.on('call_ended', () => {
      if (mounted.current) {
        setError('Call ended by the other user.');
        cleanUpCall(true);
      }
    });

    socket.current.on('user_left', (id) => {
      if (mounted.current) {
        const peerObj = peersRef.current.find((p) => p.peerId === id);
        if (peerObj) {
          peerObj.peer.destroy();
        }
        setPeers((prevPeers) => prevPeers.filter((p) => p.peerId !== id));
        peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
        if (peersRef.current.length === 0) {
          setError('All participants left the call.');
          cleanUpCall(true);
        }
      }
    });

    if (type === 'initiate') {
      startVideoCall();
    } else if (type === 'accept' && queryRoomId) {
      setCallRoomId(queryRoomId);
      acceptVideoCall();
    }

    return () => {
      mounted.current = false;
      if (socket.current) {
        socket.current.off('connect');
        socket.current.off('connect_error');
        socket.current.off('video_call_accepted');
        socket.current.off('video_call_rejected');
        socket.current.off('video_call_canceled');
        socket.current.off('all_users');
        socket.current.off('user_joined');
        socket.current.off('receiving_returned_signal');
        socket.current.off('call_ended');
        socket.current.off('user_left');
        socket.current.disconnect();
      }
      cleanUpCall();
    };
  }, [type, queryRoomId, cleanUpCall]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

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
      if (mounted.current) {
        socket.current.emit('sending_signal', { userToSignal, callerId, signal });
      }
    });

    peer.on('stream', (remoteStream) => {
      if (mounted.current) {
        setRemoteStream(remoteStream);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) {
        setError('Connection error occurred. Please try again.');
      }
    });

    return peer;
  };

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
      if (mounted.current) {
        socket.current.emit('returning_signal', { signal, callerId });
      }
    });

    peer.on('stream', (remoteStream) => {
      if (mounted.current) {
        setRemoteStream(remoteStream);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (mounted.current) {
        setError('Connection error occurred. Please try again.');
      }
    });

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
        if (isCalling && !inCall && mounted.current) {
          setError('Call timed out. No answer.');
          cleanUpCall(true);
        }
      }, 40000); // Increased timeout to 40 seconds
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
      socket.current.emit('video_call_accept', { callerId: recipientId, roomId: callRoomId });
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
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const switchCamera = () => {
    setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));
  };

  const endCall = () => {
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