// src/VideoPlayer.jsx
import React, { useState } from 'react';
import YouTube from 'react-youtube';

export default function VideoPlayer({ videoId, onEnd }) {
  const [playerReady, setPlayerReady] = useState(false);
  const [player, setPlayer] = useState(null);

  const opts = {
    height: '390',
    width: '640',
    playerVars: {
      autoplay: 0, // Cambiado a 0 para evitar problemas de autoplay
      controls: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      enablejsapi: 1,
    },
  };

  const handleReady = (event) => {
    setPlayer(event.target);
    setPlayerReady(true);
    // Intentar reproducir automáticamente cuando esté listo
    setTimeout(() => {
      try {
        event.target.playVideo();
      } catch (error) {
        console.log("Autoplay bloqueado, requerirá interacción del usuario");
      }
    }, 100);
  };

  const handlePlay = () => {
    if (player && playerReady) {
      player.playVideo();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <YouTube 
        videoId={videoId} 
        opts={opts} 
        onReady={handleReady}
        onEnd={onEnd} 
      />
      {playerReady && (
        <button 
          onClick={handlePlay}
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            backgroundColor: '#ff0000',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ▶️ Reproducir
        </button>
      )}
    </div>
  );
}