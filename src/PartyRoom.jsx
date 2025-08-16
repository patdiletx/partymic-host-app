// src/PartyRoom.jsx - Versión con debug agresivo para encontrar el problema
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import VideoPlayer from './VideoPlayer';

export default function PartyRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [debugInfo, setDebugInfo] = useState('Iniciando...');

    // Función helper para actualizar debug info
    const updateDebug = (message) => {
        console.log('🐛 DEBUG:', message);
        setDebugInfo(message);
    };

    useEffect(() => {
        const fetchPartyAndQueue = async () => {
            try {
                updateDebug('Cargando datos de la fiesta...');
                
                // Cargar datos de la fiesta
                const { data: partyData, error: partyError } = await supabase
                    .from('parties')
                    .select('*')
                    .eq('id', partyId)
                    .single();
                
                if (partyError) {
                    updateDebug(`Error cargando fiesta: ${partyError.message}`);
                    setLoading(false);
                    return;
                }
                setParty(partyData);
                updateDebug(`Fiesta cargada: ${partyData.name}`);

                // Cargar cola de canciones
                updateDebug('Cargando cola de canciones...');
                const { data: queueData, error: queueError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'queued')
                    .order('created_at', { ascending: true });
                
                if (queueError) {
                    updateDebug(`Error cargando cola: ${queueError.message}`);
                } else {
                    setSongQueue(queueData || []);
                    updateDebug(`Cola cargada: ${queueData?.length || 0} canciones`);
                }
                
                // Buscar canción actual
                updateDebug('Buscando canción actual...');
                const { data: playedSongs, error: playingError } = await supabase
                    .from('song_queue')
                    .select('*')
                    .eq('party_id', partyId)
                    .eq('status', 'played')
                    .order('updated_at', { ascending: false });

                if (!playingError && playedSongs && playedSongs.length > 0) {
                    setCurrentlyPlaying(playedSongs[0]);
                    updateDebug(`Canción actual: ${playedSongs[0].title}`);
                } else {
                    updateDebug('No hay canción reproduciéndose');
                    setCurrentlyPlaying(null);
                }
                
                setLoading(false);
                updateDebug('Carga inicial completa');
            } catch (err) {
                updateDebug(`Error general: ${err.message}`);
                setLoading(false);
            }
        };

        fetchPartyAndQueue();

        // Suscripción en tiempo real
        updateDebug('Configurando suscripción en tiempo real...');
        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'song_queue', 
                filter: `party_id=eq.${partyId}` 
            }, (payload) => {
                updateDebug(`Actualización recibida: ${payload.eventType} - ${payload.new?.title || 'sin título'}`);
                
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue((currentQueue) => {
                        const newQueue = [...currentQueue, payload.new];
                        updateDebug(`Cola actualizada: ${newQueue.length} canciones`);
                        return newQueue;
                    });
                }
                
                if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                    updateDebug(`Nueva canción reproduciéndose: ${payload.new.title}`);
                    setCurrentlyPlaying(payload.new);
                    setSongQueue((currentQueue) => {
                        const filteredQueue = currentQueue.filter(song => song.id !== payload.new.id);
                        updateDebug(`Cola después de reproducir: ${filteredQueue.length} canciones`);
                        return filteredQueue;
                    });
                }
            })
            .subscribe();

        updateDebug('Suscripción configurada');

        return () => {
            supabase.removeChannel(channel);
            updateDebug('Limpieza realizada');
        };
    }, [partyId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        
        setIsSearching(true);
        updateDebug(`Buscando: ${searchQuery}`);
        
        try {
            const { data, error } = await supabase.functions.invoke('search-youtube', {
                body: { query: `${searchQuery} karaoke` }
            });
            
            if (error) {
                updateDebug(`Error en búsqueda: ${error.message}`);
                alert('Error en la búsqueda: ' + error.message);
            } else {
                updateDebug(`Encontrados ${data.results?.length || 0} resultados`);
                setSearchResults(data.results || []);
            }
        } catch (err) {
            updateDebug(`Error de conexión: ${err.message}`);
            alert('Error de conexión al buscar canciones');
        }
        setIsSearching(false);
    };

    const handleAddToQueue = async (song) => {
        try {
            updateDebug(`Agregando: ${song.title}`);
            const { error } = await supabase
                .from('song_queue')
                .insert({
                    party_id: partyId,
                    video_id: song.videoId,
                    title: song.title,
                    thumbnail_url: song.thumbnail,
                    status: 'queued'
                });

            if (error) {
                updateDebug(`Error agregando: ${error.message}`);
                alert('Error al agregar la canción: ' + error.message);
            } else {
                updateDebug('Canción agregada exitosamente');
                setSearchResults([]);
                setSearchQuery('');
            }
        } catch (err) {
            updateDebug(`Error conexión al agregar: ${err.message}`);
            alert('Error de conexión al agregar la canción');
        }
    };

    const handlePlayNext = async () => {
        updateDebug('🎵 INICIANDO REPRODUCCIÓN...');
        
        if (songQueue.length === 0) {
            updateDebug('❌ No hay canciones en la cola');
            alert("No hay más canciones en la cola.");
            setCurrentlyPlaying(null);
            return;
        }

        const songToPlay = songQueue[0];
        updateDebug(`🎯 Canción a reproducir: ${songToPlay.title} (ID: ${songToPlay.id})`);

        try {
            updateDebug('📡 Enviando actualización a Supabase...');
            const { error } = await supabase
                .from('song_queue')
                .update({ status: 'played' })
                .eq('id', songToPlay.id);

            if (error) {
                updateDebug(`❌ Error Supabase: ${error.message}`);
                alert("Error al actualizar la canción: " + error.message);
            } else {
                updateDebug(`✅ Supabase actualizado exitosamente`);
                
                // Actualización local inmediata y forzada
                updateDebug(`🔄 Actualizando estado local directamente...`);
                const updatedSong = { ...songToPlay, status: 'played' };
                
                setCurrentlyPlaying(updatedSong);
                setSongQueue((currentQueue) => {
                    const newQueue = currentQueue.filter(song => song.id !== songToPlay.id);
                    updateDebug(`📋 Nueva cola local: ${newQueue.length} canciones`);
                    return newQueue;
                });
                updateDebug(`🎉 Estado actualizado FORZADAMENTE. Ahora reproduciendo: ${updatedSong.title}`);
            }
        } catch (err) {
            updateDebug(`💥 Error de conexión: ${err.message}`);
            alert('Error de conexión al reproducir la canción');
        }
    };

    if (loading) return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh', 
            color: 'white', 
            background: '#282c34' 
        }}>
            <div>
                <h2>Cargando sala de fiesta...</h2>
                <p>{debugInfo}</p>
            </div>
        </div>
    );

    if (!party) return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh', 
            color: 'white', 
            background: '#282c34' 
        }}>
            <div>
                <h2>Fiesta no encontrada</h2>
                <p>{debugInfo}</p>
                <Link to="/">Volver al Dashboard</Link>
            </div>
        </div>
    );
    
    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    return (
        <div style={{ 
            display: 'flex', 
            height: '100vh', 
            color: 'white', 
            background: '#282c34' 
        }}>
            {/* Columna Izquierda: Reproductor y Controles */}
            <div style={{ 
                flex: 3, 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                borderRight: '1px solid #444' 
            }}>
                <h1>🎉 {party.name}</h1>
                <p style={{ marginBottom: '10px', opacity: 0.8 }}>
                    Sala del Anfitrión - Gestiona tu fiesta de karaoke
                </p>
                
                {/* Debug Info Prominente */}
                <div style={{ 
                    fontSize: '0.9em', 
                    marginBottom: '20px',
                    padding: '10px',
                    backgroundColor: '#333',
                    borderRadius: '8px',
                    border: '2px solid #ff6b6b',
                    maxWidth: '600px',
                    textAlign: 'center'
                }}>
                    <strong>🐛 DEBUG:</strong> {debugInfo}
                    <br />
                    <strong>Estado:</strong> {currentlyPlaying ? `Reproduciendo "${currentlyPlaying.title}"` : 'Sin canción actual'} | 
                    <strong> Cola:</strong> {songQueue.length} canciones
                    {currentlyPlaying && (
                        <div style={{ marginTop: '5px', fontSize: '0.8em', color: '#4CAF50' }}>
                            <strong>Video ID:</strong> {currentlyPlaying.video_id}
                        </div>
                    )}
                </div>
                
                <div style={{ 
                    background: 'black', 
                    width: '640px', 
                    height: '390px', 
                    marginBottom: '20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '8px',
                    border: '2px solid #444'
                }}>
                    {currentlyPlaying ? (
                        <div style={{ width: '100%', height: '100%' }}>
                            <VideoPlayer 
                                key={currentlyPlaying.id}
                                videoId={currentlyPlaying.video_id} 
                                onEnd={handlePlayNext}
                            />
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <p style={{ fontSize: '1.2em', marginBottom: '10px' }}>
                                🎵 Presiona "Play" para empezar la fiesta
                            </p>
                            <p style={{ opacity: 0.7 }}>
                                Agrega canciones a la cola y comienza a cantar
                            </p>
                            {songQueue.length === 0 && (
                                <p style={{ color: '#ff6b6b', marginTop: '10px' }}>
                                    ⚠️ Necesitas agregar canciones primero
                                </p>
                            )}
                        </div>
                    )}
                </div>
                
                <button 
                    onClick={handlePlayNext} 
                    disabled={songQueue.length === 0}
                    style={{ 
                        padding: '15px 30px', 
                        fontSize: '1.2em',
                        backgroundColor: songQueue.length > 0 ? '#4CAF50' : '#666',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: songQueue.length > 0 ? 'pointer' : 'not-allowed',
                        transition: 'background-color 0.3s'
                    }}
                >
                    {currentlyPlaying ? 'Siguiente Canción ⏭️' : 'Empezar Fiesta ▶️'}
                </button>
                
                {songQueue.length === 0 && (
                    <p style={{ marginTop: '10px', opacity: 0.7, fontSize: '0.9em' }}>
                        Agrega canciones en el panel de la derecha
                    </p>
                )}
            </div>

            {/* Columna Derecha: QR, Búsqueda y Cola */}
            <div style={{ 
                flex: 1, 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column',
                overflowY: 'auto'
            }}>
                {/* QR Code */}
                <div style={{ 
                    textAlign: 'center', 
                    background: '#1e2127', 
                    padding: '15px', 
                    borderRadius: '8px', 
                    marginBottom: '20px' 
                }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ 
                        background: 'white', 
                        padding: '10px', 
                        borderRadius: '8px', 
                        display: 'inline-block', 
                        margin: '10px 0' 
                    }}>
                        <QRCode value={joinUrl} size={128} />
                    </div>
                    <h4 style={{ 
                        letterSpacing: '2px', 
                        background: '#333', 
                        padding: '10px', 
                        borderRadius: '4px',
                        fontFamily: 'monospace'
                    }}>
                        {party.join_code}
                    </h4>
                </div>
                
                {/* Buscador */}
                <div style={{ marginBottom: '20px' }}>
                    <h4>Buscar Canción</h4>
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Artista y canción..."
                            style={{ 
                                padding: '10px', 
                                width: '100%', 
                                boxSizing: 'border-box',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                backgroundColor: '#333',
                                color: 'white'
                            }}
                        />
                        <button 
                            type="submit" 
                            disabled={isSearching || !searchQuery.trim()}
                            style={{ 
                                width: '100%', 
                                marginTop: '5px',
                                padding: '10px',
                                backgroundColor: isSearching ? '#666' : '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isSearching ? 'wait' : 'pointer'
                            }}
                        >
                            {isSearching ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>
                    
                    {/* Resultados de búsqueda */}
                    {searchResults.length > 0 && (
                        <div style={{ 
                            marginTop: '10px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            backgroundColor: '#333'
                        }}>
                            {searchResults.map(song => (
                                <div 
                                    key={song.videoId} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        padding: '10px',
                                        borderBottom: '1px solid #444'
                                    }}
                                >
                                    <img 
                                        src={song.thumbnail} 
                                        alt={song.title} 
                                        style={{ 
                                            width: '50px', 
                                            height: '37px',
                                            marginRight: '10px',
                                            borderRadius: '4px'
                                        }} 
                                    />
                                    <span style={{ 
                                        fontSize: '0.9em', 
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {song.title}
                                    </span>
                                    <button 
                                        onClick={() => handleAddToQueue(song)}
                                        style={{ 
                                            marginLeft: '10px',
                                            padding: '5px 10px',
                                            backgroundColor: '#4CAF50',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Cola de canciones */}
                <h3>Cola de Canciones ({songQueue.length})</h3>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {songQueue.length === 0 ? (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '20px', 
                            opacity: 0.7,
                            border: '2px dashed #444',
                            borderRadius: '8px'
                        }}>
                            <p>🎵 La cola está vacía</p>
                            <p style={{ fontSize: '0.9em' }}>
                                Busca y agrega canciones para empezar
                            </p>
                        </div>
                    ) : (
                        <ol style={{ padding: '0', margin: '0' }}>
                            {songQueue.map((song, index) => (
                                <li 
                                    key={song.id} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        marginBottom: '10px',
                                        padding: '10px',
                                        backgroundColor: index === 0 ? '#2a4d3a' : '#333',
                                        borderRadius: '4px',
                                        border: index === 0 ? '2px solid #4CAF50' : '1px solid #444'
                                    }}
                                >
                                    <span style={{ 
                                        marginRight: '10px', 
                                        fontWeight: 'bold',
                                        color: index === 0 ? '#4CAF50' : '#888',
                                        minWidth: '20px'
                                    }}>
                                        {index + 1}.
                                    </span>
                                    {song.thumbnail_url && (
                                        <img 
                                            src={song.thumbnail_url} 
                                            alt={song.title} 
                                            style={{ 
                                                width: '40px', 
                                                height: '30px',
                                                marginRight: '10px', 
                                                borderRadius: '4px' 
                                            }}
                                        />
                                    )}
                                    <span style={{ 
                                        fontWeight: index === 0 ? 'bold' : 'normal',
                                        color: index === 0 ? '#4CAF50' : 'white',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {song.title}
                                        {index === 0 && <span style={{ marginLeft: '10px' }}>▶️</span>}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
                
                <Link 
                    to="/" 
                    style={{ 
                        color: '#61dafb', 
                        marginTop: '20px',
                        textDecoration: 'none',
                        padding: '10px',
                        textAlign: 'center',
                        border: '1px solid #61dafb',
                        borderRadius: '4px'
                    }}
                >
                    ← Volver al Dashboard
                </Link>
            </div>
        </div>
    );
}