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
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

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

  return (
    <div className="video-call-window">
      {incomingCall && (
        <div className="incoming-call">
          <p>Incoming call</p>
          <button onClick={onAccept}>Accept</button>
          <button onClick={onReject}>Reject</button>
        </div>
      )}
      {isCalling && (
        <div className="ringing">
          <p>Ringing...</p>
          <button onClick={onEnd}>Cancel</button>
        </div>
      )}
      {(inCall || isCalling) && (
        <div className="video-container">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={inCall && activeVideo === 'remote' ? 'maximized' : 'hidden'}
            onClick={onSwitchCamera}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={(isCalling || inCall) ? (inCall && activeVideo === 'local' ? 'maximized' : 'minimized') : 'hidden'}
            onClick={onSwitchCamera}
          />
        </div>
      )}
      {inCall && (
        <div className="call-controls">
          <button onClick={onToggleAudio}>{isAudioMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={onToggleVideo}>{isVideoEnabled ? 'Video Off' : 'Video On'}</button>
          <button onClick={onEnd}>End Call</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;