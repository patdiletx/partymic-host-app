// src/Microphone.jsx
import React, { useState, useEffect, useRef } from 'react';

export default function Microphone() {
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState('');
  const audioStream = useRef(null); // Usamos useRef para mantener la referencia al stream

  const getMicrophone = async () => {
    try {
      // Pedimos permiso al usuario para acceder al micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Opciones para mejorar la calidad del audio y reducir el eco
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      audioStream.current = stream;
      setError('');
      console.log("Micrófono conectado:", stream);
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      setError('Permiso de micrófono denegado. Revisa la configuración de tu navegador.');
    }
  };

  useEffect(() => {
    // Cuando el componente se monta, pedimos acceso al micrófono
    getMicrophone();

    // Función de limpieza para detener el stream cuando el componente se desmonte
    return () => {
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop());
        console.log("Micrófono desconectado.");
      }
    };
  }, []); // El array vacío asegura que esto solo se ejecute una vez

  const toggleMute = () => {
    if (!audioStream.current) return;
    audioStream.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
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