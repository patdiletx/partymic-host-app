// src/PartyRoom.jsx - Rediseño para "Vista de TV"
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import VideoPlayer from './VideoPlayer';
import Peer from 'simple-peer';

export default function PartyRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [micStatus, setMicStatus] = useState('Esperando conexión...');
    const audioPlayerRef = useRef();
    const peerRef = useRef();

    // ... La lógica de useEffect y las funciones handle... no cambian ...
    useEffect(() => { const fetchPartyAndQueue = async () => { try { setLoading(true); const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single(); if (partyError) throw partyError; setParty(partyData); const { data: queueData, error: queueError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); if (queueError) throw queueError; setSongQueue(queueData || []); const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1); if (playedSongs && playedSongs.length > 0) { setCurrentlyPlaying(playedSongs[0]); } } catch (error) { setParty(null); } finally { setLoading(false); } }; fetchPartyAndQueue(); const songsChannel = supabase.channel(`party_queue_${partyId}`); songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, async () => { const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); setSongQueue(queueData || []); }).subscribe(); const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`); webrtcChannel.on('broadcast', { event: 'signal-offer' }, ({ payload }) => { if (peerRef.current || !payload.offer) return; setMicStatus('Oferta recibida...'); const peer = new Peer({ initiator: false, trickle: false }); peerRef.current = peer; peer.signal(payload.offer); peer.on('signal', (answer) => webrtcChannel.send({ type: 'broadcast', event: 'signal-answer', payload: { answer } })); peer.on('stream', (stream) => { setMicStatus('¡Conectado! 🎤'); if (audioPlayerRef.current) { audioPlayerRef.current.srcObject = stream; audioPlayerRef.current.play(); } }); peer.on('close', () => { setMicStatus('Desconectado.'); peerRef.current = null; }); peer.on('error', () => { setMicStatus('Error.'); peerRef.current = null; }); }).subscribe(); return () => { supabase.removeChannel(songsChannel); supabase.removeChannel(webrtcChannel); if (peerRef.current) peerRef.current.destroy(); }; }, [partyId]);
    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    const handleAddToQueue = async (song) => { await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' }); setSearchResults([]); setSearchQuery(''); };
    const handlePlayNext = async () => { if (songQueue.length === 0) { setCurrentlyPlaying(null); return; } const songToPlay = songQueue[0]; const { data } = await supabase.from('song_queue').update({ status: 'played' }).eq('id', songToPlay.id).select().single(); setCurrentlyPlaying(data); };
    const handleRemoveFromQueue = async (songId) => { setSongQueue(q => q.filter(s => s.id !== songId)); await supabase.from('song_queue').delete().eq('id', songId); };

    if (loading) return <div className="text-center" style={{paddingTop: '50px'}}>Cargando...</div>;
    if (!party) return <div className="text-center" style={{paddingTop: '50px'}}>Fiesta no encontrada.</div>;

    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    return (
        <div className="party-room">
            <audio ref={audioPlayerRef} autoPlay />
            <main className="party-room-main">
                <h1>🎉 {party.name}</h1>
                <div className="status-card" style={{minWidth: '300px'}}>
                    <strong>Micrófono:</strong> {micStatus}
                </div>
                <div className="video-player-wrapper">
                    {currentlyPlaying ? (
                        <VideoPlayer videoId={currentlyPlaying.video_id} onEnd={handlePlayNext} />
                    ) : ( <div className="video-placeholder">🎵 Añade canciones y pulsa "Empezar Fiesta"</div> )}
                </div>
                <div className="main-controls">
                    <button onClick={handlePlayNext} disabled={songQueue.length === 0}>
                        {currentlyPlaying ? 'Siguiente Canción ⏭️' : 'Empezar Fiesta ▶️'}
                    </button>
                </div>
            </main>
            <aside className="party-room-sidebar">
                <div className="sidebar-box text-center">
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ background: 'white', padding: '10px', borderRadius: 'var(--border-radius)', display: 'inline-block', margin: '10px 0' }}>
                        <QRCode value={joinUrl} size={128} bgColor="#FFFFFF" fgColor="#2c3e50" />
                    </div>
                    <h4 style={{ letterSpacing: '3px', background: 'var(--secondary-color)', padding: '10px', borderRadius: '4px', fontFamily: 'monospace' }}>{party.join_code}</h4>
                </div>
                <div className="sidebar-box">
                    <h4>Añadir Canción</h4>
                    <form onSubmit={handleSearch}>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Artista y canción..."/>
                        <button type="submit" disabled={isSearching}>{isSearching ? 'Buscando...' : 'Buscar'}</button>
                    </form>
                    {searchResults.length > 0 && <div className="song-queue-list" style={{marginTop: '15px'}}>
                        {searchResults.map(song => ( <div key={song.videoId} className="song-queue-item">
                            <img src={song.thumbnail} alt={song.title} />
                            <span className="song-queue-item-title">{song.title}</span>
                            <button className="add-btn" onClick={() => handleAddToQueue(song)}>+</button>
                        </div>))}
                    </div>}
                </div>
                <h3 style={{marginTop: '0'}}>Cola ({songQueue.length})</h3>
                <div className="song-queue-list">
                    {songQueue.length > 0 ? (
                        songQueue.map((song, i) => (
                            <div key={song.id} className={`song-queue-item ${i === 0 ? 'next-up' : ''}`}>
                                <img src={song.thumbnail_url} alt={song.title} />
                                <span className="song-queue-item-title">{i + 1}. {song.title}</span>
                                <button className="remove-btn" onClick={() => handleRemoveFromQueue(song.id)}>X</button>
                            </div>
                        ))
                    ) : ( <p style={{color: 'var(--text-color-muted)'}}>La cola está vacía.</p> )}
                </div>
            </aside>
        </div>
    );
}