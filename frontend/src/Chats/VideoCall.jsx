// src/components/VideoCall.jsx
import React, { useEffect, useRef } from 'react';
import '../Designs/Chat.css';

const VideoCall = ({
  localStream,
  remoteStream,
  isCalling,
  incomingCall,
  inCall,
  isAudioMuted,
  isVideoEnabled,
  activeVideo,
  onAccept,
  onReject,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onSwitchCamera
}) => {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const ringRef        = useRef(null);

  /* ---------- attach local stream ---------- */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  /* ---------- attach remote stream ---------- */
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  /* ---------- play / stop ringtone ---------- */
  useEffect(() => {
    if (incomingCall) {
      ringRef.current?.play().catch(() => {});
    } else {
      ringRef.current?.pause();
      if (ringRef.current) ringRef.current.currentTime = 0;
    }
  }, [incomingCall]);

  return (
    <div className="video-call-window">
      {/* ringtone element */}
      <audio ref={ringRef} src="/ringtone.mp3" loop preload="auto" />

      {incomingCall && (
        <div className="incoming-call">
          <p>Incoming call</p>
          <button onClick={onAccept}>Accept</button>
          <button onClick={onReject}>Reject</button>
        </div>
      )}

      {isCalling && (
        <div className="ringing">
          <p>Ringing…</p>
          <button onClick={onEnd}>Cancel</button>
        </div>
      )}

      {(inCall || isCalling) && (
        <div className="video-container">
          {/* REMOTE video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}           // 🔊 ensure audio is NOT muted
            className={inCall && activeVideo === 'remote' ? 'maximized' : 'hidden'}
            onClick={onSwitchCamera}
          />

          {/* LOCAL video */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted                        // mute own mic feedback
            className={(isCalling || inCall)
              ? (inCall && activeVideo === 'local' ? 'maximized' : 'minimized')
              : 'hidden'
            }
            onClick={onSwitchCamera}
          />
        </div>
      )}

      {inCall && (
        <div className="call-controls">
          <button onClick={onToggleAudio}>
            {isAudioMuted ? 'Un-mute' : 'Mute'}
          </button>
          <button onClick={onToggleVideo}>
            {isVideoEnabled ? 'Video Off' : 'Video On'}
          </button>
          <button onClick={onEnd}>End Call</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;