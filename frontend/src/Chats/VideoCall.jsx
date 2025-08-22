// VideoCall.jsx (updated with improvements)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css';

const VideoCall = () => {
  const { userId: recipientId } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const roomIdParam = searchParams.get('roomId');
  const callerSocketIdParam = searchParams.get('callerSocketId');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL;
  const navigate = useNavigate();

  // UI / state
  const [localStream, setLocalStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [ringing, setRinging] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoQuality, setVideoQuality] = useState('medium'); // low, medium, high
  const [cameras, setCameras] = useState([]);
  const [currentCamera, setCurrentCamera] = useState('user'); // 'user' or 'environment'
  const [isFullScreen, setIsFullScreen] = useState(false);

  // refs
  const socket = useRef(null);
  const peersRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const callTimerRef = useRef(null);
  const mounted = useRef(false);
  const localStreamRef = useRef(null);
  const isCallingRef = useRef(false);
  const inCallRef = useRef(false);
  const callRoomIdRef = useRef(null);
  const videoContainerRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  const getConstraints = () => {
    let videoConstraints = {
      facingMode: currentCamera,
    };
    switch (videoQuality) {
      case 'low':
        videoConstraints.width = { ideal: 320 };
        videoConstraints.height = { ideal: 240 };
        videoConstraints.frameRate = { ideal: 15 };
        break;
      case 'high':
        videoConstraints.width = { ideal: 1920 };
        videoConstraints.height = { ideal: 1080 };
        videoConstraints.frameRate = { ideal: 60 };
        break;
      default: // medium
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
        videoConstraints.frameRate = { ideal: 30 };
        break;
    }
    return {
      video: videoConstraints,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  };

  const configuration = {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:standard.relay.metered.ca:80",
        username: "3d1a139e6497e7e4cbaaba10",
        credential: "X6SnS8201JnFZ5jX",
      },
      {
        urls: "turn:standard.relay.metered.ca:80?transport=tcp",
        username: "3d1a139e6497e7e4cbaaba10",
        credential: "X6SnS8201JnFZ5jX",
      },
      {
        urls: "turn:standard.relay.metered.ca:443",
        username: "3d1a139e6497e7e4cbaaba10",
        credential: "X6SnS8201JnFZ5jX",
      },
      {
        urls: "turns:standard.relay.metered.ca:443?transport=tcp",
        username: "3d1a139e6497e7e4cbaaba10",
        credential: "X6SnS8201JnFZ5jX",
      },
    ],
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan',
    offerOptions: {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    },
    sdpTransform: (sdp) => {
      // Increase bandwidth for better quality
      let newSdp = sdp.replace(/b=AS:30/g, 'b=AS:2000'); // For video
      newSdp = newSdp.replace(/b=AS:50/g, 'b=AS:2000'); // Adjust as needed
      return newSdp;
    },
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

  const cleanUpCall = useCallback((navigateOnEnd = false, emitToServer = true) => {
    clearTimeout(callTimeoutRef.current);
    clearTimeout(incomingTimeoutRef.current);
    clearInterval(callTimerRef.current);

    peersRef.current.forEach(({ peer }) => {
      try { peer.destroy(); } catch (e) { /* ignore */ }
    });
    peersRef.current = [];
    setPeers([]);

    if (localStreamRef.current) {
      stopStreamTracks(localStreamRef.current);
      localStreamRef.current = null;
    }

    try {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        stopStreamTracks(remoteVideoRef.current.srcObject);
        remoteVideoRef.current.srcObject = null;
      }
    } catch (e) {
      console.error('Error stopping remote video tracks:', e);
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (emitToServer && socket.current) {
      try {
        if (isCallingRef.current && !inCallRef.current) {
          socket.current.emit('video_call_cancel', { recipientId });
        } else if (inCallRef.current) {
          socket.current.emit('end_call', callRoomIdRef.current);
        }
      } catch (e) {
        console.warn('Error emitting call end to server:', e);
      }
    }

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
    setIsScreenSharing(false);
    setIsFullScreen(false);

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

    peer.on('signal', (signal) => {
      if (mounted.current && socket.current) {
        socket.current.emit('sending_signal', {
          userToSignal: userToSignalSocketId,
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

  const getMediaStream = async () => {
    try {
      const constraints = getConstraints();
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stream.getVideoTracks().length > 0) {
        originalVideoTrackRef.current = stream.getVideoTracks()[0];
      }
      return stream;
    } catch (err) {
      console.error('Media device error:', err);
      throw err;
    }
  };

  const startVideoCall = async () => {
    if (isCalling || inCall) {
      console.warn('Call already in progress or initiated');
      return;
    }
    try {
      const stream = await getMediaStream();
      setLocalStream(stream);
      localStreamRef.current = stream;

      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      callRoomIdRef.current = roomId;
      setIsCalling(true);
      isCallingRef.current = true;
      setError(null);

      if (socket.current) {
        socket.current.emit('video_call_request', { callerId: currentUserId, recipientId, roomId });
      }

      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        if (mounted.current && isCallingRef.current && !inCallRef.current) {
          setError('Call timed out after 60 seconds.');
          cleanUpCall(true, true);
        }
      }, 60000);
    } catch (err) {
      setError('Failed to access camera/microphone. Check permissions.');
      cleanUpCall(true, true);
    }
  };

  const acceptVideoCall = async () => {
    if (inCall || !incomingCall) {
      console.warn('Already in call or no incoming call');
      return;
    }
    try {
      const stream = await getMediaStream();
      setLocalStream(stream);
      localStreamRef.current = stream;
      setInCall(true);
      inCallRef.current = true;
      setCallRoomId(incomingCall.roomId);
      callRoomIdRef.current = incomingCall.roomId;
      setRinging(false);
      setIncomingCall(null);
      clearTimeout(incomingTimeoutRef.current);

      if (socket.current) {
        socket.current.emit('video_call_accept', {
          callerSocketId: incomingCall.callerSocketId,
          roomId: incomingCall.roomId,
        });
      }
      startCallTimer();
    } catch (err) {
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

  const switchCamera = async () => {
    const newFacingMode = currentCamera === 'user' ? 'environment' : 'user';
    setCurrentCamera(newFacingMode);
    if (localStreamRef.current) {
      stopStreamTracks(localStreamRef.current);
    }
    try {
      const stream = await getMediaStream();
      setLocalStream(stream);
      localStreamRef.current = stream;
      originalVideoTrackRef.current = stream.getVideoTracks()[0];

      // Replace track in peer
      if (peersRef.current.length > 0) {
        const sender = peersRef.current[0].peer.getSenders().find((s) => s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(stream.getVideoTracks()[0]);
        }
      }
    } catch (err) {
      setError('Failed to switch camera.');
    }
  };

  const toggleScreenSharing = async () => {
    if (isScreenSharing) {
      // Stop sharing, go back to camera
      if (localStreamRef.current) {
        const screenTrack = localStreamRef.current.getVideoTracks()[0];
        screenTrack.stop();
      }
      try {
        const cameraStream = await getMediaStream();
        const cameraTrack = cameraStream.getVideoTracks()[0];
        setLocalStream(cameraStream);
        localStreamRef.current = cameraStream;
        originalVideoTrackRef.current = cameraTrack;

        // Replace track in peer
        if (peersRef.current.length > 0) {
          const sender = peersRef.current[0].peer.getSenders().find((s) => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(cameraTrack);
          }
        }
        setIsScreenSharing(false);
      } catch (err) {
        setError('Failed to switch back to camera.');
      }
    } else {
      // Start sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => toggleScreenSharing(); // Auto stop when share ends
        setLocalStream(screenStream);
        localStreamRef.current = screenStream;

        // Replace track in peer
        if (peersRef.current.length > 0) {
          const sender = peersRef.current[0].peer.getSenders().find((s) => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }
        setIsScreenSharing(true);
      } catch (err) {
        setError('Failed to start screen sharing.');
      }
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().then(() => setIsFullScreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullScreen(false));
    }
  };

  const changeVideoQuality = (quality) => {
    setVideoQuality(quality);
    // Restart stream with new quality
    switchCamera(); // Reuse to restart
  };

  const switchView = () => {
    setActiveVideo((prev) => (prev === 'remote' ? 'local' : 'remote'));
  };

  const endCall = () => {
    cleanUpCall(true, true);
  };

  useEffect(() => {
    mounted.current = true;

    // Get available cameras
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
    });

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

      socket.current.on('incoming_video_call', ({ callerId, callerSocketId, roomId }) => {
        if (!mounted.current) return;
        setIncomingCall({ callerId, callerSocketId, roomId });
        setRinging(true);
        clearTimeout(incomingTimeoutRef.current);
        incomingTimeoutRef.current = setTimeout(() => {
          if (ringing && socket.current) {
            socket.current.emit('video_call_reject', { callerSocketId });
          }
          setIncomingCall(null);
          setRinging(false);
        }, 60000);
      });

      socket.current.on('video_call_accepted', ({ roomId, recipientSocketId }) => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setIsCalling(false);
        isCallingRef.current = false;
        setInCall(true);
        inCallRef.current = true;
        setCallRoomId(roomId);
        callRoomIdRef.current = roomId;
        if (localStreamRef.current) {
          const peer = createPeer(recipientSocketId, socket.current.id, localStreamRef.current);
          if (peer) {
            peersRef.current.push({ peerId: recipientSocketId, peer });
            setPeers([peer]);
          }
        }
        startCallTimer();
      });

      socket.current.on('call_ready', ({ roomId, callerSocketId }) => {
        // Can use if needed, but currently not necessary
      });

      socket.current.on('video_call_rejected', () => {
        if (!mounted.current) return;
        clearTimeout(callTimeoutRef.current);
        setError('Call rejected by the other user.');
        cleanUpCall(true, false);
      });

      socket.current.on('video_call_canceled', () => {
        if (!mounted.current) return;
        setError('Call canceled by the caller.');
        cleanUpCall(true, false);
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
        if (peersRef.current.length === 0) {
          setError('Other user left the call.');
          cleanUpCall(true, false);
        }
      });
    }

    const handleBeforeUnload = () => {
      cleanUpCall(false, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanUpCall(false, false);
      if (socket.current) {
        socket.current.off('connect');
        socket.current.off('connect_error');
        socket.current.off('reconnect_attempt');
        socket.current.off('reconnect_failed');
        socket.current.off('incoming_video_call');
        socket.current.off('video_call_accepted');
        socket.current.off('video_call_rejected');
        socket.current.off('video_call_canceled');
        socket.current.off('user_joined');
        socket.current.off('receiving_returned_signal');
        socket.current.off('call_ended');
        socket.current.off('user_left');
        try { socket.current.disconnect(); } catch (e) { /* ignore */ }
        socket.current = null;
      }
    };
  }, [cleanUpCall, startCallTimer]);

  useEffect(() => {
    if (type === 'initiate' && !isCalling && !inCall) {
      startVideoCall();
    } else if (type === 'accept' && !inCall && !incomingCall) {
      setIncomingCall({ callerId: recipientId, callerSocketId: callerSocketIdParam, roomId: roomIdParam });
    }
  }, [type, isCalling, inCall, incomingCall, roomIdParam, callerSocketIdParam, recipientId]);

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
        <div className="video-container" ref={videoContainerRef}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={inCall && activeVideo === 'remote' ? 'maximized' : 'hidden'}
            onClick={switchView}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={(isCalling || inCall) && activeVideo === 'local' ? 'maximized' : 'minimized'}
            onClick={switchView}
          />
        </div>
      )}

      {inCall && (
        <div className="call-controls">
          <button onClick={toggleAudioMute}>{isAudioMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleVideo}>{isVideoEnabled ? 'Video Off' : 'Video On'}</button>
          <button onClick={switchCamera}>Switch Camera</button>
          <button onClick={toggleScreenSharing}>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</button>
          <button onClick={toggleFullScreen}>{isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
          <select value={videoQuality} onChange={(e) => changeVideoQuality(e.target.value)}>
            <option value="low">Low Quality</option>
            <option value="medium">Medium Quality</option>
            <option value="high">High Quality</option>
          </select>
          <button onClick={endCall}>End Call</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;