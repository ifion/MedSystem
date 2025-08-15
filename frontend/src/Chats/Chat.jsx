import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import AutoResizeTextarea from './AutoResizeTextArea';
import ImageEditor from './ImageEditor';
import Peer from 'simple-peer';
import VideoCall from './VideoCall';
import '../Designs/Chat.css';

const OptimizedMessage = memo(({
  message,
  userId,
  onEdit,
  onDelete,
  onUndoDelete,
  onCopy,
  onReply,
  isEditing,
  editValue,
  onEditChange,
  onImageClick,
  onLongPress,
  onReplyPreviewClick
}) => {
  const messageRef = useRef(null);
  const pressTimer = useRef(null);
  const touchStartX = useRef(null);
  const swipeThreshold = 100;

  const handlePressStart = useCallback((e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartX.current = e.touches[0].clientX;
    }
    pressTimer.current = setTimeout(() => {
      if (!message.isDeleted) {
        onLongPress(message);
      }
    }, 1000);
  }, [message, onLongPress]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches && e.touches.length > 0 && touchStartX.current != null) {
      const currentX = e.touches[0].clientX;
      const diffX = touchStartX.current - currentX;
      if (Math.abs(diffX) > swipeThreshold) {
        clearTimeout(pressTimer.current);
        onReply(message);
        const direction = diffX > 0 ? 'left' : 'right';
        if (messageRef.current) {
          messageRef.current.classList.add(`swiped-${direction}`);
          setTimeout(() => {
            if (messageRef.current) {
              messageRef.current.classList.remove(`swiped-${direction}`);
            }
          }, 200);
        }
        touchStartX.current = null;
      }
    }
  }, [message, onReply, swipeThreshold]);

  const handlePressEnd = useCallback(() => {
    clearTimeout(pressTimer.current);
    touchStartX.current = null;
  }, []);
  const currentUserId = localStorage.getItem('userId');
  console.log("Sender ID:", message.sender._id, "User ID:", currentUserId, "Match?", message.sender._id === currentUserId);
