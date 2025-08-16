// src/PartyRoom.jsx - Versión Definitiva
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
    const [micStatus, setMicStatus] = useState('Esperando conexión del micrófono...');
    const audioPlayerRef = useRef();
    const peerRef = useRef();

    useEffect(() => {
        const fetchPartyAndQueue = async () => {
            try {
                setLoading(true);
                const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single();
                if (partyError) throw partyError;
                setParty(partyData);

                const { data: queueData, error: queueError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
                if (queueError) throw queueError;
                setSongQueue(queueData || []);
                
                // Intenta buscar una canción que ya se estaba reproduciendo
                const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
                if (playedSongs && playedSongs.length > 0) {
                    setCurrentlyPlaying(playedSongs[0]);
                }

            } catch (error) {
                console.error("Error cargando la fiesta:", error);
                setParty(null);
            } finally {
                setLoading(false);
            }
        };
        fetchPartyAndQueue();

        const songsChannel = supabase.channel(`party_queue_${partyId}`);
        songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` },
            async (payload) => {
                // Esta suscripción ahora SOLO actualiza la lista de la cola.
                // La lógica de reproducción se maneja en handlePlayNext.
                const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
                setSongQueue(queueData || []);
            }
        ).subscribe();
        
        const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`);
        // ... (Lógica de WebRTC se mantiene igual)
        webrtcChannel.on('broadcast', { event: 'signal-offer' }, ({ payload }) => {
            if (peerRef.current || !payload.offer) return;
            setMicStatus('Oferta de conexión recibida...');
            const peer = new Peer({ initiator: false, trickle: false });
            peerRef.current = peer;
            peer.signal(payload.offer);
            peer.on('signal', (answer) => webrtcChannel.send({ type: 'broadcast', event: 'signal-answer', payload: { answer } }));
            peer.on('stream', (stream) => {
                setMicStatus('¡Micrófono conectado! 🎤');
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.srcObject = stream;
                    audioPlayerRef.current.play();
                }
            });
            peer.on('close', () => { setMicStatus('Micrófono desconectado.'); peerRef.current = null; });
            peer.on('error', () => { setMicStatus('Error de conexión.'); peerRef.current = null; });
        }).subscribe();


        return () => {
            supabase.removeChannel(songsChannel);
            supabase.removeChannel(webrtcChannel);
            if (peerRef.current) peerRef.current.destroy();
        };
    }, [partyId]);
    
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
        }
    };

    // --- FUNCIÓN 'handlePlayNext' CORREGIDA Y ROBUSTA ---
    const handlePlayNext = async () => {
        if (songQueue.length === 0) {
            setCurrentlyPlaying(null); // Limpia el reproductor si no hay más canciones
            return;
        }
        const songToPlay = songQueue[0];
        
        // Actualizamos y pedimos la fila de vuelta
        const { data, error } = await supabase
            .from('song_queue')
            .update({ status: 'played' })
            .eq('id', songToPlay.id)
            .select()
            .single();

        if (error) {
            alert(`Error al reproducir la canción: ${error.message}`);
        } else {
            // Actualizamos el estado directamente con la respuesta
            setCurrentlyPlaying(data);
            // La suscripción de Supabase ya se encargará de remover la canción de la UI de la cola
        }
    };

    if (loading) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;
    if (!party) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Fiesta no encontrada o error al cargar.</div>;

    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    // --- JSX (con la búsqueda y cola restauradas) ---
    return (
        <div style={{ display: 'flex', height: '100vh', color: 'white', background: '#282c34' }}>
            <audio ref={audioPlayerRef} autoPlay />
            <div style={{ flex: 3, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #444' }}>
                <h1>🎉 {party.name}</h1>
                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#333', borderRadius: '8px', minWidth: '300px', textAlign: 'center' }}>
                    <strong>Micrófono:</strong> {micStatus}
                </div>
                <div style={{ background: 'black', width: '640px', height: '390px', marginBottom: '20px', borderRadius: '8px' }}>
                    {currentlyPlaying ? (
                        <VideoPlayer videoId={currentlyPlaying.video_id} onEnd={handlePlayNext} />
                    ) : ( <div style={{textAlign: 'center', paddingTop: '150px'}}>🎵 Añade canciones y pulsa "Empezar Fiesta"</div> )}
                </div>
                <button onClick={handlePlayNext} disabled={songQueue.length === 0} style={{ padding: '15px 30px', fontSize: '1.2em', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px' }}>
                    {currentlyPlaying ? 'Siguiente Canción ⏭️' : 'Empezar Fiesta ▶️'}
                </button>
            </div>
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ textAlign: 'center', background: '#1e2127', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block', margin: '10px 0' }}>
                        <QRCode value={joinUrl} size={128} />
                    </div>
                    <h4 style={{ letterSpacing: '2px', background: '#333', padding: '10px', borderRadius: '4px', fontFamily: 'monospace' }}>{party.join_code}</h4>
                </div>
                <div>
                    <h4>Buscar Canción</h4>
                    <form onSubmit={handleSearch}>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Artista y canción..." style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
                        <button type="submit" disabled={isSearching} style={{ width: '100%', marginTop: '5px', padding: '8px' }}>{isSearching ? 'Buscando...' : 'Buscar'}</button>
                    </form>
                    {searchResults.length > 0 && <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto', background: '#444', padding: '5px', borderRadius: '4px' }}>
                        {searchResults.map(song => ( <div key={song.videoId} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', padding: '5px' }}>
                            <img src={song.thumbnail} alt={song.title} style={{ width: '40px', marginRight: '10px', borderRadius: '2px' }} />
                            <span style={{flex: 1, fontSize: '0.9em'}}>{song.title}</span>
                            <button onClick={() => handleAddToQueue(song)} style={{marginLeft: '10px', padding: '2px 8px'}}>+</button>
                        </div>))}
                    </div>}
                </div>
                <h3 style={{marginTop: '20px'}}>Cola ({songQueue.length})</h3>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {songQueue.length > 0 ? (
                        songQueue.map((song, i) => <div key={song.id} style={{padding: '8px', background: i === 0 ? '#2a4d3a' : '#333', borderRadius: '4px', marginBottom: '5px', borderLeft: i === 0 ? '4px solid #4CAF50' : 'none'}}>{i + 1}. {song.title}</div>)
                    ) : ( <p>Aún no hay canciones en la cola.</p> )}
                </div>
            </div>
        </div>
    );
}