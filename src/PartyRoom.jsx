// src/PartyRoom.jsx - Vista inteligente que elige entre TV y Control Remoto
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import VideoPlayer from './VideoPlayer';
import Peer from 'simple-peer';
import { useIsMobile } from './useIsMobile'; // Importamos el nuevo hook
import HostMobileView from './HostMobileView'; // Importamos la nueva vista

export default function PartyRoom() {
    const isMobile = useIsMobile(); // Detecta si la pantalla es de móvil
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
    
    // (Toda la lógica de useEffect y las funciones handle... se mantienen exactamente igual)
    useEffect(() => { const fetchPartyAndQueue = async () => { try { setLoading(true); const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single(); if (partyError) throw partyError; setParty(partyData); const { data: queueData, error: queueError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); if (queueError) throw queueError; setSongQueue(queueData || []); const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1); if (playedSongs && playedSongs.length > 0) { setCurrentlyPlaying(playedSongs[0]); } } catch (error) { setParty(null); } finally { setLoading(false); } }; fetchPartyAndQueue(); const songsChannel = supabase.channel(`party_queue_${partyId}`); songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, async () => { const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true }); setSongQueue(queueData || []); }).subscribe(); const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`); webrtcChannel.on('broadcast', { event: 'signal-offer' }, ({ payload }) => { if (peerRef.current || !payload.offer) return; setMicStatus('Oferta recibida...'); const peer = new Peer({ initiator: false, trickle: false }); peerRef.current = peer; peer.signal(payload.offer); peer.on('signal', (answer) => webrtcChannel.send({ type: 'broadcast', event: 'signal-answer', payload: { answer } })); peer.on('stream', (stream) => { setMicStatus('¡Conectado! 🎤'); if (audioPlayerRef.current) { audioPlayerRef.current.srcObject = stream; audioPlayerRef.current.play(); } }); peer.on('close', () => { setMicStatus('Desconectado.'); peerRef.current = null; }); peer.on('error', () => { setMicStatus('Error.'); peerRef.current = null; }); }).subscribe(); return () => { supabase.removeChannel(songsChannel); supabase.removeChannel(webrtcChannel); if (peerRef.current) peerRef.current.destroy(); }; }, [partyId]);
    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    const handleAddToQueue = async (song) => { await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' }); setSearchResults([]); setSearchQuery(''); };
    const handlePlayNext = async () => { if (songQueue.length === 0) { setCurrentlyPlaying(null); return; } const songToPlay = songQueue[0]; const { data } = await supabase.from('song_queue').update({ status: 'played' }).eq('id', songToPlay.id).select().single(); setCurrentlyPlaying(data); };
    const handleRemoveFromQueue = async (songId) => { setSongQueue(q => q.filter(s => s.id !== songId)); await supabase.from('song_queue').delete().eq('id', songId); };

    if (loading) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Cargando...</div>;
    if (!party) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Fiesta no encontrada.</div>;

    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    // --- DECISIÓN DE RENDERIZADO ---
    // Si es móvil, muestra la vista de control remoto. Si no, la de TV.
    if (isMobile) {
        return <HostMobileView 
            party={party}
            micStatus={micStatus}
            currentlyPlaying={currentlyPlaying}
            songQueue={songQueue}
            searchResults={searchResults}
            isSearching={isSearching}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={handleSearch}
            handleAddToQueue={handleAddToQueue}
            handlePlayNext={handlePlayNext}
            handleRemoveFromQueue={handleRemoveFromQueue}
        />
    }

    return (
        <div className="host-view">
            <audio ref={audioPlayerRef} autoPlay />
            <main className="host-main-content">
                 <div className="video-container">
                    {currentlyPlaying ? (
                        <VideoPlayer videoId={currentlyPlaying.video_id} onEnd={handlePlayNext} />
                    ) : ( <div className="video-placeholder">La fiesta está por comenzar...</div> )}
                </div>
                <div className="host-controls">
                    <h1 className="party-name">{party.name}</h1>
                    <div className="mic-status">
                        <strong>Micrófono:</strong> {micStatus}
                    </div>
                    <div>
                        <button className="play-btn" onClick={handlePlayNext} disabled={songQueue.length === 0}>
                            {currentlyPlaying ? 'Siguiente ⏭️' : 'Empezar ▶️'}
                        </button>
                    </div>
                </div>
            </main>
            <aside className="sidebar">
                <div className="join-info text-center">
                    <h3>¡Únete a la Fiesta!</h3>
                    <div className="qr-code">
                        <QRCode value={joinUrl} size={140} bgColor="#FFFFFF" fgColor="#141414" />
                    </div>
                    <div className="party-code">{party.join_code}</div>
                </div>
                <div className="queue-box" style={{display: 'flex', flexDirection: 'column', flexGrow: 1}}>
                    <h3 style={{marginTop: 0}}>Cola ({songQueue.length})</h3>
                    <div className="queue-list">
                        {songQueue.length > 0 ? (
                            songQueue.map((song, i) => (
                                <div key={song.id} className={`song-item ${i === 0 ? 'next-up' : ''}`}>
                                    <img src={song.thumbnail_url} alt={song.title} />
                                    <div className="details"><span className="title">{i + 1}. {song.title}</span></div>
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