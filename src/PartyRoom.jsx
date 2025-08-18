// src/PartyRoom.jsx - Lógica de Sincronización a Prueba de Fallos
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import VideoPlayer from './VideoPlayer';
import Peer from 'simple-peer';
import { useIsMobile } from './useIsMobile';
import HostMobileView from './HostMobileView';

export default function PartyRoom() {
    const isMobile = useIsMobile();
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

    useEffect(() => {
        const refreshData = async () => {
            console.log("Refrescando datos...");
            try {
                const [partyResult, queueResult, playingResult] = await Promise.all([
                    supabase.from('parties').select('*').eq('id', partyId).single(),
                    supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }),
                    supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1)
                ]);

                if (partyResult.error && partyResult.error.code !== 'PGRST116') throw partyResult.error;
                setParty(partyResult.data);

                if (queueResult.error) throw queueResult.error;
                setSongQueue(queueResult.data || []);

                if (playingResult.error) throw playingResult.error;
                setCurrentlyPlaying(playingResult.data?.[0] || null);

            } catch (error) {
                console.error("Error al refrescar los datos:", error);
            } finally {
                setLoading(false);
            }
        };

        refreshData();

        const subscription = supabase.channel(`party-updates-${partyId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` },
                (payload) => {
                    console.log('¡EVENTO RECIBIDO DE SUPABASE!', payload);
                    refreshData();
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') { console.log('¡Conectado exitosamente al canal de tiempo real!'); }
                if (status === 'CHANNEL_ERROR') { console.error('Error en el canal de tiempo real:', err); }
            });

        const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`);
        webrtcChannel.on('broadcast', { event: 'signal-offer' }, ({ payload }) => { if (peerRef.current || !payload.offer) return; setMicStatus('Oferta recibida...'); const peer = new Peer({ initiator: false, trickle: false }); peerRef.current = peer; peer.on('signal', (answer) => webrtcChannel.send({ type: 'broadcast', event: 'signal-answer', payload: { answer } })); peer.on('stream', (stream) => { setMicStatus('¡Conectado! 🎤'); if (audioPlayerRef.current) { audioPlayerRef.current.srcObject = stream; audioPlayerRef.current.play(); } }); peer.on('close', () => { setMicStatus('Desconectado.'); peerRef.current = null; }); peer.on('error', () => { setMicStatus('Error.'); peerRef.current = null; }); peer.signal(payload.offer); }).subscribe();

        return () => {
            supabase.removeChannel(subscription);
            supabase.removeChannel(webrtcChannel);
            if (peerRef.current) peerRef.current.destroy();
        };
    }, [partyId]);
    
    useEffect(() => {
        if (!currentlyPlaying && songQueue.length > 0 && !loading && party) {
            handlePlayNext();
        }
    }, [songQueue, currentlyPlaying, loading, party]);


    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    const handleAddToQueue = async (song) => { await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, }); setSearchResults([]); setSearchQuery(''); };
    const handlePlayNext = async () => { if (songQueue.length === 0) { setCurrentlyPlaying(null); return; } const songToPlay = songQueue[0]; await supabase.from('song_queue').update({ status: 'played', updated_at: new Date().toISOString() }).eq('id', songToPlay.id); };
    const handleRemoveFromQueue = async (songId) => { await supabase.from('song_queue').delete().eq('id', songId); };

    if (loading) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Cargando fiesta...</div>;
    if (!party) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Fiesta no encontrada. Verifica el código o el enlace.</div>;

    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    if (isMobile) {
        return <HostMobileView 
            party={party} micStatus={micStatus} currentlyPlaying={currentlyPlaying} songQueue={songQueue}
            searchResults={searchResults} isSearching={isSearching} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            handleSearch={handleSearch} handleAddToQueue={handleAddToQueue} handlePlayNext={handlePlayNext} handleRemoveFromQueue={handleRemoveFromQueue}
        />
    }

    return (
        <div className="host-view">
            <audio ref={audioPlayerRef} autoPlay />
            <main className="host-main-content">
                 <div className="video-container">
                    {currentlyPlaying ? ( <VideoPlayer videoId={currentlyPlaying.video_id} onEnd={handlePlayNext} /> ) : ( <div className="video-placeholder">La fiesta está por comenzar... Añade una canción para empezar.</div> )}
                </div>
                <div className="host-controls">
                    <h1 className="party-name">{party.name}</h1>
                    {currentlyPlaying && currentlyPlaying.guest_name && ( <h2 style={{color: 'var(--success)'}}>🎤 Cantando: {currentlyPlaying.guest_name}</h2> )}
                    <div className="mic-status"><strong>Micrófono:</strong> {micStatus}</div>
                    <div><button className="play-btn" onClick={handlePlayNext} disabled={songQueue.length === 0}>{currentlyPlaying ? 'Siguiente Turno ⏭️' : 'Empezar Fiesta ▶️'}</button></div>
                </div>
            </main>
            <aside className="sidebar">
                <div className="join-info text-center">
                    <h3>¡Únete a la Fiesta!</h3>
                    <div className="qr-code"><QRCode value={joinUrl} size={140} bgColor="#FFFFFF" fgColor="#141414" /></div>
                    <div className="party-code">{party.join_code}</div>
                </div>
                <div className="queue-box" style={{display: 'flex', flexDirection: 'column', flexGrow: 1}}>
                    <h3 style={{marginTop: 0}}>Cola de Turnos ({songQueue.length})</h3>
                    <div className="queue-list">
                        {songQueue.length > 0 ? (
                            songQueue.map((song, i) => (
                                <div key={song.id} className={`song-item ${i === 0 ? 'next-up' : ''}`}>
                                    <img src={song.thumbnail_url} alt={song.title} />
                                    <div className="details">
                                        <span className="title">{i + 1}. {song.title}</span>
                                        <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{song.guest_name ? `por ${song.guest_name}` : 'Canción de la casa'}</span>
                                    </div>
                                    <div className="actions"><button className="remove-btn" onClick={() => handleRemoveFromQueue(song.id)}>X</button></div>
                                </div>
                            ))
                        ) : ( <p style={{color: 'var(--text-secondary)'}}>La cola está vacía.</p> )}
                    </div>
                </div>
            </aside>
        </div>
    );
}