import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import '../Designs/Chat.css';

const VideoCall = ({
  socket,
  recipientId,
  incomingCall: initialIncomingCall,
  caller: initialCaller,
  callRoomId: initialCallRoomId,
  isCalling: initialIsCalling,
  onClose
}) => {
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]);
  const [incomingCall, setIncomingCall] = useState(initialIncomingCall);
  const [caller, setCaller] = useState(initialCaller);
  const [callRoomId, setCallRoomId] = useState(initialCallRoomId);
  const [isCalling, setIsCalling] = useState(initialIsCalling);

  const peersRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);

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

  useEffect(() => {
    if (isCalling) {
      startVideoCall();
    }

    socket.on('video_call_accepted', ({ roomId }) => {
      clearTimeout(callTimeoutRef.current);
      setIsCalling(false);
      setInCall(true);
      joinVideoRoom(roomId);
    });

    socket.on('all_users', (users) => {
      const newPeers = [];
      users.forEach((userId) => {
        const peer = createPeer(userId, socket.id, localStream);
        peersRef.current.push({ peerId: userId, peer });
        newPeers.push(peer);
      });
      setPeers(newPeers);
    });

    socket.on('user_joined', (payload) => {
      const peer = addPeer(payload.signal, payload.callerId, localStream);
      peersRef.current.push({ peerId: payload.callerId, peer });
      setPeers((prevPeers) => [...prevPeers, peer]);
    });

    socket.on('receiving_returned_signal', (payload) => {
      const item = peersRef.current.find((p) => p.peerId === payload.id);
      if (item) {
        item.peer.signal(payload.signal);
      }
    });

    socket.on('call_ended', () => {
      endCall();
    });

    socket.on('user_left', (id) => {
      const peerObj = peersRef.current.find((p) => p.peerId === id);
      if (peerObj) {
        peerObj.peer.destroy();
      }
      setPeers((prevPeers) => prevPeers.filter((p) => p.peerId !== id));
      if (peersRef.current.length === 0) {
        endCall();
      }
    });

    return () => {
      socket.off('video_call_accepted');
      socket.off('all_users');
      socket.off('user_joined');
      socket.off('receiving_returned_signal');
      socket.off('call_ended');
      socket.off('user_left');
      clearTimeout(callTimeoutRef.current);
      endCall();
    };
  }, [isCalling, localStream]);

  const createPeer = (userToSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('sending_signal', { userToSignal, callerId, signal });
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
      socket.emit('returning_signal', { signal, callerId });
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
      const roomId = [localStorage.getItem('userId'), recipientId].sort().join('_');
      setCallRoomId(roomId);
      socket.emit('video_call_request', { callerId: localStorage.getItem('userId'), recipientId });
      callTimeoutRef.current = setTimeout(() => {
        if (isCalling) {
          endCall();
        }
      }, 20000);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      onClose();
    }
  };

  const acceptVideoCall = async () => {
    setIncomingCall(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setInCall(true);
      socket.emit('video_call_accept', { callerId: caller, recipientId: localStorage.getItem('userId'), roomId: callRoomId });
      joinVideoRoom(callRoomId);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      onClose();
    }
  };

  const rejectVideoCall = () => {
    setIncomingCall(false);
    socket.emit('video_call_reject', { callerId: caller });
    onClose();
  };

  const joinVideoRoom = (roomId) => {
    socket.emit('join_video_room', roomId);
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

  const endCall = () => {
    clearTimeout(callTimeoutRef.current);
    peersRef.current.forEach(({ peer }) => peer.destroy());
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (isCalling) {
      socket.emit('video_call_cancel', { recipientId });
    } else if (inCall) {
      socket.emit('end_call', callRoomId);
    }
    setInCall(false);
    setIsCalling(false);
    setIncomingCall(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCallRoomId(null);
    setPeers([]);
    setCaller(null);
    peersRef.current = [];
    onClose();
  };

  const switchCamera = () => {
    setActiveVideo(prev => prev === 'remote' ? 'local' : 'remote');
  };

  return (
    <div className="video-call-window">
      {incomingCall && (
        <div className="incoming-call">
          <p>Incoming call</p>
          <button onClick={acceptVideoCall}>Accept</button>
          <button onClick={rejectVideoCall}>Reject</button>
        </div>
      )}
      {isCalling && (
        <div className="ringing">
          <p>Ringing...</p>
          <button onClick={endCall}>Cancel</button>
        </div>
      )}
      {(inCall || isCalling) && (
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