// src/GuestRoom.jsx - Versión simplificada sin WebRTC
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPartyState = async () => {
            try {
                // Cargar datos de la fiesta
                const { data: partyData, error: partyError } = await supabase
                    .from('parties')
                    .select('*')
                    .eq('id', partyId)
                    .single();
                
                if (partyError) {
                    console.error('Error fetching party:', partyError);
                    setLoading(false);
                    return;
                }
                setParty(partyData);

                // Cargar cola de canciones
                const { data: queueData, error: queueError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'queued')
                    .order('created_at', { ascending: true });
                
                if (queueError) {
                    console.error('Error fetching queue:', queueError);
                } else {
                    setSongQueue(queueData || []);
                }
                
                // CORRECCIÓN: Buscar canción actual sin .single() para evitar error 400
                const { data: playingData, error: playingError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'played')
                    .order('updated_at', { ascending: false })
                    .limit(1);

                // Solo establecer si encontramos una canción
                if (!playingError && playingData && playingData.length > 0) {
                    setCurrentlyPlaying(playingData[0]);
                }
                
                setLoading(false);
            } catch (err) {
                console.error('Error cargando estado de la fiesta:', err);
                setLoading(false);
            }
        };

        fetchPartyState();

        // Suscripción en tiempo real para actualizaciones
        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'song_queue', 
                filter: `party_id=eq.${partyId}` 
            }, (payload) => {
                console.log('Actualización en tiempo real:', payload);
                
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue((q) => [...q, payload.new]);
                }
                
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    setCurrentlyPlaying(payload.new);
                    setSongQueue((q) => q.filter(song => song.id !== payload.new.id));
                }
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [partyId]);

    if (loading) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh', 
                color: 'white', 
                background: '#282c34' 
            }}>
                <div style={{ textAlign: 'center' }}>
                    <h2>🎵 Entrando a la fiesta...</h2>
                    <p>Preparando el karaoke</p>
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
                background: '#282c34' 
            }}>
                <div style={{ textAlign: 'center' }}>
                    <h2>❌ ¡Error!</h2>
                    <p>No se encontró la fiesta.</p>
                    <p style={{ fontSize: '0.9em', opacity: 0.7 }}>
                        Verifica que el código sea correcto
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            padding: '20px', 
            color: 'white', 
            background: '#282c34', 
            minHeight: '100vh',
            maxWidth: '600px',
            margin: '0 auto'
        }}>
            {/* Header de la fiesta */}
            <div style={{ 
                textAlign: 'center', 
                marginBottom: '30px',
                padding: '20px',
                background: '#1e2127',
                borderRadius: '12px',
                border: '2px solid #4CAF50'
            }}>
                <h1 style={{ margin: '0 0 10px 0', fontSize: '2em' }}>
                    🎉 {party.name}
                </h1>
                <p style={{ margin: '0', opacity: 0.9, fontSize: '1.1em' }}>
                    ¡Bienvenido al karaoke!
                </p>
                <div style={{
                    display: 'inline-block',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '0.9em',
                    marginTop: '10px'
                }}>
                    🎤 Vista del Invitado
                </div>
            </div>
            
            {/* Canción actual */}
            <div style={{ 
                border: '2px solid #4CAF50', 
                padding: '20px', 
                borderRadius: '12px', 
                marginBottom: '30px',
                background: 'linear-gradient(135deg, #1e2127 0%, #2a4d3a 100%)'
            }}>
                <h3 style={{ 
                    margin: '0 0 15px 0', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px' 
                }}>
                    🎵 Sonando Ahora:
                </h3>
                {currentlyPlaying ? (
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '15px' 
                    }}>
                        {currentlyPlaying.thumbnail_url && (
                            <img 
                                src={currentlyPlaying.thumbnail_url} 
                                alt={currentlyPlaying.title}
                                style={{ 
                                    width: '80px', 
                                    height: '60px', 
                                    borderRadius: '8px',
                                    border: '2px solid #4CAF50'
                                }}
                            />
                        )}
                        <div>
                            <h2 style={{ 
                                margin: '0', 
                                color: '#4CAF50',
                                fontSize: '1.3em'
                            }}>
                                {currentlyPlaying.title}
                            </h2>
                            <p style={{ 
                                margin: '5px 0 0 0', 
                                opacity: 0.8,
                                fontSize: '0.9em'
                            }}>
                                🎤 ¡Es tu momento de brillar!
                            </p>
                        </div>
                    </div>
                ) : (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '20px',
                        opacity: 0.7
                    }}>
                        <p style={{ fontSize: '1.1em', margin: '0' }}>
                            🎶 La música comenzará pronto...
                        </p>
                        <p style={{ fontSize: '0.9em', margin: '10px 0 0 0' }}>
                            El anfitrión seleccionará la primera canción
                        </p>
                    </div>
                )}
            </div>

            {/* Cola de canciones */}
            <div style={{ 
                border: '1px solid #444', 
                borderRadius: '12px', 
                padding: '20px',
                background: '#1e2127'
            }}>
                <h3 style={{ 
                    margin: '0 0 20px 0', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between'
                }}>
                    <span>📋 Siguientes en la Cola:</span>
                    <span style={{ 
                        backgroundColor: '#666', 
                        color: 'white', 
                        padding: '4px 12px', 
                        borderRadius: '12px', 
                        fontSize: '0.8em' 
                    }}>
                        {songQueue.length} canciones
                    </span>
                </h3>
                
                {songQueue.length === 0 ? (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '30px',
                        opacity: 0.7,
                        border: '2px dashed #444',
                        borderRadius: '8px'
                    }}>
                        <p style={{ fontSize: '1.1em', margin: '0 0 10px 0' }}>
                            🎵 La cola está vacía
                        </p>
                        <p style={{ fontSize: '0.9em', margin: '0' }}>
                            El anfitrión agregará canciones pronto
                        </p>
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {songQueue.map((song, index) => (
                            <div 
                                key={song.id} 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    padding: '15px',
                                    marginBottom: '10px',
                                    backgroundColor: index === 0 ? '#2a4d3a' : '#333',
                                    borderRadius: '8px',
                                    border: index === 0 ? '2px solid #4CAF50' : '1px solid #444',
                                    transition: 'transform 0.2s',
                                    cursor: 'default'
                                }}
                                onMouseOver={(e) => {
                                    if (index !== 0) e.target.style.backgroundColor = '#444';
                                }}
                                onMouseOut={(e) => {
                                    if (index !== 0) e.target.style.backgroundColor = '#333';
                                }}
                            >
                                <span style={{ 
                                    marginRight: '15px', 
                                    fontWeight: 'bold',
                                    color: index === 0 ? '#4CAF50' : '#888',
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
                                            width: '50px', 
                                            height: '37px',
                                            marginRight: '15px', 
                                            borderRadius: '4px',
                                            border: index === 0 ? '2px solid #4CAF50' : '1px solid #666'
                                        }}
                                    />
                                )}
                                
                                <div style={{ flex: 1 }}>
                                    <p style={{ 
                                        margin: '0',
                                        fontWeight: index === 0 ? 'bold' : 'normal',
                                        color: index === 0 ? '#4CAF50' : 'white',
                                        fontSize: index === 0 ? '1.1em' : '1em'
                                    }}>
                                        {song.title}
                                    </p>
                                    {index === 0 && (
                                        <p style={{ 
                                            margin: '5px 0 0 0', 
                                            color: '#4CAF50', 
                                            fontSize: '0.8em',
                                            opacity: 0.9
                                        }}>
                                            ▶️ Siguiente en reproducirse
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer con información */}
            <div style={{ 
                marginTop: '30px', 
                textAlign: 'center', 
                padding: '20px',
                background: '#1e2127',
                borderRadius: '8px',
                opacity: 0.8
            }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.9em' }}>
                    🎤 ¡Prepárate para cantar!
                </p>
                <p style={{ margin: '0', fontSize: '0.8em', opacity: 0.7 }}>
                    Las canciones se actualizan automáticamente
                </p>
            </div>
        </div>
    );
}