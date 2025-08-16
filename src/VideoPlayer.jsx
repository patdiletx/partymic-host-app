// src/VideoPlayer.jsx - Versión con corrección de 'origin'
import React from 'react';
import YouTube from 'react-youtube';

export default function VideoPlayer({ videoId, onEnd }) {
  const opts = {
    height: '390',
    width: '640',
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      // --- LÍNEA AÑADIDA ---
      // Esto le dice a YouTube que la página que lo contiene es segura.
      origin: window.location.origin 
    },
  };

  const handleReady = (event) => {
    // Intenta reproducir el video tan pronto como esté listo.
    event.target.playVideo();
  };

  return (
    <YouTube 
      videoId={videoId} 
      opts={opts} 
      onReady={handleReady}
      onEnd={onEnd} // Llama a onEnd cuando el video termina
      style={{ width: '100%', height: '100%' }}
    />
  );
}