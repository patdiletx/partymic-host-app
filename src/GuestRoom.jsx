// src/GuestRoom.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Microphone from './Microphone';
import Peer from 'simple-peer';

// ⚠️ ¡IMPORTANTE! REEMPLAZA ESTA URL CON LA DE TU SERVIDOR DE RENDER
const SIGNALING_URL = 'wss://partymic-signaling-server.onrender.com'; // Ejemplo, usa la tuya

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [songQueue, setSongQueue] = useState([]);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Refs para WebSocket y Peer
    const socket = useRef();
    const peer = useRef();

    // Efecto para la lógica de Supabase (sin cambios)
    useEffect(() => {
        const fetchPartyState = async () => {
            const { data: partyData } = await supabase.from('parties').select('*').eq('id', partyId).single();
            setParty(partyData);
            const { data: queueData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'queued').order('created_at', { ascending: true });
            setSongQueue(queueData || []);
            const { data: playingData } = await supabase.from('song_queue').select('*').eq('party_id', partyId).eq('status', 'played').order('updated_at', { ascending: false }).limit(1).single();
            setCurrentlyPlaying(playingData);
            setLoading(false);
        };
        fetchPartyState();

        const channel = supabase.channel(`party_queue_${partyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'song_queue', filter: `party_id=eq.${partyId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') setSongQueue((q) => [...q, payload.new]);
                    if (payload.eventType === 'UPDATE' && payload.new.status === 'played') {
                        setCurrentlyPlaying(payload.new);
                        setSongQueue((q) => q.filter(song => song.id !== payload.new.id));
                    }
                }
            ).subscribe();
        return () => supabase.removeChannel(channel);
    }, [partyId]);

    // Efecto para WebRTC y señalización
    useEffect(() => {
        socket.current = new WebSocket(SIGNALING_URL);

        socket.current.onopen = () => {
            console.log("Invitado: Conectado al servidor de señalización");
            socket.current.send(JSON.stringify({ type: 'join', roomId: partyId }));
        };

        socket.current.onmessage = (message) => {
            const data = JSON.parse(message.data);
            // Si el peer existe, le pasamos la señal recibida
            if (peer.current) {
                peer.current.signal(data);
            }
        };

        return () => {
            if (socket.current) socket.current.close();
            if (peer.current) peer.current.destroy();
        };
    }, [partyId]);

    const handleStreamReady = (stream) => {
        console.log("Invitado: Micrófono listo, creando peer...");
        // `initiator: true` porque el invitado inicia la "llamada"
        peer.current = new Peer({ initiator: true, stream: stream });

        // Cuando el peer genera una señal, la enviamos por el WebSocket
        peer.current.on('signal', (data) => {
            socket.current.send(JSON.stringify(data));
        });

        peer.current.on('error', (err) => console.error('Error en Peer (invitado):', err));
    };
      
    if (loading) return <div>Entrando a la fiesta...</div>;
    if (!party) return <div>¡Error! No se encontró la fiesta.</div>;

    return (
        <div style={{ padding: '20px', color: 'white', background: '#282c34', minHeight: '100vh', paddingBottom: '150px' }}>
            <h1>¡Bienvenido a "{party.name}"!</h1>
            <div style={{ border: '1px solid #444', padding: '15px', borderRadius: '8px', margin: '20px 0' }}>
                <h3>Sonando Ahora:</h3>
                {currentlyPlaying ? <h2>{currentlyPlaying.title}</h2> : <p>La música comenzará pronto...</p>}
            </div>
            <h3>Siguientes en la Cola:</h3>
            {songQueue.length === 0 ? <p>La cola está vacía.</p> : (
                <ol>{songQueue.map(song => (<li key={song.id} style={{ fontSize: '1.2em', margin: '10px 0' }}>{song.title}</li>))}</ol>
            )}
            <Microphone onStreamReady={handleStreamReady} />
        </div>
    );
}