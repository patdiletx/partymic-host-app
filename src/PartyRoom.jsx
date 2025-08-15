// src/PartyRoom.jsx
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
            const { data: partyData, error: partyError } = await supabase.from('parties').select('*').eq('id', partyId).single();
            if (partyError) console.error('Error fetching party:', partyError);
            else setParty(partyData);

            const { data: queueData, error: queueError } = await supabase
                .from('song_queue')
                .select('*')
                .eq('party_id', partyId)
                .eq('status', 'queued')
                .order('created_at', { ascending: true });
            
            if (queueError) console.error('Error fetching queue:', queueError);
            else setSongQueue(queueData);
            
            setLoading(false);
        };

        fetchPartyAndQueue();

        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setSongQueue((currentQueue) => [...currentQueue, payload.new]);
                    }
                    if (payload.eventType === 'UPDATE') {
                        setSongQueue((currentQueue) => currentQueue.filter(song => song.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [partyId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery) return;
        setIsSearching(true);
        const { data, error } = await supabase.functions.invoke('search-youtube', { body: { query: searchQuery } });
        if (error) alert('Error en la búsqueda: ' + error.message);
        else setSearchResults(data.results);
        setIsSearching(false);
    };

    const handleAddToQueue = async (song) => {
        const { error } = await supabase.from('song_queue').insert({ party_id: partyId, video_id: song.videoId, title: song.title, thumbnail_url: song.thumbnail, status: 'queued' });
        if (error) alert('Error al agregar la canción: ' + error.message);
        else { setSearchResults([]); setSearchQuery(''); }
    };

    const handlePlayNext = async () => {
        const songToPlay = songQueue[0];
        if (!songToPlay) {
            alert("No hay más canciones en la cola.");
            setCurrentlyPlaying(null);
            return;
        }

        const { error } = await supabase
            .from('song_queue')
            .update({ status: 'played' })
            .eq('id', songToPlay.id);

        if (error) {
            alert("Error al actualizar la canción: " + error.message);
        } else {
            setCurrentlyPlaying(songToPlay);
        }
    };

    if (loading) return <div>Cargando sala de fiesta...</div>;
    if (!party) return <div>Fiesta no encontrada. <Link to="/">Volver al Dashboard</Link></div>;
    
    const joinUrl = `${window.location.origin}/join/${party.join_code}`;

    return (
        <div style={{ display: 'flex', height: '100vh', color: 'white', background: '#282c34' }}>
            <div style={{ flex: 3, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h1>Fiesta: {party.name}</h1>
                <div style={{ background: 'black', width: '640px', height: '390px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {currentlyPlaying ? (
                        <VideoPlayer 
                            key={currentlyPlaying.id}
                            videoId={currentlyPlaying.video_id} 
                            onEnd={handlePlayNext}
                        />
                    ) : (
                        <p>Presiona "Play" para empezar la fiesta</p>
                    )}
                </div>
                <button onClick={handlePlayNext} style={{ padding: '10px 20px', fontSize: '1.2em' }}>
                    {currentlyPlaying ? 'Siguiente Canción ⏯️' : 'Empezar Fiesta ▶️'}
                </button>
            </div>

            <div style={{ flex: 1, padding: '20px', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                <div style={{ textAlign: 'center', background: '#1e2127', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h3>¡Únete a la Fiesta!</h3>
                    <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block', margin: '10px 0' }}>
                        <QRCode value={joinUrl} size={128} />
                    </div>
                    <h4 style={{ letterSpacing: '2px', background: '#333', padding: '10px', borderRadius: '4px' }}>
                        {party.join_code}
                    </h4>
                </div>
                
                {/* --- Módulo de Búsqueda --- */}
                <div>
                    <h4>Buscar Canción</h4>
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Artista y nombre de la canción..."
                            style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                        <button type="submit" disabled={isSearching} style={{ width: '100%', marginTop: '5px' }}>
                            {isSearching ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>
                    {/* FIX 2: Restaurado el mapeo de resultados de búsqueda con el botón onClick */}
                    {searchResults.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                            {searchResults.map(song => (
                                <li key={song.videoId} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                    <img src={song.thumbnail} alt={song.title} style={{ width: '50px', marginRight: '10px' }} />
                                    <span style={{ fontSize: '0.9em', flex: 1 }}>{song.title}</span>
                                    <button onClick={() => handleAddToQueue(song)} style={{ marginLeft: 'auto' }}>+</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <h3 style={{ marginTop: '20px' }}>Siguientes en la Cola:</h3>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {songQueue.length === 0 
                        ? <p>La cola está vacía.</p> 
                        : (<ol>{songQueue.map((song, index) => (
                            <li key={song.id} style={{ fontWeight: index === 0 ? 'bold' : 'normal' }}>
                                {song.title}
                            </li>
                        ))}</ol>)
                    }
                </div>
                <Link to="/" style={{ color: '#61dafb', marginTop: 'auto' }}>← Volver al Dashboard</Link>
            </div>
        </div>
    );
}