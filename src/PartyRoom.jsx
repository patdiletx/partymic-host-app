// src/PartyRoom.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import YouTube from 'react-youtube';
import Peer from 'simple-peer';

// ⚠️ ¡IMPORTANTE! VERIFICA QUE ESTA URL SEA LA CORRECTA DE TU SERVIDOR EN RENDER
const SIGNALING_URL = 'wss://partymic-signaling-server.onrender.com'; // Ejemplo, usa la tuya

export default function PartyRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newSongUrl, setNewSongUrl] = useState('');
    const [youtubePlayer, setYoutubePlayer] = useState(null);
    
    const socket = useRef();
    const peer = useRef();

    useEffect(() => {
        const fetchPartyState = async () => {
            const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single();
            if (partyError) {
                console.error('Error fetching party:', partyError);
                setLoading(false);
                return;
            }
            setParty(partyData);

            const { data: queueData, error: queueError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            if (queueError) console.error('Error fetching queue:', queueError);
            else setSongQueue(queueData || []);
            
            const { data: playingData, error: playingError } = await supabase
                .from('song_queue')
                .select('*')
                .eq('party_id', partyId)
                .eq('status', 'played')
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!playingError && playingData && playingData.length > 0) {
                setCurrentlyPlaying(playingData[0]);
            }
            
            setLoading(false);
        };

        fetchPartyState();

        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setSongQueue((q) => [...q, payload.new]);
                    }
                    if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                        setCurrentlyPlaying(payload.new);
                        setSongQueue((q) => q.filter(song => song.id !== payload.new.id));
                    }
                }
            ).subscribe();
            
        return () => supabase.removeChannel(channel);
    }, [partyId]);

    useEffect(() => {
        socket.current = new WebSocket(SIGNALING_URL);
        socket.current.onopen = () => {
            console.log("Anfitrión: Conectado al servidor de señalización");
            socket.current.send(JSON.stringify({ type: 'host', roomId: partyId }));
        };
        socket.current.onmessage = (message) => {
            const data = JSON.parse(message.data);
            if (!peer.current) {
                peer.current = new Peer({ initiator: false });
                peer.current.on('signal', (responseData) => {
                    socket.current.send(JSON.stringify(responseData));
                });
                peer.current.on('stream', (guestStream) => {
                    console.log("Anfitrión: Stream de invitado recibido");
                });
                peer.current.on('error', (err) => console.error('Error en Peer (anfitrión):', err));
            }
            peer.current.signal(data);
        };
        return () => {
            if (socket.current) socket.current.close();
            if (peer.current) peer.current.destroy();
        };
    }, [partyId]);

    const extractYouTubeVideoId = (url) => {
        // Múltiples patrones para diferentes formatos de URL de YouTube
        const patterns = [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    };

    const addSongToQueue = async () => {
        if (!newSongUrl.trim()) return;
        
        const videoId = extractYouTubeVideoId(newSongUrl);
        if (!videoId) {
            alert('Por favor, ingresa una URL válida de YouTube');
            return;
        }

        const { error } = await supabase.from('song_queue').insert({
            party_id: partyId,
            youtube_video_id: videoId,
            title: `Video ${videoId}`,
            status: 'queued'
        });

        if (error) {
            console.error('Error adding song:', error);
            alert('Error al agregar la canción');
        } else {
            setNewSongUrl('');
        }
    };

    const playNextSong = async () => {
        if (songQueue.length === 0) return;
        
        const nextSong = songQueue[0];
        const { error } = await supabase.from('song_queue').update({ status: 'played' }).eq('id', nextSong.id);
        
        if (error) {
            console.error('Error playing song:', error);
        }
    };

    const onYouTubeReady = (event) => {
        setYoutubePlayer(event.target);
    };

    const onYouTubeEnd = () => {
        playNextSong();
    };
      
    if (loading) return <div>Cargando sala del anfitrión...</div>;
    if (!party) return <div>¡Error! No se encontró la fiesta.</div>;

    return (
        <div style={{ padding: '20px', color: 'white', background: '#282c34', minHeight: '100vh' }}>
            <h1>🎉 Sala del Anfitrión - "{party.name}"</h1>
            <p>Código de invitación: <strong>{party.join_code}</strong></p>
            
            <div style={{ border: '1px solid #444', padding: '15px', borderRadius: '8px', margin: '20px 0' }}>
                <h3>Reproductor de YouTube:</h3>
                {currentlyPlaying ? (
                    <YouTube
                        videoId={currentlyPlaying.youtube_video_id}
                        onReady={onYouTubeReady}
                        onEnd={onYouTubeEnd}
                        opts={{ width: '100%', height: '390' }}
                    />
                ) : (
                    <p>No hay música reproduciéndose. Agrega una canción para empezar.</p>
                )}
            </div>

            <div style={{ margin: '20px 0' }}>
                <h3>Agregar Canción:</h3>
                <input
                    type="text"
                    placeholder="URL de YouTube"
                    value={newSongUrl}
                    onChange={(e) => setNewSongUrl(e.target.value)}
                    style={{ padding: '10px', width: '300px', marginRight: '10px' }}
                />
                <button onClick={addSongToQueue} style={{ padding: '10px' }}>
                    ➕ Agregar a la Cola
                </button>
            </div>

            <div>
                <h3>Cola de Canciones:</h3>
                {songQueue.length > 0 ? (
                    <div>
                        <ol>{songQueue.map(song => (
                            <li key={song.id} style={{ fontSize: '1.2em', margin: '10px 0' }}>
                                {song.title}
                            </li>
                        ))}</ol>
                        <button onClick={playNextSong} style={{ padding: '10px', marginTop: '10px' }}>
                            ▶️ Reproducir Siguiente
                        </button>
                    </div>
                ) : (
                    <p>La cola está vacía.</p>
                )}
            </div>
        </div>
    );
}