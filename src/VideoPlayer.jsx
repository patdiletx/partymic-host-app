// src/VideoPlayer.jsx
import React from 'react';
import YouTube from 'react-youtube';

export default function VideoPlayer({ videoId, onEnd }) {
  const opts = {
    height: '390',
    width: '640',
    playerVars: {
      // https://developers.google.com/youtube/player_parameters
      autoplay: 1, // Auto-reproduce el video cuando se carga
    },
  };

  return <YouTube videoId={videoId} opts={opts} onEnd={onEnd} />;
}