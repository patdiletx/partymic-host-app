// src/GuestRoom.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Microphone from './Microphone'; // <-- 1. IMPORTAR EL COMPONENTE

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Lógica para obtener el estado actual de la fiesta
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
            else setSongQueue(queueData);
            
            const { data: playingData, error: playingError } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1).single();
            if (!playingError) setCurrentlyPlaying(playingData);
            
            setLoading(false);
        };

        fetchPartyState();

        // Suscripción a cambios
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
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [partyId]);


    if (loading) return <div>Entrando a la fiesta...</div>;
    if (!party) return <div>¡Error! No se encontró la fiesta.</div>;

    return (
        <div style={{ padding: '20px', color: 'white', background: '#282c34', minHeight: '100vh', paddingBottom: '150px' /* Espacio para el botón */ }}>
            <h1>¡Bienvenido a "{party.name}"!</h1>
            
            <div style={{ border: '1px solid #444', padding: '15px', borderRadius: '8px', margin: '20px 0' }}>
                <h3>Sonando Ahora:</h3>
                {currentlyPlaying ? (
                    <h2>{currentlyPlaying.title}</h2>
                ) : (
                    <p>La música comenzará pronto...</p>
                )}
            </div>

            <h3>Siguientes en la Cola:</h3>
            {songQueue.length === 0 
                ? <p>La cola está vacía.</p> 
                : (
                    <ol>
                        {songQueue.map(song => (
                            <li key={song.id} style={{ fontSize: '1.2em', margin: '10px 0' }}>
                                {song.title}
                            </li>
                        ))}
                    </ol>
                )
            }

            {/* -- 2. AÑADIR EL COMPONENTE DE MICRÓFONO AL FINAL -- */}
            <Microphone />
        </div>
    );
}