// src/GuestRoom.jsx - VERSIÓN CORREGIDA (Arregla el bucle de "Cargando...")
import { useState, useEffect, useRef, useCallback } from 'react';
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
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [notification, setNotification] = useState('');
    
    const [isMuted, setIsMuted] = useState(false);
    const [activeEffect, setActiveEffect] = useState('none');
    const peerRef = useRef();
    const rawMicStreamRef = useRef();
    
    const audioContextRef = useRef();
    const sourceNodeRef = useRef();
    const effectNodeRef = useRef();
    const destinationNodeRef = useRef();
    const gainNodeRef = useRef();
    const compressorNodeRef = useRef();
    const [micVolume, setMicVolume] = useState(1);

    const setupAudioEngine = useCallback(async () => {
        try {
            const rawStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            rawMicStreamRef.current = rawStream;
            setConnectionStatus('Micrófono listo ✅');

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            
            sourceNodeRef.current = audioContext.createMediaStreamSource(rawStream);
            gainNodeRef.current = audioContext.createGain();
            destinationNodeRef.current = audioContext.createMediaStreamDestination();
            compressorNodeRef.current = audioContext.createDynamicsCompressor();
            
            compressorNodeRef.current.threshold.setValueAtTime(-50, audioContext.currentTime);
            compressorNodeRef.current.knee.setValueAtTime(40, audioContext.currentTime);
            compressorNodeRef.current.ratio.setValueAtTime(12, audioContext.currentTime);
            compressorNodeRef.current.attack.setValueAtTime(0, audioContext.currentTime);
            compressorNodeRef.current.release.setValueAtTime(0.25, audioContext.currentTime);

            sourceNodeRef.current.connect(gainNodeRef.current);
            gainNodeRef.current.connect(compressorNodeRef.current);
            compressorNodeRef.current.connect(destinationNodeRef.current);
            
            setupWebRTC(destinationNodeRef.current.stream);

        } catch (err) {
            setConnectionStatus('Error: Micrófono denegado.');
        }
    }, [partyId]);

    const setupWebRTC = (processedStream) => {
        const webrtcChannel = supabase.channel(`webrtc-party-${partyId}`);
        const peer = new Peer({ initiator: true, trickle: false, stream: processedStream });
        peerRef.current = peer;
        peer.on('signal', offer => webrtcChannel.send({ type: 'broadcast', event: 'signal-offer', payload: { offer } }));
        webrtcChannel.on('broadcast', { event: 'signal-answer' }, ({ payload }) => { if (payload.answer && !peer.connected) peer.signal(payload.answer); });
        peer.on('connect', () => setConnectionStatus('¡Conectado! 🎤'));
        peer.on('close', () => setConnectionStatus('Desconectado'));
        peer.on('error', () => setConnectionStatus('Error'));
        webrtcChannel.subscribe();
    };

    const applyEffect = (effectType) => {
        if (!compressorNodeRef.current) return;
        compressorNodeRef.current.disconnect();
        if (effectNodeRef.current) {
            effectNodeRef.current.disconnect();
            effectNodeRef.current = null;
        }
        if (effectType === 'reverb') {
            const convolver = audioContextRef.current.createConvolver();
            convolver.buffer = createImpulseResponse(audioContextRef.current);
            effectNodeRef.current = convolver;
            compressorNodeRef.current.connect(effectNodeRef.current);
            effectNodeRef.current.connect(destinationNodeRef.current);
        } else {
            compressorNodeRef.current.connect(destinationNodeRef.current);
        }
        setActiveEffect(effectType);
    };

    function createImpulseResponse(context) { const rate = context.sampleRate; const length = rate * 2; const impulse = context.createBuffer(2, length, rate); const left = impulse.getChannelData(0); const right = impulse.getChannelData(1); for (let i = 0; i < length; i++) { const n = length - i; left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2.5); right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2.5); } return impulse; }

    useEffect(() => {
        // --- LÓGICA DE CARGA DE DATOS RESTAURADA ---
        const setupGuestExperience = async () => {
            // Cargar datos de la fiesta (¡ESTO FALTABA!)
            supabase.from('parties').select('*').eq('id', partyId).single().then(({ data }) => setParty(data));

            // Cargar estado inicial de la cola
            const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            setSongQueue(queueData || []);
            
            const { data: playedSongs } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
            if (playedSongs && playedSongs.length > 0) setCurrentlyPlaying(playedSongs[0]);
        };
        
        setupGuestExperience();
        setupAudioEngine();
        
        const songsChannel = supabase.channel(`party_queue_${partyId}`);
        songsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` }, async () => {
            const { data: uQ } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            setSongQueue(uQ || []);
            const { data: uP } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1);
            if (uP && uP.length > 0) setCurrentlyPlaying(uP[0]); else setCurrentlyPlaying(null);
        }).subscribe();

        return () => {
            supabase.removeChannel(songsChannel);
            if (peerRef.current) peerRef.current.destroy();
            if (rawMicStreamRef.current) rawMicStreamRef.current.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, [setupAudioEngine, partyId]);

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setMicVolume(newVolume);
        if (gainNodeRef.current && !isMuted) {
            gainNodeRef.current.gain.setValueAtTime(newVolume, audioContextRef.current.currentTime);
        }
    };
    
    const toggleMute = () => {
        if (gainNodeRef.current) {
            const newMutedState = !isMuted;
            const volumeToSet = newMutedState ? 0 : micVolume;
            gainNodeRef.current.gain.setValueAtTime(volumeToSet, audioContextRef.current.currentTime);
            setIsMuted(newMutedState);
        }
    };
    
    const handleSearch = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); const { data } = await supabase.functions.invoke('search-youtube', { body: { query: `${searchQuery} karaoke` } }); setSearchResults(data.results || []); setIsSearching(false); };
    const handleAddToQueue = async (song) => { await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' }); setSearchResults([]); setSearchQuery(''); setNotification('¡Canción añadida!'); };

    if (!party) return <div className="text-center" style={{paddingTop: '50px'}}>Cargando...</div>;

    return (
        <div className="guest-view">
            {notification && <Toast message={notification} onDone={() => setNotification('')} />}
            <div className="text-center">
                <h1 style={{fontSize: '2.5rem', marginBottom: '0.5rem'}}>🎉 {party.name}</h1>
            </div>
            
            <div className="mic-status" style={{textAlign: 'center', margin: '1.5rem 0'}}>
                <strong>Estado:</strong> {connectionStatus}
            </div>

            <button className={`mic-control-button ${isMuted ? 'muted' : ''}`} onClick={toggleMute} disabled={!rawMicStreamRef.current}>
                {isMuted ? '🔇' : '🎤'}
                <span>{isMuted ? 'Micrófono Apagado' : 'Micrófono Encendido'}</span>
            </button>
            
            <div className="volume-control">
                 <label htmlFor="volume">Volumen del Micrófono</label>
                 <input 
                    id="volume"
                    type="range" 
                    min="0" 
                    max="2"
                    step="0.1" 
                    value={micVolume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    disabled={isMuted}
                 />
            </div>

            <div className="effects-box">
                <h4 style={{textAlign: 'center', marginBottom: '1rem'}}>Efectos de Voz</h4>
                <div className="effects-selector">
                    <button onClick={() => applyEffect('none')} className={activeEffect === 'none' ? 'active' : ''}>Normal</button>
                    <button onClick={() => applyEffect('reverb')} className={activeEffect === 'reverb' ? 'active' : ''}>Reverb</button>
                </div>
            </div>

            {currentlyPlaying && <div className="currently-playing">
                <h3>🎵 Sonando ahora:</h3>
                <p style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-secondary)'}}>{currentlyPlaying.title}</p>
            </div>}
            
            <div className="search-box">
                <h4>Añadir Canción</h4>
                <form onSubmit={handleSearch}>{/* ... */}</form>
                {searchResults.length > 0 && <div className="queue-list" style={{marginTop: '1rem'}}>{/* ... */}</div>}
            </div>

            <div className="queue-box">
                <h3 style={{marginTop: 0}}>Siguientes en la Cola ({songQueue.length})</h3>
                <div className="queue-list">{/* ... */}</div>
            </div>
        </div>
    );
}