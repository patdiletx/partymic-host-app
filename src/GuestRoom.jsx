// src/GuestRoom.jsx - Versión COMPLETA con Interfaz de Cantante
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Peer from 'simple-peer';

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('Conectando...');
    const peerRef = useRef();
    const audioStreamRef = useRef();
    
    // --- Estados para la interfaz del cantante ---
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        // Carga inicial y suscripciones
        const setupGuestExperience = async () => {
            // Cargar datos de la fiesta
            supabase.from('parties').select('*').eq('id', partyId).single().then(({ data }) => setParty(data));

            // Cargar estado actual de la cola y canción
            const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            setSongQueue(queueData || []);
            const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
            if (playedSongs && playedSongs.length > 0) setCurrentlyPlaying(playedSongs[0]);

            // Suscribirse a cambios en la cola
            const songsChannel = supabase.channel(`party_queue_${partyId}`);
            songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, 
                async () => {
                    const { data: updatedQueue } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
                    setSongQueue(updatedQueue || []);
                    const { data: updatedPlayed } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
                    if (updatedPlayed && updatedPlayed.length > 0) setCurrentlyPlaying(updatedPlayed[0]); else setCurrentlyPlaying(null);
                }).subscribe();
            
            return songsChannel;
        };

        const setupWebRTC = () => {
            const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`);
            
            async function connectMic() {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
                    audioStreamRef.current = stream;
                    setConnectionStatus('Micrófono listo ✅');
                    const peer = new Peer({ initiator: true, trickle: false, stream: stream });
                    peerRef.current = peer;
                    peer.on('signal', offer => webrtcChannel.send({ type: 'broadcast', event: 'signal-offer', payload: { offer } }));
                    webrtcChannel.on('broadcast', { event: 'signal-answer' }, ({ payload }) => { if (payload.answer && !peer.connected) peer.signal(payload.answer); });
                    peer.on('connect', () => setConnectionStatus('¡Conectado! 🎤'));
                    peer.on('close', () => setConnectionStatus('Desconectado. Recarga para reconectar.'));
                    peer.on('error', (err) => setConnectionStatus(`Error: ${err.message}`));
                } catch (err) {
                    setConnectionStatus('Error: Micrófono denegado.');
                }
            }
            
            connectMic();
            webrtcChannel.subscribe();
            return webrtcChannel;
        };

        const songsSub = setupGuestExperience();
        const webrtcSub = setupWebRTC();

        return () => {
            supabase.removeChannel(songsSub);
            supabase.removeChannel(webrtcSub);
            if (peerRef.current) peerRef.current.destroy();
            if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(track => track.stop());
        };
    }, [partyId]);
    
    // --- Funciones de búsqueda y añadir para el invitado ---
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        const { data, error } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } });
        if (error) alert(error.message);
        else setSearchResults(data.results || []);
        setIsSearching(false);
    };

    const handleAddToQueue = async (song) => {
        const { error } = await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' });
        if (error) alert(error.message);
        else {
            setSearchResults([]);
            setSearchQuery('');
            alert('¡Canción añadida!');
        }
    };

    if (!party) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;

    return (
        <div style={{ padding: '20px', color: 'white', background: '#282c34', minHeight: '100vh', maxWidth: '600px', margin: '0 auto' }}>
            <h1>🎉 {party.name}</h1>
            <div style={{ margin: '20px 0', padding: '10px', background: '#1e2127', borderRadius: '8px', textAlign: 'center' }}>
                <strong>Micrófono:</strong> {connectionStatus}
            </div>

            {currentlyPlaying && <div style={{ marginBottom: '20px', padding: '15px', background: '#2a4d3a', borderRadius: '8px', borderLeft: '5px solid #4CAF50' }}>
                <h3>🎵 Sonando ahora:</h3>
                <p style={{margin: 0}}>{currentlyPlaying.title}</p>
            </div>}
            
            <div>
                <h4>Añadir Canción</h4>
                <form onSubmit={handleSearch}>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Artista y canción..." style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
                    <button type="submit" disabled={isSearching} style={{ width: '100%', marginTop: '5px', padding: '8px' }}>{isSearching ? 'Buscando...' : 'Buscar'}</button>
                </form>
                {searchResults.length > 0 && <div style={{ marginTop: '10px', maxHeight: '250px', overflowY: 'auto', background: '#444', padding: '5px', borderRadius: '4px' }}>
                    {searchResults.map(song => ( <div key={song.videoId} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', padding: '5px' }}>
                        <img src={song.thumbnail} alt={song.title} style={{ width: '40px', marginRight: '10px', borderRadius: '2px' }} />
                        <span style={{flex: 1, fontSize: '0.9em'}}>{song.title}</span>
                        <button onClick={() => handleAddToQueue(song)} style={{marginLeft: '10px', padding: '2px 8px'}}>+</button>
                    </div>))}
                </div>}
            </div>

            <h3 style={{marginTop: '20px'}}>Siguientes en la Cola ({songQueue.length})</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                 {songQueue.length > 0 ? (
                    songQueue.map((song, i) => <div key={song.id} style={{padding: '8px', background: '#333', borderRadius: '4px', marginBottom: '5px'}}>{i + 1}. {song.title}</div>)
                 ) : (
                    <p>¡Sé el primero en añadir una canción!</p>
                 )}
            </div>
        </div>
    );
}