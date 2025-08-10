import React, { useRef, useEffect } from 'react';

const AutoResizeTextarea = ({ value, onChange, placeholder, className }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset the height to auto first, then set it to the scrollHeight or a minimum of 20px
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 20)}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      style={{ overflow: 'hidden', resize: 'none', minHeight: '20px', fontSize: '16px'}}
    />
  );
};

export default AutoResizeTextarea;
