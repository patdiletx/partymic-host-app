// src/HostMobileView.jsx
import React from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

// Este componente recibe toda la información y funciones del padre (PartyRoom)
export default function HostMobileView({
  party,
  micStatus,
  currentlyPlaying,
  songQueue,
  searchResults,
  isSearching,
  searchQuery,
  setSearchQuery,
  handleSearch,
  handleAddToQueue,
  handlePlayNext,
  handleRemoveFromQueue,
}) {

  const joinUrl = `${window.location.origin}/join/${party.join_code}`;

  return (
    <div className="guest-view">
      <div className="text-center">
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉 {party.name}</h1>
        <p>(Modo Control Remoto)</p>
      </div>

      <div className="status-card">
        <strong>Micrófono:</strong> {micStatus}
      </div>

      {currentlyPlaying && (
        <div className="currently-playing">
          <h3>🎵 Sonando ahora:</h3>
          <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            {currentlyPlaying.title}
          </p>
        </div>
      )}

      <div className="host-controls" style={{ marginBottom: '1.5rem' }}>
        <button className="play-btn" onClick={handlePlayNext} disabled={songQueue.length === 0}>
          {currentlyPlaying ? 'Siguiente ⏭️' : 'Empezar ▶️'}
        </button>
      </div>

      <div className="search-box">
        <h4>Añadir Canción</h4>
        <form onSubmit={handleSearch}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Busca un karaoke..."
          />
          <button type="submit" disabled={isSearching} style={{ width: '100%' }}>
            {isSearching ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
        {searchResults.length > 0 && (
          <div className="queue-list" style={{ marginTop: '1rem' }}>
            {searchResults.map((song) => (
              <div key={song.videoId} className="song-item">
                <img src={song.thumbnail} alt={song.title} />
                <div className="details"><span className="title">{song.title}</span></div>
                <div className="actions"><button className="add-btn" onClick={() => handleAddToQueue(song)}>+</button></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="queue-box">
        <h3 style={{ marginTop: 0 }}>Gestionar Cola ({songQueue.length})</h3>
        <div className="queue-list">
          {songQueue.length > 0 ? (
            songQueue.map((song, i) => (
              <div key={song.id} className={`song-item ${i === 0 ? 'next-up' : ''}`}>
                <img src={song.thumbnail_url} alt={song.title} />
                <div className="details"><span className="title">{i + 1}. {song.title}</span></div>
                <div className="actions"><button className="remove-btn" onClick={() => handleRemoveFromQueue(song.id)}>X</button></div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>La cola está vacía.</p>
          )}
        </div>
      </div>
       <div className="join-info text-center" style={{marginTop: '2rem'}}>
            <h3>¡Invita a más gente!</h3>
            <div className="qr-code">
                <QRCode value={joinUrl} size={140} bgColor="#FFFFFF" fgColor="#141414" />
            </div>
            <div className="party-code">{party.join_code}</div>
        </div>
    </div>
  );
}