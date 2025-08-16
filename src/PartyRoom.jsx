// src/PartyRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import VideoPlayer from './VideoPlayer';
import Peer from 'simple-peer';

// ⚠️ ¡IMPORTANTE! VERIFICA QUE ESTA URL SEA LA CORRECTA DE TU SERVIDOR EN RENDER
const SIGNALING_URL = 'wss://partymic-signaling-server.onrender.com'; // Ejemplo, usa la tuya

const GuestAudio = ({ stream }) => {
    const audioRef = useRef();
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

export default function PartyRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [guestStreams, setGuestStreams] = useState([]);
    const [webSocketConnected, setWebSocketConnected] = useState(false);
    const socket = useRef();
    const peersRef = useRef({});

    useEffect(() => {
        const fetchPartyAndQueue = async () => {
            const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single();
            if (partyError) console.error('Error fetching party:', partyError);
            else setParty(partyData);

            const { data: queueData, error: queueError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            if (queueError) console.error('Error fetching queue:', queueError);
            else setSongQueue(queueData || []);
            
            const { data: playingData, error: playingError } = await supabase
                .from('song_queue')
                .select('*')
                .eq('party_id', partyId)
                .eq('status', 'played')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (playingError) {
                console.error('Error fetching currently playing song:', playingError);
            } else if (playingData && playingData.length > 0) {
                setCurrentlyPlaying(playingData[0]);
            }
            
            setLoading(false);
        };

        fetchPartyAndQueue();

        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setSongQueue((currentQueue) => [...currentQueue, payload.new]);
                }
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    setCurrentlyPlaying(payload.new);
                    setSongQueue((currentQueue) => currentQueue.filter(song => song.id !== payload.new.id));
                }
            }).subscribe();
        return () => supabase.removeChannel(channel);
    }, [partyId]);

    useEffect(() => {
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 3;
        const reconnectDelay = 2000;

        const connectWebSocket = () => {
            socket.current = new WebSocket(SIGNALING_URL);
            
            socket.current.onopen = () => {
                console.log("Anfitrión: Conectado al servidor de señalización");
                setWebSocketConnected(true);
                socket.current.send(JSON.stringify({ type: 'join', roomId: partyId }));
                reconnectAttempts = 0;
            };

            socket.current.onclose = (event) => {
                setWebSocketConnected(false);
                console.log(`WebSocket cerrado. Código: ${event.code}, Razón: ${event.reason}`);
                if (reconnectAttempts < maxReconnectAttempts && event.code !== 1006) {
                    reconnectAttempts++;
                    console.log(`Intentando reconectar... (${reconnectAttempts}/${maxReconnectAttempts})`);
                    setTimeout(connectWebSocket, reconnectDelay);
                } else {
                    console.warn("Servidor de señalización no disponible. Funcionando sin audio de invitados.");
                }
            };

            socket.current.onerror = (error) => {
                console.error("Error de WebSocket:", error);
            };
        };

        connectWebSocket();

        return () => {
            if (socket.current) {
                socket.current.close();
            }
        };
    }, [partyId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery) return;
        setIsSearching(true);
        const { data, error } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } });
        if (error) alert('Error en la búsqueda: ' + error.message);
        else setSearchResults(data.results || []);
        setIsSearching(false);
    };

    const handleAddToQueue = async (song) => {
        const { error } = await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' });
        if (error) alert('Error al agregar la canción: ' + error.message);
        else { setSearchResults([]); setSearchQuery(''); }
    };

    const handlePlayNext = async () => {
        const songToPlay = songQueue[0];
        if (!songToPlay) {
            alert("No hay canciones en la cola. Agrega una canción para empezar la fiesta.");
            setCurrentlyPlaying(null);
            return;
        }
        const { error } = await supabase.from('song_queue').update({ status: 'played' }).eq('id', songToPlay.id);
        if (error) {
            alert("Error al actualizar la canción: " + error.message);
        } else {
            // Inmediatamente actualizar el estado local para que se reproduzca
            setCurrentlyPlaying(songToPlay);
            setSongQueue(currentQueue => currentQueue.filter(song => song.id !== songToPlay.id));
        }
    };

    if (loading) return <div>Cargando sala de fiesta...</div>;
    if (!party) return <div>Fiesta no encontrada. <Link to="/">Volver al Dashboard</Link></div>;
    
    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    return (
        <div style={{ display: 'flex', height: '100vh', color: 'white', background: '#282c34' }}>
            {/* --- Columna Izquierda: Reproductor y Controles --- */}
            <div style={{ flex: 3, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #444' }}>
                <h1>🎉 Sala del Anfitrión - "{party.name}"</h1>
                <div style={{ background: 'black', width: '640px', height: '390px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {currentlyPlaying ? (
                        <VideoPlayer 
                            key={currentlyPlaying.id}
                            videoId={currentlyPlaying.video_id} 
                            onEnd={handlePlayNext}
                        />
                    ) : <p>Presiona "Play" para empezar la fiesta</p>}
                </div>
                <button onClick={handlePlayNext} style={{ padding: '10px 20px', fontSize: '1.2em' }}>
                    {currentlyPlaying ? 'Siguiente Canción ⏯️' : 'Empezar Fiesta ▶️'}
                </button>
            </div>

            {/* --- Columna Derecha: QR, Búsqueda y Cola --- */}
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ textAlign: 'center', background: '#1e2127', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block', margin: '10px 0' }}>
                        <QRCode value={joinUrl} size={128} />
                    </div>
                    <h4 style={{ letterSpacing: '2px', background: '#333', padding: '10px', borderRadius: '4px' }}>
                        {party.join_code}
                    </h4>
                    {!webSocketConnected && (
                        <p style={{ fontSize: '0.8em', color: '#ffa500', marginTop: '10px' }}>
                            ⚠️ Audio de invitados no disponible
                        </p>
                    )}
                </div>
                
                <div>
                    <h4>Buscar Canción</h4>
                    <form onSubmit={handleSearch}>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Artista y canción..." style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}/>
                        <button type="submit" disabled={isSearching} style={{ width: '100%', marginTop: '5px' }}>
                            {isSearching ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>
                    {searchResults.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
                            {searchResults.map(song => (
                                <li key={song.videoId} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                    <img src={song.thumbnail} alt={song.title} style={{ width: '50px', marginRight: '10px' }} />
                                    <span style={{ fontSize: '0.9em', flex: 1 }}>{song.title}</span>
                                    <button onClick={() => handleAddToQueue(song)} style={{ marginLeft: 'auto' }}>+</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <h3 style={{ marginTop: '20px' }}>Siguientes en la Cola:</h3>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {songQueue.length === 0 
                        ? <p>La cola está vacía.</p> 
                        : (<ol>{songQueue.map((song, index) => (
                            <li key={song.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                <img src={song.thumbnail_url} alt={song.title} style={{ width: '40px', marginRight: '10px', borderRadius: '4px' }}/>
                                <span style={{ fontWeight: index === 0 ? 'bold' : 'normal' }}>{song.title}</span>
                            </li>
                        ))}</ol>)
                    }
                </div>
                <Link to="/" style={{ color: '#61dafb', marginTop: 'auto' }}>← Volver al Dashboard</Link>
            </div>

            {/* Componentes de audio para los invitados (no son visibles) */}
            <div>
                {guestStreams.map(item => (
                    <GuestAudio key={item.id} stream={item.stream} />
                ))}
            </div>
        </div>
    );
}