// src/GuestRoom.jsx - Con botón para activar/desactivar micrófono
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Peer from 'simple-peer';

const Toast = ({ message, onDone }) => {
    useEffect(() => {
        const timer = setTimeout(() => onDone(), 2500);
        return () => clearTimeout(timer);
    }, [onDone]);

    return ( <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--success)', color: 'white', padding: '12px 24px', borderRadius: 'var(--border-radius)', zIndex: 1000, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>{message}</div> );
};

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('Conectando...');
    const peerRef = useRef();
    const audioStreamRef = useRef();
    
    // --- NUEVO ESTADO PARA EL MICRÓFONO ---
    const [isMuted, setIsMuted] = useState(false);

    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [notification, setNotification] = useState('');

    useEffect(() => {
        // La lógica de useEffect y las funciones handle... no cambian
        const setupGuestExperience = async () => { supabase.from('parties').select('*').eq('id', partyId).single().then(({ data }) => setParty(data)); const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); setSongQueue(queueData || []); const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1); if (playedSongs && playedSongs.length > 0) setCurrentlyPlaying(playedSongs[0]); }; setupGuestExperience(); const songsChannel = supabase.channel(`party_queue_${partyId}`); songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, async () => { const { data: uQ } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); setSongQueue(uQ || []); const { data: uP } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1); if (uP && uP.length > 0) setCurrentlyPlaying(uP[0]); else setCurrentlyPlaying(null); }).subscribe(); const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`); async function setupWebRTC() { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); audioStreamRef.current = stream; setConnectionStatus('Micrófono listo ✅'); const peer = new Peer({ initiator: true, trickle: false, stream: stream }); peerRef.current = peer; peer.on('signal', offer => webrtcChannel.send({ type: 'broadcast', event: 'signal-offer', payload: { offer } })); webrtcChannel.on('broadcast', { event: 'signal-answer' }, ({ payload }) => { if (payload.answer && !peer.connected) peer.signal(payload.answer); }); peer.on('connect', () => setConnectionStatus('¡Conectado! 🎤')); peer.on('close', () => setConnectionStatus('Desconectado')); peer.on('error', () => setConnectionStatus('Error')); } catch (err) { setConnectionStatus('Micrófono denegado.'); } } setupWebRTC(); webrtcChannel.subscribe(); return () => { supabase.removeChannel(songsChannel); supabase.removeChannel(webrtcChannel); if (peerRef.current) peerRef.current.destroy(); if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(track => track.stop()); }; }, [partyId]);
    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    const handleAddToQueue = async (song) => { await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' }); setSearchResults([]); setSearchQuery(''); setNotification('¡Canción añadida!'); };

    // --- NUEVA FUNCIÓN PARA ACTIVAR/DESACTIVAR ---
    const toggleMute = () => {
        if (audioStreamRef.current) {
            const audioTrack = audioStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };


    if (!party) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;

    return (
        <div className="guest-view">
            {notification && <Toast message={notification} onDone={() => setNotification('')} />}
            <div className="text-center">
                <h1 style={{fontSize: '2.5rem', marginBottom: '0.5rem'}}>🎉 {party.name}</h1>
            </div>
            
            <div className="mic-status" style={{textAlign: 'center', margin: '1.5rem 0'}}>
                <strong>Estado:</strong> {connectionStatus}
            </div>

            {/* --- NUEVO BOTÓN DE CONTROL --- */}
            <button
                className={`mic-control-button ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                disabled={!audioStreamRef.current}
            >
                {isMuted ? '🔇' : '🎤'}
                <span>{isMuted ? 'Micrófono Apagado' : 'Micrófono Encendido'}</span>
            </button>


            {currentlyPlaying && <div className="currently-playing">
                <h3>🎵 Sonando ahora:</h3>
                <p style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-secondary)'}}>{currentlyPlaying.title}</p>
            </div>}
            
            <div className="search-box">
                <h4>Añadir Canción</h4>
                <form onSubmit={handleSearch}>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Busca tu canción..."/>
                    <button type="submit" disabled={isSearching} style={{width: '100%'}}>{isSearching ? 'Buscando...' : 'Buscar'}</button>
                </form>
                {searchResults.length > 0 && <div className="queue-list" style={{marginTop: '1rem'}}>
                    {searchResults.map(song => (
                        <div key={song.videoId} className="song-item">
                            <img src={song.thumbnail} alt={song.title} />
                            <div className="details"><span className="title">{song.title}</span></div>
                            <div className="actions"><button className="add-btn" onClick={() => handleAddToQueue(song)}>+</button></div>
                        </div>
                    ))}
                </div>}
            </div>

            <div className="queue-box">
                <h3 style={{marginTop: 0}}>Siguientes en la Cola ({songQueue.length})</h3>
                <div className="queue-list">
                    {songQueue.length > 0 ? (
                        songQueue.map((song, i) => (
                            <div key={song.id} className={`song-item ${i === 0 ? 'next-up' : ''}`}>
                                <img src={song.thumbnail_url} alt={song.title} />
                                <div className="details"><span className="title">{i + 1}. {song.title}</span></div>
                            </div>
                        ))
                    ) : ( <p style={{color: 'var(--text-secondary)'}}>La cola está vacía.</p> )}
                </div>
            </div>
        </div>
    );
}