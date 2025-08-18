// src/GuestRoom.jsx - Con Cola de Turnos Unificada y Manejo de Errores
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Peer from 'simple-peer';

const Toast = ({ message, onDone }) => { useEffect(() => { const timer = setTimeout(() => onDone(), 3000); return () => clearTimeout(timer); }, [onDone]); return ( <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--success)', color: 'white', padding: '12px 24px', borderRadius: 'var(--border-radius)', zIndex: 1000, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>{message}</div> ); };
const getGuestId = () => { let id = localStorage.getItem('guestId'); if (!id) { id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; localStorage.setItem('guestId', id); } return id; };

export default function GuestRoom() {
    const { partyId } = useParams();
    const guestId = getGuestId();
    const [party, setParty] = useState(null);
    const [guestName, setGuestName] = useState(localStorage.getItem('guestName') || '');
    const [nameIsSet, setNameIsSet] = useState(!!localStorage.getItem('guestName'));
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [notification, setNotification] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Conectando...');
    const peerRef = useRef();
    const audioStreamRef = useRef();
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        const fetchAndSyncData = async () => {
            supabase.from('parties').select('*').eq('id', partyId).single().then(({ data }) => setParty(data));
            const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            setSongQueue(queueData || []);
            const { data: playingData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
            setCurrentlyPlaying(playingData?.[0] || null);
        };
        fetchAndSyncData();
        const songsChannel = supabase.channel(`party_queue_${partyId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, () => fetchAndSyncData()).subscribe();
        const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`); async function setupWebRTC() { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); audioStreamRef.current = stream; setConnectionStatus('Micrófono listo ✅'); const peer = new Peer({ initiator: true, trickle: false, stream: stream }); peerRef.current = peer; peer.on('signal', offer => webrtcChannel.send({ type: 'broadcast', event: 'signal-offer', payload: { offer } })); webrtcChannel.on('broadcast', { event: 'signal-answer' }, ({ payload }) => { if (payload.answer && !peer.connected) peer.signal(payload.answer); }); peer.on('connect', () => setConnectionStatus('¡Conectado! 🎤')); peer.on('close', () => setConnectionStatus('Desconectado')); peer.on('error', () => setConnectionStatus('Error')); } catch (err) { setConnectionStatus('Micrófono denegado.'); } } setupWebRTC(); webrtcChannel.subscribe();
        return () => {
            supabase.removeChannel(songsChannel);
            supabase.removeChannel(webrtcChannel);
            if (peerRef.current) peerRef.current.destroy();
            if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(track => track.stop());
        };
    }, [partyId]);

    const handleSetGuestName = () => { if (!guestName.trim()) { alert('Por favor, introduce tu nombre.'); return; } localStorage.setItem('guestName', guestName.trim()); setNameIsSet(true); };
    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    
    const handleAddToQueue = async (song, assignGuest = false) => {
        const newSong = { party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, guest_id: assignGuest ? guestId : null, guest_name: assignGuest ? guestName : null };
        const { error } = await supabase.from('song_queue').insert(newSong);
        if (error) {
            console.error("Error al añadir la canción:", error);
            alert(`Error al añadir la canción: ${error.message}`);
        } else {
            setSearchResults([]);
            setSearchQuery('');
            setNotification(assignGuest ? '¡Tu turno fue añadido!' : '¡Canción añadida a la fiesta!');
        }
    };

    const amIInQueue = songQueue.some(song => song.guest_id === guestId);
    const isSomeoneSingingNow = currentlyPlaying && currentlyPlaying.guest_id;
    const toggleMute = () => { if (audioStreamRef.current) { const audioTrack = audioStreamRef.current.getAudioTracks()[0]; if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack.enabled); } } };
    
    if (!party) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;
    if (!nameIsSet) { return ( <div className="guest-view" style={{textAlign: 'center'}}> <h1>¡Bienvenido a {party.name}!</h1> <p>Para unirte a la diversión, por favor dinos tu nombre.</p> <input type="text" placeholder="Tu nombre o apodo" value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{marginBottom: '1rem'}} /> <button onClick={handleSetGuestName} disabled={!guestName.trim()}>Guardar Nombre</button> </div> ); }

    return (
        <div className="guest-view">
            {notification && <Toast message={notification} onDone={() => setNotification('')} />}
            <div className="text-center"> <h1 style={{fontSize: '2.5rem', marginBottom: '0.5rem'}}>🎉 {party.name}</h1> <p>¡Hola, {guestName}!</p> </div>
            <div className="mic-status" style={{textAlign: 'center', margin: '1.5rem 0'}}><strong>Micrófono:</strong> {connectionStatus}</div>
            <button className={`mic-control-button ${isMuted ? 'muted' : ''}`} onClick={toggleMute} disabled={!audioStreamRef.current}> {isMuted ? '🔇' : '🎤'} <span>{isMuted ? 'Micrófono Apagado' : 'Micrófono Encendido'}</span> </button>
            {currentlyPlaying && ( <div className="currently-playing"> <h3>🎵 Sonando ahora:</h3> <p style={{margin: 0, fontSize: '1.1rem', color: isSomeoneSingingNow ? 'var(--text-primary)' : 'var(--success)'}}> {isSomeoneSingingNow ? `Canta ${currentlyPlaying.guest_name}: ${currentlyPlaying.title}` : `¡Canción libre! ${currentlyPlaying.title}`} </p> </div> )}
            {!isSomeoneSingingNow && currentlyPlaying && !amIInQueue && ( <div className="incentive-box" style={{textAlign: 'center', padding: '1rem', border: '1px dashed var(--success)', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem'}}> <p>¡Esta canción no tiene cantante! ¿Te animas a unirte a la fila?</p> </div> )}
            <div className="search-box"> <h4>Añadir Canción</h4> <form onSubmit={handleSearch}> <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Busca tu canción..."/> <button type="submit" disabled={isSearching} style={{width: '100%'}}>{isSearching ? 'Buscando...' : 'Buscar'}</button> </form> {searchResults.length > 0 && <div className="queue-list" style={{marginTop: '1rem'}}> {searchResults.map(song => ( <div key={song.videoId} className="song-item"> <img src={song.thumbnail} alt={song.title} /> <div className="details"><span className="title">{song.title}</span></div> <div className="actions" style={{display: 'flex', flexDirection: 'column', gap: '5px'}}> <button className="add-btn" onClick={() => handleAddToQueue(song, true)}>🎤 Cantarla</button> <button onClick={() => handleAddToQueue(song, false)} style={{backgroundColor: '#555'}}>➕ Añadir</button> </div> </div> ))} </div>} </div>
            <div className="queue-box"> <h3 style={{marginTop: 0}}>Próximos Turnos ({songQueue.length})</h3> <div className="queue-list"> {songQueue.length > 0 ? ( songQueue.map((song, i) => ( <div key={song.id} className={`song-item ${i === 0 ? 'next-up' : ''}`}> <img src={song.thumbnail_url} alt={song.title} /> <div className="details"> <span className="title">{i + 1}. {song.title}</span> <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}> {song.guest_name ? `por ${song.guest_name}` : 'Canción de la casa'} </span> </div> </div> )) ) : ( <p style={{color: 'var(--text-secondary)'}}>La cola está vacía. ¡Añade una canción!</p> )} </div> </div>
        </div>
    );
}