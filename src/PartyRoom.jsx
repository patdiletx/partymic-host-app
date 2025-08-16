// src/PartyRoom.jsx - Versión simplificada para MVP funcional
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

    useEffect(() => {
        const fetchPartyAndQueue = async () => {
            // Cargar datos de la fiesta
            const { data: partyData, error: partyError } = await supabase
                .from('parties')
                .select('*')
                .eq('id', partyId)
                .single();
            
            if (partyError) {
                console.error('Error fetching party:', partyError);
            } else {
                setParty(partyData);
            }

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
        };

        fetchPartyAndQueue();

        // Suscripción en tiempo real para actualizaciones de la cola
        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'song_queue', 
                filter: `party_id=eq.${partyId}` 
            }, (payload) => {
                if (payload.eventType === 'INSERT' && payload.new.status === 'queued') {
                    setSongQueue((currentQueue) => [...currentQueue, payload.new]);
                }
                if (payload.eventType === 'UPDATE') {
                    if (payload.new.status === 'played') {
                        // Una canción empezó a reproducirse
                        setCurrentlyPlaying(payload.new);
                        setSongQueue((currentQueue) => 
                            currentQueue.filter(song => song.id !== payload.new.id)
                        );
                    }
                }
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [partyId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        
        setIsSearching(true);
        try {
            const { data, error } = await supabase.functions.invoke('search-youtube', {
                body: { query: `${searchQuery} karaoke` }
            });
            
            if (error) {
                console.error('Search error:', error);
                alert('Error en la búsqueda: ' + error.message);
            } else {
                setSearchResults(data.results || []);
            }
        } catch (err) {
            console.error('Search failed:', err);
            alert('Error de conexión al buscar canciones');
        }
        setIsSearching(false);
    };

    const handleAddToQueue = async (song) => {
        try {
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
                console.error('Error adding song:', error);
                alert('Error al agregar la canción: ' + error.message);
            } else {
                setSearchResults([]);
                setSearchQuery('');
                console.log('Canción agregada exitosamente');
            }
        } catch (err) {
            console.error('Failed to add song:', err);
            alert('Error de conexión al agregar la canción');
        }
    };

    const handlePlayNext = async () => {
        const songToPlay = songQueue[0];
        if (!songToPlay) {
            alert("No hay más canciones en la cola.");
            setCurrentlyPlaying(null);
            return;
        }

        try {
            const { error } = await supabase
                .from('song_queue')
                .update({ status: 'played' })
                .eq('id', songToPlay.id);

            if (error) {
                console.error('Error playing song:', error);
                alert("Error al actualizar la canción: " + error.message);
            } else {
                console.log('Canción marcada como reproducida');
                // La suscripción en tiempo real se encargará de actualizar el estado
            }
        } catch (err) {
            console.error('Failed to play song:', err);
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
            Cargando sala de fiesta...
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
            Fiesta no encontrada. <Link to="/">Volver al Dashboard</Link>
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
                <p style={{ marginBottom: '20px', opacity: 0.8 }}>
                    Sala del Anfitrión - Gestiona tu fiesta de karaoke
                </p>
                
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
                        <VideoPlayer 
                            key={currentlyPlaying.id}
                            videoId={currentlyPlaying.video_id} 
                            onEnd={handlePlayNext}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <p style={{ fontSize: '1.2em', marginBottom: '10px' }}>
                                🎵 Presiona "Play" para empezar la fiesta
                            </p>
                            <p style={{ opacity: 0.7 }}>
                                Agrega canciones a la cola y comienza a cantar
                            </p>
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
                {/* QR Code y código para unirse */}
                <div style={{ 
                    textAlign: 'center', 
                    background: '#1e2127', 
                    padding: '15px', 
                    borderRadius: '8px', 
                    marginBottom: '20px' 
                }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <p style={{ fontSize: '0.9em', opacity: 0.8, margin: '5px 0' }}>
                        Escanea con tu celular
                    </p>
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
                
                {/* Buscador de canciones */}
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
                <h3 style={{ marginTop: '20px' }}>Cola de Canciones ({songQueue.length})</h3>
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
                        borderRadius: '4px',
                        transition: 'background-color 0.3s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#61dafb33'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                    ← Volver al Dashboard
                </Link>
            </div>
        </div>
    );
}