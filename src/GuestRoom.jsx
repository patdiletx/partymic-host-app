// src/GuestRoom.jsx - Versión final simplificada sin WebRTC ni micrófono
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState('Conectando...');

    // Función helper para debug
    const updateDebug = (message) => {
        console.log('🎤 GUEST DEBUG:', message);
        setDebugInfo(message);
    };

    useEffect(() => {
        const fetchPartyState = async () => {
            try {
                updateDebug('Cargando datos de la fiesta...');
                
                // Cargar datos de la fiesta
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

                // Cargar cola de canciones
                const { data: queueData, error: queueError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'queued')
                    .order('created_at', { ascending: true });
                
                if (queueError) {
                    updateDebug(`Error cola: ${queueError.message}`);
                } else {
                    setSongQueue(queueData || []);
                    updateDebug(`Cola: ${queueData?.length || 0} canciones`);
                }
                
                // Buscar canción actual (usando la misma lógica que funciona en PartyRoom)
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
                    updateDebug('Sin música aún');
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

        // Suscripción en tiempo real
        updateDebug('Configurando actualizaciones...');
        const channel = supabase.channel(`guest_party_${partyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'song_queue', 
                filter: `party_id=eq.${partyId}` 
            }, (payload) => {
                updateDebug(`Actualización: ${payload.eventType}`);
                
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue((q) => {
                        const newQueue = [...q, payload.new];
                        updateDebug(`+1 canción (${newQueue.length} total)`);
                        return newQueue;
                    });
                }
                
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    updateDebug(`🎵 Nueva canción: ${payload.new.title}`);
                    setCurrentlyPlaying(payload.new);
                    setSongQueue((q) => {
                        const filteredQueue = q.filter(song => song.id !== payload.new.id);
                        updateDebug(`Cola: ${filteredQueue.length} canciones`);
                        return filteredQueue;
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            updateDebug('Desconectado');
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
                    <div style={{ 
                        margin: '20px auto',
                        width: '200px',
                        height: '4px',
                        background: 'rgba(255,255,255,0.3)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                            animation: 'loading 1.5s infinite',
                            transform: 'translateX(-100%)'
                        }}></div>
                    </div>
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
                    <p style={{ opacity: 0.8, marginBottom: '20px' }}>{debugInfo}</p>
                    <Link 
                        to="/join" 
                        style={{ 
                            color: 'white', 
                            textDecoration: 'none',
                            padding: '12px 24px',
                            border: '2px solid white',
                            borderRadius: '25px',
                            display: 'inline-block',
                            transition: 'all 0.3s'
                        }}
                    >
                        🔍 Buscar otra fiesta
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '20px'
        }}>
            {/* Header principal */}
            <div style={{ 
                textAlign: 'center', 
                marginBottom: '30px',
                padding: '25px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ fontSize: '3em', marginBottom: '10px' }}>🎉</div>
                <h1 style={{ 
                    margin: '0 0 10px 0', 
                    fontSize: '2.5em',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
                }}>
                    {party.name}
                </h1>
                <p style={{ margin: '0', opacity: 0.9, fontSize: '1.2em' }}>
                    ¡Bienvenido al karaoke!
                </p>
                <div style={{
                    display: 'inline-block',
                    backgroundColor: 'rgba(76, 175, 80, 0.8)',
                    color: 'white',
                    padding: '8px 20px',
                    borderRadius: '25px',
                    fontSize: '0.9em',
                    marginTop: '15px',
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                    🎤 Vista del Invitado
                </div>
            </div>

            {/* Debug info */}
            <div style={{ 
                fontSize: '0.9em', 
                textAlign: 'center',
                marginBottom: '20px',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
                <strong>📡 Estado:</strong> {debugInfo}
            </div>

            {/* Contenedor principal con dos columnas en desktop */}
            <div style={{ 
                display: 'flex',
                flexDirection: window.innerWidth > 768 ? 'row' : 'column',
                gap: '20px',
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                {/* Canción actual */}
                <div style={{ 
                    flex: '1',
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '25px', 
                    borderRadius: '20px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
                }}>
                    <h3 style={{ 
                        margin: '0 0 20px 0', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        fontSize: '1.4em'
                    }}>
                        🎵 Sonando Ahora
                    </h3>
                    
                    {currentlyPlaying ? (
                        <div>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '20px',
                                marginBottom: '20px'
                            }}>
                                {currentlyPlaying.thumbnail_url && (
                                    <img 
                                        src={currentlyPlaying.thumbnail_url} 
                                        alt={currentlyPlaying.title}
                                        style={{ 
                                            width: '100px', 
                                            height: '75px', 
                                            borderRadius: '12px',
                                            border: '3px solid rgba(76, 175, 80, 0.6)',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                                        }}
                                    />
                                )}
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ 
                                        margin: '0 0 10px 0', 
                                        color: '#4CAF50',
                                        fontSize: '1.4em',
                                        textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                                    }}>
                                        {currentlyPlaying.title}
                                    </h2>
                                    <div style={{ 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '0.9em',
                                        opacity: 0.9
                                    }}>
                                        <span style={{ 
                                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                            padding: '4px 12px',
                                            borderRadius: '15px',
                                            border: '1px solid rgba(76, 175, 80, 0.5)'
                                        }}>
                                            ▶️ En vivo
                                        </span>
                                        <span>🎤 ¡Es tu momento de brillar!</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Mensaje motivacional */}
                            <div style={{ 
                                textAlign: 'center',
                                padding: '20px',
                                background: 'rgba(76, 175, 80, 0.2)',
                                borderRadius: '15px',
                                border: '1px solid rgba(76, 175, 80, 0.3)'
                            }}>
                                <div style={{ fontSize: '2em', marginBottom: '10px' }}>🌟</div>
                                <p style={{ 
                                    margin: '0',
                                    fontSize: '1.1em',
                                    fontWeight: 'bold'
                                }}>
                                    ¡Canta con confianza!
                                </p>
                                <p style={{ 
                                    margin: '5px 0 0 0',
                                    opacity: 0.8,
                                    fontSize: '0.9em'
                                }}>
                                    Todos están aquí para divertirse 🎉
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '40px 20px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '15px',
                            border: '2px dashed rgba(255, 255, 255, 0.3)'
                        }}>
                            <div style={{ fontSize: '3em', marginBottom: '15px' }}>🎶</div>
                            <p style={{ fontSize: '1.2em', margin: '0 0 10px 0' }}>
                                La música comenzará pronto...
                            </p>
                            <p style={{ fontSize: '0.9em', margin: '0', opacity: 0.7 }}>
                                El anfitrión está preparando las canciones
                            </p>
                        </div>
                    )}
                </div>

                {/* Cola de canciones */}
                <div style={{ 
                    flex: '1',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '20px',
                    padding: '25px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
                }}>
                    <h3 style={{ 
                        margin: '0 0 20px 0', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        fontSize: '1.4em'
                    }}>
                        <span>📋 Próximas Canciones</span>
                        <span style={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.2)', 
                            color: 'white', 
                            padding: '6px 15px', 
                            borderRadius: '20px', 
                            fontSize: '0.8em',
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                            {songQueue.length}
                        </span>
                    </h3>
                    
                    {songQueue.length === 0 ? (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '40px 20px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '15px',
                            border: '2px dashed rgba(255, 255, 255, 0.3)'
                        }}>
                            <div style={{ fontSize: '3em', marginBottom: '15px' }}>🎵</div>
                            <p style={{ fontSize: '1.1em', margin: '0 0 10px 0' }}>
                                No hay canciones en cola
                            </p>
                            <p style={{ fontSize: '0.9em', margin: '0', opacity: 0.7 }}>
                                El anfitrión agregará más pronto
                            </p>
                        </div>
                    ) : (
                        <div style={{ 
                            maxHeight: '500px', 
                            overflowY: 'auto',
                            paddingRight: '10px'
                        }}>
                            {songQueue.map((song, index) => (
                                <div 
                                    key={song.id} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        padding: '15px',
                                        marginBottom: '12px',
                                        background: index === 0 
                                            ? 'rgba(76, 175, 80, 0.3)' 
                                            : 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        border: index === 0 
                                            ? '2px solid rgba(76, 175, 80, 0.6)' 
                                            : '1px solid rgba(255, 255, 255, 0.2)',
                                        transition: 'all 0.3s ease',
                                        backdropFilter: 'blur(5px)'
                                    }}
                                >
                                    <span style={{ 
                                        marginRight: '15px', 
                                        fontWeight: 'bold',
                                        color: index === 0 ? '#4CAF50' : 'rgba(255, 255, 255, 0.7)',
                                        minWidth: '30px',
                                        fontSize: '1.1em'
                                    }}>
                                        {index + 1}.
                                    </span>
                                    
                                    {song.thumbnail_url && (
                                        <img 
                                            src={song.thumbnail_url} 
                                            alt={song.title} 
                                            style={{ 
                                                width: '60px', 
                                                height: '45px',
                                                marginRight: '15px', 
                                                borderRadius: '8px',
                                                border: index === 0 
                                                    ? '2px solid rgba(76, 175, 80, 0.8)' 
                                                    : '1px solid rgba(255, 255, 255, 0.3)'
                                            }}
                                        />
                                    )}
                                    
                                    <div style={{ flex: 1 }}>
                                        <p style={{ 
                                            margin: '0',
                                            fontWeight: index === 0 ? 'bold' : 'normal',
                                            color: index === 0 ? '#4CAF50' : 'white',
                                            fontSize: index === 0 ? '1.1em' : '1em',
                                            lineHeight: '1.3'
                                        }}>
                                            {song.title}
                                        </p>
                                        {index === 0 && (
                                            <p style={{ 
                                                margin: '5px 0 0 0', 
                                                color: 'rgba(76, 175, 80, 0.9)', 
                                                fontSize: '0.8em',
                                                fontWeight: 'bold'
                                            }}>
                                                ⏭️ Siguiente en la lista
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer con información */}
            <div style={{ 
                marginTop: '30px', 
                textAlign: 'center', 
                padding: '20px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '15px',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>
                    🎤 ¡Disfruta cantando!
                </p>
                <p style={{ margin: '0', fontSize: '0.9em', opacity: 0.8 }}>
                    Las canciones se actualizan automáticamente • Vista sincronizada en tiempo real
                </p>
            </div>

            <style jsx>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
}