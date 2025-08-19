import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import '../Designs/VideoCall.css'; // Assuming your CSS file is correctly linked

const VideoCall = () => {
  // --- Component State and Refs ---
  const { userId: recipientId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Route-derived information
  const type = searchParams.get('type');
  const queryRoomId = searchParams.get('roomId');
  const currentUserId = localStorage.getItem('userId');
  const apiUrl = import.meta.env.VITE_SOCKET_URL;

  // Call state
  const [localStream, setLocalStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false); // True when this client is the caller and ringing
  const [inCall, setInCall] = useState(false);       // True when the call is connected
  const [callRoomId, setCallRoomId] = useState(null);
  const [callDuration, setCallDuration] = useState(0); // Duration in seconds
  const [error, setError] = useState(null);

  // UI controls state
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote'); // 'remote' or 'local' for maximized view

  // Refs for stable objects that don't trigger re-renders
  const socket = useRef(null);
  const peersRef = useRef([]); // Stores peer connections: { peerId: string, peer: Peer.Instance }
  const localStreamRef = useRef(null); // Keep a stable reference to the local stream
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);   // For the 60-second ringing timeout
  const callTimerInterval = useRef(null);// For the call duration timer
  const mounted = useRef(false);

  // --- WebRTC Configuration ---
  const configuration = {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // Add more STUN/TURN servers for better reliability in production
    ],
  };

  // --- Helper Functions ---
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const attachRemoteStream = useCallback((stream) => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
      remoteVideoRef.current.srcObject = stream;
    }
  }, []);
  
  // --- Core Cleanup Logic ---

  /**
   * Stops all media tracks (camera, mic) and clears video elements.
   * This is the primary function for stopping hardware usage.
   */
  const stopMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setLocalStream(null);
  }, []);
  
  /**
   * Fully disconnects, stops media, and cleans up all resources.
   * Called on component unmount or when a call ends definitively.
   */
  const performDestructiveCleanup = useCallback(() => {
    // 1. Stop Timers
    clearTimeout(callTimeoutRef.current);
    clearInterval(callTimerInterval.current);
    
    // 2. Stop Camera and Microphone
    stopMediaTracks();

    // 3. Destroy Peer Connections
    peersRef.current.forEach(({ peer }) => {
      if (!peer.destroyed) peer.destroy();
    });
    peersRef.current = [];

    // 4. Disconnect Socket
    if (socket.current) {
      socket.current.disconnect();
      socket.current = null;
    }
  }, [stopMediaTracks]);

  /**
   * Resets the call state and navigates away.
   * Called after a call ends, is rejected, or times out.
   */
  const resetStateAndNavigate = useCallback(() => {
    setIsCalling(false);
    setInCall(false);
    setError(null);
    setCallDuration(0);
    navigate(`/chat/${recipientId}`);
  }, [navigate, recipientId]);
  
  // --- Call Timer Logic ---

  const startCallTimer = useCallback(() => {
    if (callTimerInterval.current) clearInterval(callTimerInterval.current);
    const startTime = Date.now();
    setCallDuration(0);
    callTimerInterval.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, []);

  // --- WebRTC Peer Logic ---
  const createPeer = useCallback((userToSignal, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: configuration,
      stream,
    });

    peer.on('signal', (signal) => {
      if (socket.current?.connected) {
        socket.current.emit('sending_signal', { userToSignal, signal });
      }
    });
    
    peer.on('stream', attachRemoteStream);
    peer.on('error', (err) => {
      console.error('Peer connection error:', err);
      setError('A connection error occurred.');
    });

    return peer;
  }, [attachRemoteStream]);

  const addPeer = useCallback((incomingSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      config: configuration,
      stream,
    });
    
    peer.on('signal', (signal) => {
      if (socket.current?.connected) {
        socket.current.emit('returning_signal', { signal, callerId });
      }
    });

    peer.on('stream', attachRemoteStream);
    peer.on('error', (err) => {
      console.error('Peer connection error:', err);
      setError('A connection error occurred.');
    });
    
    peer.signal(incomingSignal);
    return peer;
  }, [attachRemoteStream]);
  
  // --- Call Flow Logic (Initiate, Accept, End) ---

  const getMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Camera/microphone permissions denied. Please enable them in your browser settings.');
      throw err; // Propagate error to stop the call flow
    }
  };

  const startVideoCall = useCallback(async () => {
    try {
      await getMediaStream();
      setIsCalling(true);
      const roomId = [currentUserId, recipientId].sort().join('_');
      setCallRoomId(roomId);
      
      if (socket.current?.connected) {
        socket.current.emit('video_call_request', { recipientId, roomId });
      }

      // ** REQUIREMENT 2: 60-second ringing timeout **
      callTimeoutRef.current = setTimeout(() => {
        if (mounted.current && !inCall) { // Check if still ringing and not in call
          setError('No answer from the user.');
          endCall(); // End call handles cleanup
        }
      }, 60000);
    } catch (err) {
      // getMediaStream failed, no need to do anything else
    }
  }, [currentUserId, recipientId, inCall]);

  const acceptVideoCall = useCallback(async () => {
    try {
      const stream = await getMediaStream();
      setInCall(true);
      if (socket.current?.connected && queryRoomId) {
        socket.current.emit('video_call_accept', { roomId: queryRoomId });
        socket.current.emit('join_video_room', queryRoomId);
      }
      startCallTimer();
    } catch (err) {
       // getMediaStream failed
    }
  }, [queryRoomId, startCallTimer]);

  const endCall = useCallback(() => {
    if (socket.current?.connected) {
      if (isCalling && !inCall) { // If ringing but not connected
        socket.current.emit('video_call_cancel', { recipientId, roomId: callRoomId });
      } else { // If call is connected
        socket.current.emit('end_call', { roomId: callRoomId });
      }
    }
    performDestructiveCleanup();
    resetStateAndNavigate();
  }, [isCalling, inCall, recipientId, callRoomId, performDestructiveCleanup, resetStateAndNavigate]);

  // --- UI Control Handlers ---

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

  // --- useEffect for Socket Initialization and Event Handling ---
  useEffect(() => {
    mounted.current = true;
    socket.current = io(apiUrl, {
      query: { userId: currentUserId },
      transports: ['websocket'],
    });

    // --- Socket Event Listeners ---
    socket.current.on('connect', () => console.log('Video socket connected:', socket.current.id));
    socket.current.on('connect_error', () => setError('Connection failed. Please check your internet.'));

    socket.current.on('video_call_accepted', ({ roomId }) => {
      if (!mounted.current) return;
      clearTimeout(callTimeoutRef.current);
      setIsCalling(false);
      setInCall(true);
      startCallTimer();
      socket.current.emit('join_video_room', roomId);
    });

    socket.current.on('video_call_rejected', () => {
      if (!mounted.current) return;
      setError('Call was rejected.');
      performDestructiveCleanup();
      resetStateAndNavigate();
    });

    socket.current.on('video_call_canceled', () => {
      if (!mounted.current) return;
      setError('Call was canceled.');
      performDestructiveCleanup(); // Recipient also needs to clean up
      resetStateAndNavigate();
    });

    socket.current.on('call_ended', () => {
      if (!mounted.current) return;
      setError('Call ended.');
      performDestructiveCleanup();
      resetStateAndNavigate();
    });
    
    // --- WebRTC Signaling Listeners ---
    socket.current.on('all_users', (users) => {
      if (!mounted.current || !localStreamRef.current) return;
      users.forEach((userId) => {
        const peer = createPeer(userId, localStreamRef.current);
        peersRef.current.push({ peerId: userId, peer });
      });
    });

    socket.current.on('user_joined', (payload) => {
      if (!mounted.current || !localStreamRef.current) return;
      const peer = addPeer(payload.signal, payload.callerId, localStreamRef.current);
      peersRef.current.push({ peerId: payload.callerId, peer });
    });

    socket.current.on('receiving_returned_signal', (payload) => {
      if (!mounted.current) return;
      const item = peersRef.current.find((p) => p.peerId === payload.id);
      item?.peer.signal(payload.signal);
    });
    
    socket.current.on('user_left', (id) => {
        if (!mounted.current) return;
        const peerObj = peersRef.current.find(p => p.peerId === id);
        if (peerObj && !peerObj.peer.destroyed) {
            peerObj.peer.destroy();
        }
        peersRef.current = peersRef.current.filter(p => p.peerId !== id);
        // If the other user leaves, end the call
        setError("The other user has left the call.");
        performDestructiveCleanup();
        resetStateAndNavigate();
    });

    // --- Component Unmount Cleanup ---
    return () => {
      mounted.current = false;
      performDestructiveCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, currentUserId]); // Run once on mount

  // --- useEffect to Trigger Initial Call Action ---
  useEffect(() => {
    if (type === 'initiate') {
      startVideoCall();
    } else if (type === 'accept' && queryRoomId) {
      setCallRoomId(queryRoomId);
      acceptVideoCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, queryRoomId]);

  // --- Render Logic ---
  return (
    <div className="video-call-window">
      {error && <div className="error-message">{error}</div>}

      {inCall && (
        <div className="call-duration">
          <span>{formatDuration(callDuration)}</span>
        </div>
      )}

      {isCalling && !inCall && (
        <div className="ringing-overlay">
          <p>Ringing...</p>
        </div>
      )}

      <div className="video-container">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`video-feed ${activeVideo === 'remote' ? 'maximized' : 'hidden'}`}
          onClick={inCall ? switchCamera : undefined}
        />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`video-feed local-preview ${activeVideo === 'local' ? 'maximized' : 'minimized'}`}
          onClick={inCall ? switchCamera : undefined}
        />
      </div>

      <div className="call-controls">
        {inCall ? (
          <>
            <button onClick={toggleAudioMute}>{isAudioMuted ? 'Unmute' : 'Mute'}</button>
            <button onClick={toggleVideo}>{isVideoEnabled ? 'Video On' : 'Video Off'}</button>
            <button className="end-call" onClick={endCall}>End Call</button>
          </>
        ) : (
          <button className="end-call" onClick={endCall}>Cancel</button>
        )}
      </div>
    </div>
  );
};

export default VideoCall;