console.log(message);



  return (
    <div 
      ref={messageRef}
      className={`message-wrapper ${message.sender._id === currentUserId ? 'sent' : 'received'}`}
      onTouchStart={handlePressStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePressEnd}
      data-message-id={message._id}
    >
      <div className="message">
        {message.isDeleted ? (
          <div className="deleted-message">
            This message was deleted
            {message.sender._id === userId && (
              <button onClick={() => onUndoDelete(message._id)} className="undo-delete">
                Undo
              </button>
            )}
          </div>
        ) : isEditing ? (
          <div className="edit-container">
            <input
              value={editValue}
              onChange={onEditChange}
              className="edit-input"
              autoFocus
            />
            <button 
              className="icon-button"
              onClick={() => onEdit(message._id)}
              aria-label="Save edit"
            >
              ✔️
            </button>
          </div>
        ) : (
          <>
            {message.replyTo && (
              <div 
                className="reply-preview"
                onClick={() => {
                  const replyId = typeof message.replyTo === 'object' ? message.replyTo._id : message.replyTo;
                  onReplyPreviewClick(replyId);
                }}
                style={{ cursor: 'pointer' }}
              >
                <span className="reply-label">Replying to:</span>
                <div className="reply-content">
                  {message.replyTo?.content || message.replyContent || 'Original message'}
                </div>
              </div>
            )}
            <div className="message-content">
              {message.content}
              {message.mediaUrl && (
                <div className="media-container" onClick={() => onImageClick(message.mediaUrl)}>
                  {message.mediaType === 'image' ? (
                    <img
                      src={message.mediaUrl}
                      alt="Content"
                      loading="lazy"
                      className="optimized-image"
                      style={{ cursor: 'pointer' }}
                    />
                  ) : message.mediaType === 'audio' ? (
                    <audio controls src={message.mediaUrl} className="voice-note" />
                  ) : (
                    <a href={message.mediaUrl} download className="file-download">
                      📎 {message.fileName || 'File'}
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="message-meta">
              <span className="timestamp">
                {new Date(message.createdAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
              {message.disappearAfter > 0 && (
                <span className="disappear-timer">Disappears in {message.disappearAfter / 3600} hr</span>
              )}
              {message.sender._id === userId && (
                <span className={`status ${message.status}`}>
                  {message.status === 'sent' && '✓'}
                  {message.status === 'delivered' && '✓✓'}
                  {message.status === 'read' && '✓✓'}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

const Chat = () => {
  const apiUrl = import.meta.env.VITE_SOCKET_URL;
  const { userId } = useParams();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [file, setFile] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMessageForActions, setSelectedMessageForActions] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [disappearTime, setDisappearTime] = useState(0);
  const [showDisappearModal, setShowDisappearModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [canChat, setCanChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(false);
  const [caller, setCaller] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callRoomId, setCallRoomId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeVideo, setActiveVideo] = useState('remote');
  const [peers, setPeers] = useState([]);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const socket = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorder = useRef(null);
  const timerRef = useRef(null);
  const callTimeoutRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    ],
    iceCandidatePoolSize: 10,
  };

  const groupMessagesByDate = (msgs) => {
    const grouped = [];
    let lastDate = null;
    msgs.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toLocaleDateString();
      if (msgDate !== lastDate) {
        grouped.push({ type: 'separator', date: msgDate, id: `sep-${msgDate}` });
        lastDate = msgDate;
      }
      grouped.push({ ...msg, type: 'message' });
    });
    return grouped;
  };

  const preloadMedia = (url, type) => {
    if (type === 'image') {
      const img = new Image();
      img.src = url;
    } else if (type === 'audio') {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'auto';
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const currentUserId = localStorage.getItem('userId');
    const fetchData = async () => {
      try {
        const [messagesRes, canChatRes, recipientRes] = await Promise.all([
          axios.get(`${apiUrl}/api/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          axios.get(`${apiUrl}/api/appointments/check-chat/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          axios.get(`${apiUrl}/api/auth/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
        ]);

        const messagesWithMedia = messagesRes.data.map((msg) => {
          if (msg.mediaUrl) {
            const mediaType = msg.mediaUrl.match(/\.(jpe?g|png|gif)$/i) ? 'image' :
                             msg.mediaUrl.match(/\.(mp3|webm)$/i) ? 'audio' : 'file';
            if (mediaType === 'image' || mediaType === 'audio') {
              preloadMedia(msg.mediaUrl, mediaType);
            }
            return { ...msg, mediaType };
          }
          return msg;
        });

        setMessages(messagesWithMedia);
        setCanChat(canChatRes.data.canChat);
        setRecipient(recipientRes.data);
        setLoading(false);
        if (canChatRes.data.canChat) {
          scrollToBottom();
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to load chat data. Please refresh the page.');
        setLoading(false);
      }
    };

    socket.current = io(apiUrl, {
      query: { userId: currentUserId, recipientId: userId },
      transports: ['websocket'] // Force WebSocket for real-time
    });
    // Add connection debug
    socket.current.on('connect', () => console.log('Socket connected'));
    socket.current.on('connect_error', (err) => console.error('Socket connection error:', err));

    // Removed: socket.current.emit('login', currentUserId); // Handled on server connect

    socket.current.on('newMessage', (msg) => {
      const isForCurrentChat = (msg.sender._id === userId && msg.recipient._id === currentUserId);
      if (isForCurrentChat) {
        setMessages((prev) => {
          if (prev.some(m => m._id === msg._id || m.clientId === msg.clientId)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
        if (msg.recipient._id === currentUserId) {
          socket.current.emit('messageDelivered', { messageId: msg._id });
          if (document.hasFocus()) {
            socket.current.emit('messageRead', { messageId: msg._id, readerId: currentUserId });
          }
        }
      }
    });

    socket.current.on('messageSent', (msg) => {
      const isForCurrentChat = (msg.sender._id === currentUserId && msg.recipient._id === userId);
      if (isForCurrentChat) {
        setMessages((prev) => prev.map((m) => (m.clientId === msg.clientId ? msg : m)));
      }
    });

    socket.current.on('messageStatusUpdate', ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg))
      );
    });

    socket.current.on('userTyping', () => setIsTyping(true));
    socket.current.on('userStoppedTyping', () => setIsTyping(false));

    // Video call events
    socket.current.on('incoming_video_call', ({ callerId, roomId }) => {
      if (callerId === userId) {
        setIncomingCall(true);
        setCaller(callerId);
        setCallRoomId(roomId);
      }
    });

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
      setIncomingCall(false);
      alert('Call was canceled by the caller.');
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
      if (peersRef.current.length === 0) {
        endCall();
      }
    });

    socket.current.on('userStatusChange', ({ userId: statusUserId, isOnline }) => {
      if (statusUserId === userId) {
        setRecipient((prev) => (prev ? { ...prev, isOnline } : prev));
      }
    });

    socket.current.on('messageError', ({ messageId, error }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status: 'failed' } : msg))
      );
      console.error(error);
    });

    fetchData();

    return () => {
      socket.current.off('newMessage');
      socket.current.off('messageSent');
      socket.current.off('messageStatusUpdate');
      socket.current.off('userTyping');
      socket.current.off('userStoppedTyping');
      socket.current.off('incoming_video_call');
      socket.current.off('video_call_accepted');
      socket.current.off('video_call_rejected');
      socket.current.off('video_call_canceled');
      socket.current.off('all_users');
      socket.current.off('user_joined');
      socket.current.off('receiving_returned_signal');
      socket.current.off('call_ended');
      socket.current.off('user_left');
      socket.current.off('userStatusChange');
      socket.current.off('messageError');
      socket.current.disconnect();
      clearInterval(timerRef.current);
      clearTimeout(callTimeoutRef.current);
      endCall();
    };
  }, [userId, apiUrl]);

  const peersRef = useRef([]);

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
      const roomId = [localStorage.getItem('userId'), userId].sort().join('_');
      setCallRoomId(roomId);
      setIsCalling(true);
      socket.current.emit('video_call_request', { callerId: localStorage.getItem('userId'), recipientId: userId });
      callTimeoutRef.current = setTimeout(() => {
        if (isCalling) {
          endCall();
          setError('Call timed out. No answer.');
        }
      }, 20000);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone.');
    }
  };

  const acceptVideoCall = async () => {
    setIncomingCall(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setInCall(true);
      socket.current.emit('video_call_accept', { callerId: caller, recipientId: localStorage.getItem('userId'), roomId: callRoomId });
      joinVideoRoom(callRoomId);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone.');
    }
  };

  const rejectVideoCall = () => {
    setIncomingCall(false);
    socket.current.emit('video_call_reject', { callerId: caller });
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

  const endCall = () => {
    clearTimeout(callTimeoutRef.current);
    peersRef.current.forEach(({ peer }) => peer.destroy());
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (isCalling) {
      socket.current.emit('video_call_cancel', { recipientId: userId });
    } else if (inCall) {
      socket.current.emit('end_call', callRoomId);
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
  };

  const switchCamera = () => {
    setActiveVideo(prev => prev === 'remote' ? 'local' : 'remote');
  };

  const handleFileSelect = (event) => {
    const selected = event.target.files[0];
    if (selected) {
      if (selected.type.startsWith('image/')) {
        setSelectedImage(URL.createObjectURL(selected));
        setShowImageOptions(true);
      } else {
        setFile(selected);
      }
    }
  };

  const handleSendImageDirectly = () => {
    const selectedFile = fileInputRef.current.files[0];
    setFile(selectedFile);
    setShowImageOptions(false);
    setSelectedImage(null);
  };

  const handleEditImage = () => {
    setShowImageEditor(true);
    setShowImageOptions(false);
  };

  const handleImageSave = (editedFile) => {
    setFile(editedFile);
    setShowImageEditor(false);
    setSelectedImage(null);
  };

  const handleImageCancel = () => {
    setShowImageOptions(false);
    setShowImageEditor(false);
    setSelectedImage(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.start();
      setIsRecording(true);
      const audioChunks = [];
      mediaRecorder.current.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'voice-note.webm', { type: 'audio/webm' });
        setFile(audioFile);
        stream.getTracks().forEach(track => track.stop());
        clearInterval(timerRef.current);
        setRecordingTime(0);
        setIsRecording(false);
      };
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  }, []);

  const scrollToMessage = useCallback((messageId) => {
    const messageElement = messagesContainerRef.current.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputText && !file) return;

    const token = localStorage.getItem('token');
    const currentUserId = localStorage.getItem('userId');
    const tempId = `temp-${uuidv4()}`;
    const clientId = uuidv4();
    const newMsg = {
      _id: tempId,
      clientId,
      content: inputText,
      sender: { _id: currentUserId, name: 'You' },
      recipient: { _id: userId, name: recipient?.name },
      status: 'sent',
      createdAt: new Date().toISOString(),
      replyTo: replyTo ? replyTo._id : undefined,
      replyContent: replyTo ? (replyTo.content ? replyTo.content : 'Image') : undefined,
      disappearAfter: disappearTime,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    setFile(null);
    setReplyTo(null);
    setDisappearTime(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const formData = new FormData();
      formData.append('recipientId', userId);
      if (inputText) formData.append('content', inputText);
      if (file) formData.append('media', file);
      if (replyTo) formData.append('replyTo', replyTo._id);
      if (disappearTime > 0) formData.append('disappearAfter', disappearTime);
      formData.append('clientId', clientId);

      const res = await axios.post(`${apiUrl}/api/messages`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      socket.current.emit('sendMessage', { ...res.data, recipientId: userId });
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages((prev) =>
        prev.map((msg) => (msg._id === tempId ? { ...msg, status: 'failed' } : msg))
      );
      setError('Failed to send message. Please try again.');
    }
    scrollToBottom();
  }, [inputText, file, recipient, replyTo, disappearTime, userId, apiUrl]);

  const handleTyping = useCallback(() => {
    socket.current.emit('typing', {
      senderId: localStorage.getItem('userId'),
      recipientId: userId,
    });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.current.emit('stopTyping', {
        senderId: localStorage.getItem('userId'),
        recipientId: userId,
      });
    }, 1000);
  }, [userId]);

  const deleteMessage = useCallback(async (id) => {
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`${apiUrl}/api/messages/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages((prev) => 
        prev.map((msg) => 
          msg._id === id ? { ...msg, isDeleted: true } : msg
        )
      );
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Failed to delete message.');
    }
  }, [apiUrl]);

  const undoDeleteMessage = useCallback(async (id) => {
    const token = localStorage.getItem('token');
    try {
      const { data: restoredMsg } = await axios.put(`${apiUrl}/api/messages/restore/${id}`, null, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages((prev) => 
        prev.map((msg) => 
          msg._id === id ? { ...msg, isDeleted: false, content: restoredMsg.content } : msg
        )
      );
    } catch (err) {
      console.error('Undo delete failed:', err);
      setError('Failed to undo delete message.');
    }
  }, [apiUrl]);

  const editMessage = useCallback(async (id) => {
    if (!editText.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const { data: updatedMsg } = await axios.put(
        `${apiUrl}/api/messages/${id}`,
        { content: editText },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setMessages(prev =>
        prev.map(msg =>
          msg._id === id ? { ...msg, content: updatedMsg.content, isEdited: updatedMsg.isEdited } : msg
        )
      );
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Edit failed:', err);
      setError('Failed to edit message.');
    }
  }, [editText, apiUrl]);

  const handleCopyMessage = (content) => {
    navigator.clipboard.writeText(content);
  };

  const handleImageClick = (imageUrl) => {
    setSelectedImage(imageUrl);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
  };

  const openDisappearModal = () => {
    setShowDisappearModal(true);
  };

  const closeDisappearModal = () => {
    setShowDisappearModal(false);
  };

  const timerOptions = [
    { label: '1 Hour', seconds: 3600 },
    { label: '6 Hours', seconds: 21600 },
    { label: '12 Hours', seconds: 43200 },
    { label: '24 Hours', seconds: 86400 }
  ];

  const groupedMessages = groupMessagesByDate(messages);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!canChat) {
    return <div>Chat is only available on appointment days.</div>;
  }

  const userRole = localStorage.getItem('role');

  return (
    <div className="chat-container">
      <header className="chat-header">
        {recipient && (
          <div className="header-content">
            <Link to={`/user/${recipient._id}`} style={{ textDecoration: "none", color: "black" }} className="recipient-name">{recipient.name}</Link>
            <div className="status-indicator">
              <div className={`status-dot ${recipient.isOnline ? 'online' : 'offline'}`} />
              <span>{recipient.isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button onClick={startVideoCall} className="video-call-button" aria-label="Start Video Call">
              📹
            </button>
            {userRole === 'doctor' && (
              <Link to={`/diagnosis-prescription/${userId}`} className="diagnosis-button" aria-label="Diagnosis & Prescription">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z" /> {/* Stethoscope or medical icon */}
                </svg>
              </Link>
            )}
          </div>
        )}
      </header>

      <main className="messages-container" ref={messagesContainerRef} role="log">
        {error && <div className="error-message">{error}</div>}
        {groupedMessages.map((item) => {
          if (item.type === 'separator') {
            return (
              <div key={item.id} className="date-separator">
                {item.date}
              </div>
            );
          } else {
            return (
              <OptimizedMessage
                key={item._id}
                message={item}
                userId={localStorage.getItem('userId')}
                isEditing={editingId === item._id}
                editValue={editText}
                onEditChange={(e) => setEditText(e.target.value)}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onUndoDelete={undoDeleteMessage}
                onCopy={handleCopyMessage}
                onReply={setReplyTo}
                onImageClick={handleImageClick}
                onLongPress={() => setSelectedMessageForActions(item)}
                onReplyPreviewClick={scrollToMessage}
              />
            );
          }
        })}
        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-animation">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>
        )}
        {!isAtBottom && (
          <button
            className="scroll-to-bottom-button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            ▽
          </button>
        )}
        <div ref={messagesEndRef} />
      </main>

      {(inCall || isCalling || incomingCall) && (
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          isCalling={isCalling}
          incomingCall={incomingCall}
          inCall={inCall}
          isAudioMuted={isAudioMuted}
          isVideoEnabled={isVideoEnabled}
          activeVideo={activeVideo}
          onAccept={acceptVideoCall}
          onReject={rejectVideoCall}
          onEnd={endCall}
          onToggleAudio={toggleAudioMute}
          onToggleVideo={toggleVideo}
          onSwitchCamera={switchCamera}
        />
      )}

      <footer className="input-container">
        {replyTo && (
          <div className="reply-preview-bar">
            <span>Replying to: {replyTo.content ? replyTo.content.slice(0, 30) : 'Image'}</span>
            <button className="close-reply" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              ×
            </button>
          </div>
        )}

        <div className="input-group">
          <button className="icon-button attach-button" onClick={() => fileInputRef.current.click()} aria-label="Attach file">
            <svg className="attachment-icon" viewBox="0 0 24 24">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 015 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1H10v9.5a2.5 2.5 0 005 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden-file-input"
            accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
          />

          <AutoResizeTextarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              handleTyping();
            }}
            placeholder={replyTo ? "Type your reply..." : "Type a message..."}
            className="message-input"
            aria-label={replyTo ? "Type your reply" : "Type a message"}
          />

          <button
            className="send-button"
            onClick={sendMessage}
            disabled={!inputText && !file}
            aria-label="Send message"
          >
            <svg className="send-icon" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`record-button ${isRecording ? 'recording' : ''}`}
            aria-label={isRecording ? "Stop recording" : "Record voice note"}
          >
            {isRecording ? '⏹' : '🎙'}
            {isRecording && (
              <span className="recording-indicator">
                Recording... {formatTime(recordingTime)}
              </span>
            )}
          </button>

          <button 
            className="disappear-button"
            onClick={openDisappearModal}
            aria-label="Set disappear timer"
          >
            {disappearTime > 0 ? `Timer: ${disappearTime / 3600} hr` : '⌚'}
          </button>
        </div>

        {file && (
          <div className="selected-file">
            <span className="file-name">{file.name}</span>
            <button
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="remove-file"
            >
              ✕
            </button>
          </div>
        )}
      </footer>

      {selectedImage && !showImageOptions && !showImageEditor && (
        <div className="image-modal" onClick={closeImageModal}>
          <div className="image-modal-content">
            <img src={selectedImage} alt="Expanded view" />
          </div>
          <button className="modal-close" onClick={closeImageModal}>×</button>
        </div>
      )}

      {selectedMessageForActions && !selectedMessageForActions.isDeleted && (
        <div className="popup-backdrop" onClick={() => setSelectedMessageForActions(null)}>
          <div className="message-actions-popup" onClick={(e) => e.stopPropagation()}>
            <button 
              className="action-button" 
              onClick={() => {
                setReplyTo(selectedMessageForActions);
                setSelectedMessageForActions(null);
              }} 
              aria-label="Reply"
            >
              ↩ Reply
            </button>
            {selectedMessageForActions.sender._id === localStorage.getItem('userId') && (
              <>
                <button 
                  className="action-button" 
                  onClick={() => {
                    setEditingId(selectedMessageForActions._id);
                    setEditText(selectedMessageForActions.content);
                    setSelectedMessageForActions(null);
                  }} 
                  aria-label="Edit"
                >
                  ✎ Edit
                </button>
                <button 
                  className="action-button" 
                  onClick={() => {
                    deleteMessage(selectedMessageForActions._id);
                    setSelectedMessageForActions(null);
                  }} 
                  aria-label="Delete"
                >
                  🗑 Delete
                </button>
              </>
            )}
            <button 
              className="action-button" 
              onClick={() => {
                handleCopyMessage(selectedMessageForActions.content);
                setSelectedMessageForActions(null);
              }} 
              aria-label="Copy"
            >
              ⎘ Copy
            </button>
          </div>
        </div>
      )}

      {showImageOptions && (
        <div className="popup-backdrop" onClick={handleImageCancel}>
          <div className="message-actions-popup" onClick={(e) => e.stopPropagation()}>
            <p>Would you like to:</p>
            <button className="action-button" onClick={handleSendImageDirectly}>
              Send Image Directly
            </button>
            <button className="action-button" onClick={handleEditImage}>
              Edit Image First
            </button>
            <button className="action-button" onClick={handleImageCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showImageEditor && (
        <ImageEditor imageSrc={selectedImage} onSave={handleImageSave} onCancel={handleImageCancel} />
      )}

      {showDisappearModal && (
        <div className="popup-backdrop" onClick={closeDisappearModal}>
          <div className="timer-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Select Disappear Timer</h3>
            <ul className="timer-options">
              {timerOptions.map(option => (
                <li key={option.seconds}>
                  <button 
                    className="timer-option-button" 
                    onClick={() => {
                      setDisappearTime(option.seconds);
                      closeDisappearModal();
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
            <button className="cancel-button" onClick={closeDisappearModal}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;