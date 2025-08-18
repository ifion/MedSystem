// VideoCall.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/Chat.css';

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

  const socket = useRef(null);
  const peersRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // FIX: keep the timer in a ref so we can clear it on unmount
  const callTimeoutRef = useRef(null);
  // FIX: flag that guarantees we run the call logic only once
  const initDoneRef = useRef(false);

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

  const cleanUpCall = useCallback(() => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    peersRef.current.forEach(({ peer }) => peer.destroy());
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (socket.current) {
      if (isCalling) {
        socket.current.emit('video_call_cancel', { recipientId });
      } else if (inCall) {
        socket.current.emit('end_call', callRoomId);
      }
      socket.current.disconnect();
    }
    setInCall(false);
    setIsCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    setPeers([]);
    peersRef.current = [];
  }, [isCalling, inCall, callRoomId, recipientId]);

  useEffect(() => {
    // FIX: prevent double initialisation in strict-mode
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
      alert('Call rejected by the other user.');
      endCall();
    });

    socket.current.on('video_call_canceled', () => {
      alert('Call was canceled by the caller.');
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
      setPeers((prevPeers) => [...prevPeers, peer]);
    });

    socket.current.on('receiving_returned_signal', (payload) => {
      const item = peersRef.current.find((p) => p.peerId === payload.id);
      if (item) {
        item.peer.signal(payload.signal);
      }
    });

    socket.current.on('call_ended', () => {
      endCall();
    });

    socket.current.on('user_left', (id) => {
      const peerObj = peersRef.current.find((p) => p.peerId === id);
      if (peerObj) {
        peerObj.peer.destroy();
      }
      setPeers((prevPeers) => prevPeers.filter((p) => p.peerId !== id));
      peersRef.current = peersRef.current.filter((p) => p.peerId !== id);
      if (peersRef.current.length === 0) {
        endCall();
      }
    });

    if (type === 'initiate') {
      startVideoCall();
    } else if (type === 'accept' && queryRoomId) {
      setCallRoomId(queryRoomId);
      acceptVideoCall();
    }

    // FIX: clean everything on unmount
    return () => {
      cleanUpCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

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
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.current.emit('sending_signal', { userToSignal, callerId, signal });
    });

    peer.on('stream', (remoteStream) => {
      setRemoteStream(remoteStream);
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.current.emit('returning_signal', { signal, callerId });
    });

    peer.on('stream', (remoteStream) => {
      setRemoteStream(remoteStream);
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
        if (isCalling) {
          endCall();
          alert('Call timed out. No answer.');
        }
      }, 20000);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert('Failed to access camera/microphone.');
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
      alert('Failed to access camera/microphone.');
    }
  };

  const joinVideoRoom = (roomId) => {
    socket.current.emit('join_video_room', roomId);
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
    cleanUpCall();
    navigate(-1);
  };

  return (
    <div className="video-call-window">
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
            className={
              isCalling || inCall
                ? inCall && activeVideo === 'local'
                  ? 'maximized'
                  : 'minimized'
                : 'hidden'
            }
            onClick={switchCamera}
          />
        </div>
      )}
      {inCall && (
        <div className="call-controls">
          <button onClick={toggleAudioMute}>
            {isAudioMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={toggleVideo}>
            {isVideoEnabled ? 'Video Off' : 'Video On'}
          </button>
          <button onClick={endCall}>End Call</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;