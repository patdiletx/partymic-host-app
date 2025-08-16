// src/Microphone.jsx

import React, { useState, useEffect, useRef } from 'react';

// El componente ahora acepta una prop `onStreamReady`
export default function Microphone({ onStreamReady }) {
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState('');
  const audioStream = useRef(null);

  useEffect(() => {
    const getMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        audioStream.current = stream;
        // Llamamos a la función del padre con el stream de audio
        if (onStreamReady) {
            onStreamReady(stream);
        }
        setError('');
      } catch (err) {
        console.error("Error al acceder al micrófono:", err);
        setError('Permiso de micrófono denegado. Revisa la configuración de tu navegador.');
      }
    };

    getMicrophone();

    return () => {
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onStreamReady]);

  const toggleMute = () => {
    if (!audioStream.current) return;
    // Habilitamos o deshabilitamos la pista de audio
    audioStream.current.getAudioTracks()[0].enabled = !isMuted;
    setIsMuted(prev => !prev);
  };

  if (error) {
    return <div style={{ color: 'red', marginTop: '20px' }}>{error}</div>;
  }

  return (
    <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
      <button 
        onClick={toggleMute} 
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          fontSize: '2.5em',
          background: isMuted ? 'gray' : 'red',
          color: 'white',
          border: '4px solid white',
          cursor: 'pointer'
        }}
      >
        {isMuted ? '🔇' : '🎤'}
      </button>
      <p>{isMuted ? 'Toca para hablar' : '¡Cantando!'}</p>
    </div>
  );
}