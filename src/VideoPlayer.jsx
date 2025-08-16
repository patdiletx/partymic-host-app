// src/VideoPlayer.jsx - Versión mejorada para autoplay confiable
import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

export default function VideoPlayer({ videoId, onEnd }) {
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const playerRef = useRef(null);

  const opts = {
    height: '390',
    width: '640',
    playerVars: {
      autoplay: 1, // Intentar autoplay
      controls: 1, // Mostrar controles
      modestbranding: 1, // Menos branding de YouTube
      rel: 0, // No mostrar videos relacionados
      iv_load_policy: 3, // No mostrar anotaciones
      enablejsapi: 1, // Habilitar API de JavaScript
      start: 0, // Empezar desde el principio
      fs: 1, // Permitir pantalla completa
      playsinline: 1, // Para dispositivos móviles
    },
  };

  const handleReady = (event) => {
    console.log('VideoPlayer: Video listo para reproducir');
    playerRef.current = event.target;
    setPlayerReady(true);
    setPlayerError(null);
    
    // Intentar reproducir automáticamente después de un pequeño delay
    setTimeout(() => {
      try {
        event.target.playVideo();
        console.log('VideoPlayer: Intentando autoplay');
      } catch (error) {
        console.log('VideoPlayer: Autoplay bloqueado, se requiere interacción del usuario');
        setPlayerError('autoplay_blocked');
      }
    }, 500);
  };

  const handlePlay = () => {
    if (playerRef.current && playerReady) {
      try {
        playerRef.current.playVideo();
        setIsPlaying(true);
        setPlayerError(null);
        console.log('VideoPlayer: Reproduciendo video manualmente');
      } catch (error) {
        console.error('VideoPlayer: Error al reproducir:', error);
        setPlayerError('play_failed');
      }
    }
  };

  const handlePause = () => {
    if (playerRef.current && playerReady) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  };

  const handleStateChange = (event) => {
    // Estados de YouTube: -1 (sin empezar), 0 (terminado), 1 (reproduciendo), 2 (pausado), 3 (buffering), 5 (video cued)
    switch (event.data) {
      case 1: // Reproduciendo
        setIsPlaying(true);
        setPlayerError(null);
        console.log('VideoPlayer: Video reproduciendo');
        break;
      case 2: // Pausado
        setIsPlaying(false);
        console.log('VideoPlayer: Video pausado');
        break;
      case 0: // Terminado
        setIsPlaying(false);
        console.log('VideoPlayer: Video terminado');
        if (onEnd) {
          onEnd();
        }
        break;
      case -1: // Sin empezar
        setIsPlaying(false);
        break;
      default:
        break;
    }
  };

  const handleError = (event) => {
    console.error('VideoPlayer: Error del reproductor:', event.data);
    setPlayerError('video_error');
    setIsPlaying(false);
  };

  // Efecto para intentar reproducir cuando cambia el videoId
  useEffect(() => {
    if (playerRef.current && playerReady) {
      setTimeout(() => {
        try {
          playerRef.current.playVideo();
        } catch (error) {
          console.log('VideoPlayer: Error en autoplay del nuevo video');
        }
      }, 1000);
    }
  }, [videoId]);

  if (!videoId) {
    return (
      <div style={{ 
        width: '640px', 
        height: '390px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: '#000',
        color: 'white',
        borderRadius: '8px'
      }}>
        <p>No hay video seleccionado</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
      <YouTube 
        videoId={videoId} 
        opts={opts} 
        onReady={handleReady}
        onStateChange={handleStateChange}
        onError={handleError}
        style={{ borderRadius: '8px' }}
      />
      
      {/* Overlay de controles cuando el autoplay está bloqueado */}
      {playerReady && (playerError === 'autoplay_blocked' || !isPlaying) && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 10
        }}>
          <button 
            onClick={handlePlay}
            style={{
              backgroundColor: '#ff0000',
              color: 'white',
              border: 'none',
              padding: '15px 25px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
          >
            ▶️ Reproducir Karaoke
          </button>
        </div>
      )}

      {/* Controles adicionales en la esquina superior izquierda */}
      {playerReady && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '8px',
          zIndex: 5
        }}>
          {!isPlaying ? (
            <button 
              onClick={handlePlay}
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                opacity: 0.9
              }}
              title="Reproducir"
            >
              ▶️
            </button>
          ) : (
            <button 
              onClick={handlePause}
              style={{
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                opacity: 0.9
              }}
              title="Pausar"
            >
              ⏸️
            </button>
          )}
        </div>
      )}

      {/* Indicador de estado en la esquina superior derecha */}
      {playerReady && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: isPlaying ? '#4CAF50' : '#666',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          opacity: 0.8,
          zIndex: 5
        }}>
          {isPlaying ? '🎵 Sonando' : '⏸️ Pausado'}
        </div>
      )}

      {/* Mensaje de error si hay problemas */}
      {playerError === 'video_error' && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          right: '10px',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '14px',
          textAlign: 'center',
          zIndex: 5
        }}>
          ⚠️ Error al cargar el video. Intenta con otra canción.
        </div>
      )}
    </div>
  );
}