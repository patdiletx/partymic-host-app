// src/PartyRoom.jsx - Versión CORREGIDA con WebRTC
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
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

    // --- Estados y referencias para WebRTC ---
    const [micStatus, setMicStatus] = useState('Esperando conexión del micrófono...');
    const audioPlayerRef = useRef(); // Para el <audio> tag que reproducirá la voz
    const peerRef = useRef();
    const signalingChannelRef = useRef();

    useEffect(() => {
        // --- FUNCIÓN DE CARGA CORREGIDA ---
        const fetchPartyAndQueue = async () => {
            try {
                setLoading(true);
                // Cargar datos de la fiesta
                const { data: partyData, error: partyError } = await supabase
                    .from('parties')
                    .select('*')
                    .eq('id', partyId)
                    .single();
                
                if (partyError) throw partyError;
                setParty(partyData);

                // Cargar cola de canciones
                const { data: queueData, error: queueError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'queued')
                    .order('created_at', { ascending: true });

                if (queueError) throw queueError;
                setSongQueue(queueData || []);

                // Buscar canción actual
                const { data: playedSongs, error: playingError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'played')
                    .order('updated_at', { ascending: false });

                if (!playingError && playedSongs && playedSongs.length > 0) {
                    setCurrentlyPlaying(playedSongs[0]);
                }
            } catch (error) {
                console.error("Error cargando la fiesta:", error);
                setParty(null); // Marcar como no encontrada en caso de error
            } finally {
                setLoading(false); // ¡Esta línea es clave para que deje de cargar!
            }
        };
        
        fetchPartyAndQueue();

        // Suscripción a la cola de canciones (sin cambios)
        const songsChannel = supabase.channel(`party_queue_${partyId}`);
        songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, 
            (payload) => {
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue(q => [...q, payload.new]);
                }
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    setCurrentlyPlaying(payload.new);
                    setSongQueue(q => q.filter(s => s.id !== payload.new.id));
                }
            }).subscribe();

        // --- Lógica de WebRTC para el anfitrión ---
        const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`);
        signalingChannelRef.current = webrtcChannel;

        webrtcChannel.on('broadcast', { event: 'signal-offer' }, ({ payload }) => {
            if (peerRef.current || !payload.offer) return;

            setMicStatus('Oferta de conexión recibida, respondiendo...');
            
            const peer = new Peer({ initiator: false, trickle: false });
            peerRef.current = peer;

            peer.signal(payload.offer);

            peer.on('signal', (answer) => {
                webrtcChannel.send({
                    type: 'broadcast',
                    event: 'signal-answer',
                    payload: { answer },
                });
            });

            peer.on('stream', (stream) => {
                setMicStatus('¡Micrófono conectado! 🎤');
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.srcObject = stream;
                    audioPlayerRef.current.play().catch(e => console.error("Audio play failed", e));
                }
            });

            peer.on('error', (err) => {
                setMicStatus(`Error de conexión: ${err.message}`);
                peerRef.current = null; // Permitir reintentar
            });
             peer.on('close', () => {
                setMicStatus('Micrófono desconectado.');
                peerRef.current = null;
            });
        });

        webrtcChannel.subscribe();

        return () => {
            if (peerRef.current) peerRef.current.destroy();
            supabase.removeChannel(songsChannel);
            supabase.removeChannel(signalingChannelRef.current);
        };
    }, [partyId]);

    // --- Funciones de control de la fiesta (sin cambios) ---
    const handleSearch = async (e) => { e.preventDefault(); /* ... */ };
    const handleAddToQueue = async (song) => { /* ... */ };
    const handlePlayNext = async () => { /* ... */ };

    if (loading) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;
    if (!party) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Fiesta no encontrada o error al cargar.</div>;
    
    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    return (
        <div style={{ display: 'flex', height: '100vh', color: 'white', background: '#282c34' }}>
            <audio ref={audioPlayerRef} autoPlay />

            {/* Columna Izquierda */}
            <div style={{ flex: 3, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: '1px solid #444' }}>
                <h1>🎉 {party.name}</h1>
                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#333', borderRadius: '8px', minWidth: '300px', textAlign: 'center' }}>
                    <strong>Estado del Micrófono:</strong> {micStatus}
                </div>
                <div style={{ background: 'black', width: '640px', height: '390px', marginBottom: '20px' }}>
                    {currentlyPlaying ? (
                        <VideoPlayer videoId={currentlyPlaying.video_id} onEnd={handlePlayNext} />
                    ) : (
                        <div style={{textAlign: 'center', paddingTop: '150px'}}>🎵 Esperando la siguiente canción...</div>
                    )}
                </div>
                <button onClick={handlePlayNext} disabled={songQueue.length === 0} style={{ padding: '15px 30px', fontSize: '1.2em', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px' }}>
                    {currentlyPlaying ? 'Siguiente Canción ⏭️' : 'Empezar Fiesta ▶️'}
                </button>
            </div>

            {/* Columna Derecha */}
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                 <div style={{ textAlign: 'center', background: '#1e2127', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block', margin: '10px 0' }}>
                        <QRCode value={joinUrl} size={128} />
                    </div>
                    <h4 style={{ letterSpacing: '2px', background: '#333', padding: '10px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {party.join_code}
                    </h4>
                </div>
                {/* ...Resto del JSX para búsqueda y cola... */}
            </div>
        </div>
    );
}