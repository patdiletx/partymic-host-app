// src/GuestRoom.jsx - Con micrófono funcional para karaoke
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState('Conectando...');
    
    // Estados para el micrófono
    const [isMicActive, setIsMicActive] = useState(false);
    const [micPermission, setMicPermission] = useState('checking'); // 'granted', 'denied', 'checking'
    const [audioLevel, setAudioLevel] = useState(0);
    const [isTransmitting, setIsTransmitting] = useState(false);

    // Referencias para audio
    const mediaRecorderRef = useRef(null);
    const audioStreamRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const transmissionIntervalRef = useRef(null);

    // Función helper para debug
    const updateDebug = (message) => {
        console.log('🎤 GUEST DEBUG:', message);
        setDebugInfo(message);
    };

    // Configurar micrófono al cargar
    useEffect(() => {
        setupMicrophone();
        return () => {
            cleanup();
        };
    }, []);

    const setupMicrophone = async () => {
        try {
            updateDebug('Solicitando permisos de micrófono...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });

            audioStreamRef.current = stream;
            setMicPermission('granted');
            updateDebug('Micrófono configurado ✅');

            // Configurar análisis de audio para el visualizador
            setupAudioAnalysis(stream);

        } catch (error) {
            console.error('Error al acceder al micrófono:', error);
            setMicPermission('denied');
            updateDebug('❌ Micrófono denegado');
        }
    };

    const setupAudioAnalysis = (stream) => {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        analyserRef.current.fftSize = 256;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateAudioLevel = () => {
            if (analyserRef.current && isMicActive) {
                analyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                setAudioLevel(Math.min(100, (average / 255) * 100));
            } else {
                setAudioLevel(0);
            }
            animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        };

        updateAudioLevel();
    };

    const toggleMicrophone = async () => {
        if (!audioStreamRef.current) {
            updateDebug('❌ No hay stream de audio');
            return;
        }

        if (isMicActive) {
            // Apagar micrófono
            stopTransmission();
            setIsMicActive(false);
            updateDebug('🔇 Micrófono desactivado');
        } else {
            // Encender micrófono
            setIsMicActive(true);
            startTransmission();
            updateDebug('🎤 Micrófono activado - ¡Cantando!');
        }
    };

    const startTransmission = () => {
        if (!audioStreamRef.current) return;

        try {
            // Configurar MediaRecorder para capturar audio
            mediaRecorderRef.current = new MediaRecorder(audioStreamRef.current, {
                mimeType: 'audio/webm;codecs=opus'
            });

            const audioChunks = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    await transmitAudioChunk(audioBlob);
                    audioChunks.length = 0; // Limpiar chunks
                }
            };

            // Iniciar grabación
            mediaRecorderRef.current.start();

            // Configurar transmisión en intervalos de 200ms
            transmissionIntervalRef.current = setInterval(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    mediaRecorderRef.current.start(); // Reiniciar para el siguiente chunk
                }
            }, 200);

            setIsTransmitting(true);
            updateDebug('📡 Transmitiendo audio...');

        } catch (error) {
            console.error('Error iniciando transmisión:', error);
            updateDebug('❌ Error en transmisión');
        }
    };

    const stopTransmission = () => {
        if (transmissionIntervalRef.current) {
            clearInterval(transmissionIntervalRef.current);
            transmissionIntervalRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        setIsTransmitting(false);
        updateDebug('📡 Transmisión detenida');
    };

    const transmitAudioChunk = async (audioBlob) => {
        try {
            // Convertir blob a base64 para enviar a través de Supabase
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Audio = reader.result.split(',')[1]; // Remover el prefijo data:audio...
                
                // Enviar a través de Supabase Realtime
                const channel = supabase.channel('voice_transmission');
                await channel.send({
                    type: 'broadcast',
                    event: 'audio_chunk',
                    payload: {
                        partyId: partyId,
                        audioData: base64Audio,
                        timestamp: Date.now(),
                        guestId: 'guest_' + Math.random().toString(36).substr(2, 9)
                    }
                });
            };
            reader.readAsDataURL(audioBlob);
        } catch (error) {
            console.error('Error transmitiendo audio:', error);
        }
    };

    const cleanup = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (transmissionIntervalRef.current) {
            clearInterval(transmissionIntervalRef.current);
        }
        if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };

    // Lógica de carga de fiesta (igual que antes)
    useEffect(() => {
        const fetchPartyState = async () => {
            try {
                updateDebug('Cargando datos de la fiesta...');
                
                const { data: partyData, error: partyError } = await supabase
                    .from('parties')
                    .select('*')
                    .eq('id', partyId)
                    .single();
                
                if (partyError) {
                    updateDebug(`Error: ${partyError.message}`);
                    setLoading(false);
                    return;
                }
                setParty(partyData);
                updateDebug(`Conectado a: ${partyData.name}`);

                const { data: queueData, error: queueError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'queued')
                    .order('created_at', { ascending: true });
                
                if (!queueError) {
                    setSongQueue(queueData || []);
                }
                
                const { data: playedSongs, error: playingError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'played')
                    .order('updated_at', { ascending: false });

                if (!playingError && playedSongs && playedSongs.length > 0) {
                    setCurrentlyPlaying(playedSongs[0]);
                    updateDebug(`Sonando: ${playedSongs[0].title}`);
                } else {
                    setCurrentlyPlaying(null);
                }
                
                setLoading(false);
                updateDebug('¡Listo para cantar!');
            } catch (err) {
                updateDebug(`Error: ${err.message}`);
                setLoading(false);
            }
        };

        fetchPartyState();

        // Suscripción en tiempo real para cambios de canciones
        const channel = supabase.channel(`guest_party_${partyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'song_queue', 
                filter: `party_id=eq.${partyId}` 
            }, (payload) => {
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue((q) => [...q, payload.new]);
                }
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    setCurrentlyPlaying(payload.new);
                    setSongQueue((q) => q.filter(song => song.id !== payload.new.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [partyId]);

    if (loading) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh', 
                color: 'white', 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                textAlign: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '4em', marginBottom: '20px' }}>🎤</div>
                    <h2>Conectando al Karaoke...</h2>
                    <p style={{ opacity: 0.8 }}>{debugInfo}</p>
                </div>
            </div>
        );
    }

    if (!party) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh', 
                color: 'white', 
                background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
                textAlign: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '4em', marginBottom: '20px' }}>❌</div>
                    <h2>¡Fiesta no encontrada!</h2>
                    <p style={{ opacity: 0.8 }}>{debugInfo}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '20px',
            paddingBottom: '120px' // Espacio para el micrófono flotante
        }}>
            {/* Header */}
            <div style={{ 
                textAlign: 'center', 
                marginBottom: '30px',
                padding: '25px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
                <div style={{ fontSize: '3em', marginBottom: '10px' }}>🎉</div>
                <h1 style={{ margin: '0 0 10px 0', fontSize: '2.5em' }}>
                    {party.name}
                </h1>
                <div style={{
                    display: 'inline-block',
                    backgroundColor: 'rgba(76, 175, 80, 0.8)',
                    padding: '8px 20px',
                    borderRadius: '25px',
                    marginTop: '15px'
                }}>
                    🎤 Cantante
                </div>
            </div>

            {/* Debug info */}
            <div style={{ 
                fontSize: '0.9em', 
                textAlign: 'center',
                marginBottom: '20px',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '10px'
            }}>
                📡 {debugInfo} | 🎤 {micPermission === 'granted' ? 'Listo' : 'Sin permisos'}
            </div>

            {/* Canción actual */}
            <div style={{ 
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '25px', 
                borderRadius: '20px',
                backdropFilter: 'blur(10px)',
                marginBottom: '20px'
            }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.4em' }}>
                    🎵 Sonando Ahora
                </h3>
                
                {currentlyPlaying ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {currentlyPlaying.thumbnail_url && (
                            <img 
                                src={currentlyPlaying.thumbnail_url} 
                                alt={currentlyPlaying.title}
                                style={{ 
                                    width: '100px', 
                                    height: '75px', 
                                    borderRadius: '12px',
                                    border: '3px solid rgba(76, 175, 80, 0.6)'
                                }}
                            />
                        )}
                        <div>
                            <h2 style={{ 
                                margin: '0 0 10px 0', 
                                color: '#4CAF50',
                                fontSize: '1.4em'
                            }}>
                                {currentlyPlaying.title}
                            </h2>
                            <div style={{ 
                                backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                display: 'inline-block'
                            }}>
                                🎤 ¡Tu momento de brillar!
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px', opacity: 0.7 }}>
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>🎶</div>
                        <p>La música comenzará pronto...</p>
                    </div>
                )}
            </div>

            {/* Cola de canciones (versión compacta) */}
            <div style={{ 
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '20px',
                backdropFilter: 'blur(10px)'
            }}>
                <h3 style={{ margin: '0 0 15px 0' }}>
                    📋 Próximas: {songQueue.length} canciones
                </h3>
                
                {songQueue.length > 0 ? (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {songQueue.slice(0, 3).map((song, index) => (
                            <div key={song.id} style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                padding: '10px',
                                marginBottom: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '10px'
                            }}>
                                <span style={{ marginRight: '10px', fontWeight: 'bold' }}>
                                    {index + 1}.
                                </span>
                                <span style={{ fontSize: '0.9em' }}>{song.title}</span>
                            </div>
                        ))}
                        {songQueue.length > 3 && (
                            <div style={{ textAlign: 'center', opacity: 0.7, fontSize: '0.9em' }}>
                                ...y {songQueue.length - 3} más
                            </div>
                        )}
                    </div>
                ) : (
                    <p style={{ opacity: 0.7, margin: 0 }}>No hay canciones en cola</p>
                )}
            </div>

            {/* Control de Micrófono Flotante */}
            <div style={{
                position: 'fixed',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000
            }}>
                {micPermission === 'denied' && (
                    <div style={{
                        textAlign: 'center',
                        marginBottom: '20px',
                        padding: '15px',
                        background: 'rgba(244, 67, 54, 0.9)',
                        borderRadius: '15px',
                        border: '2px solid rgba(244, 67, 54, 0.6)'
                    }}>
                        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>
                            ❌ Micrófono bloqueado
                        </p>
                        <p style={{ margin: '0', fontSize: '0.9em' }}>
                            Permite el acceso al micrófono y recarga la página
                        </p>
                    </div>
                )}

                {micPermission === 'granted' && (
                    <div style={{ textAlign: 'center' }}>
                        {/* Visualizador de audio */}
                        {isMicActive && (
                            <div style={{
                                marginBottom: '15px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '3px'
                            }}>
                                {[...Array(8)].map((_, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            width: '4px',
                                            height: `${Math.max(4, (audioLevel / 100) * 30 * Math.random())}px`,
                                            backgroundColor: '#4CAF50',
                                            borderRadius: '2px',
                                            transition: 'height 0.1s'
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Botón principal del micrófono */}
                        <button
                            onClick={toggleMicrophone}
                            disabled={micPermission !== 'granted'}
                            style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                border: 'none',
                                fontSize: '2.5em',
                                background: isMicActive 
                                    ? 'linear-gradient(135deg, #ff4444, #cc0000)' 
                                    : 'linear-gradient(135deg, #666, #444)',
                                color: 'white',
                                cursor: 'pointer',
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                                transition: 'all 0.3s ease',
                                transform: isMicActive ? 'scale(1.1)' : 'scale(1)',
                                animation: isMicActive ? 'pulse 2s infinite' : 'none'
                            }}
                        >
                            {isMicActive ? '🎤' : '🔇'}
                        </button>

                        {/* Estado del micrófono */}
                        <div style={{
                            marginTop: '10px',
                            fontSize: '0.9em',
                            fontWeight: 'bold',
                            color: isMicActive ? '#4CAF50' : 'rgba(255, 255, 255, 0.7)'
                        }}>
                            {isMicActive ? '🎵 ¡Cantando!' : '🤫 Silenciado'}
                        </div>

                        {/* Indicador de transmisión */}
                        {isTransmitting && (
                            <div style={{
                                marginTop: '5px',
                                fontSize: '0.8em',
                                color: '#4CAF50',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px'
                            }}>
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: '#4CAF50',
                                    borderRadius: '50%',
                                    animation: 'blink 1s infinite'
                                }}></div>
                                EN VIVO
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes pulse {
                    0% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
                    50% { box-shadow: 0 8px 24px rgba(76, 175, 80, 0.6); }
                    100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0.3; }
                }
            `}</style>
        </div>
    );
}