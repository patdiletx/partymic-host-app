// src/GuestRoom.jsx - Versión con WebRTC (Iniciador de la llamada)
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Peer from 'simple-peer';

export default function GuestRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('Conectando...');
    const peerRef = useRef();
    const audioStreamRef = useRef();
    const signalingChannelRef = useRef();

    useEffect(() => {
        const channel = supabase.channel(`webrtc-party-${partyId}`);
        signalingChannelRef.current = channel;

        const setupMicrophoneAndPeer = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
                audioStreamRef.current = stream;
                setConnectionStatus('Micrófono listo ✅');

                const peer = new Peer({
                    initiator: true,
                    trickle: false,
                    stream: stream,
                });
                peerRef.current = peer;

                peer.on('signal', (offer) => {
                    setConnectionStatus('Enviando oferta de conexión al anfitrión...');
                    channel.send({
                        type: 'broadcast',
                        event: 'signal-offer',
                        payload: { offer },
                    });
                });

                channel.on('broadcast', { event: 'signal-answer' }, ({ payload }) => {
                    if (payload.answer && !peer.connected) {
                        setConnectionStatus('Respuesta recibida, conectando...');
                        peer.signal(payload.answer);
                    }
                });

                peer.on('connect', () => {
                    setConnectionStatus('¡Conectado! 🎤 Listo para cantar.');
                });

                peer.on('error', (err) => {
                    setConnectionStatus(`Error de conexión: ${err.message}`);
                    console.error('Peer error:', err);
                });

                peer.on('close', () => {
                    setConnectionStatus('Conexión cerrada. Recarga para reconectar.');
                });

            } catch (err) {
                setConnectionStatus('Error: Permiso de micrófono denegado.');
                console.error('Mic error:', err);
            }
        };

        setupMicrophoneAndPeer();
        
        supabase.from('parties').select('*').eq('id', partyId).single().then(({ data }) => setParty(data));

        channel.subscribe((status) => {
            if (status !== 'SUBSCRIBED') {
                setConnectionStatus('Conectando al canal de señalización...');
            }
        });

        return () => {
            if (peerRef.current) peerRef.current.destroy();
            if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(track => track.stop());
            if (signalingChannelRef.current) supabase.removeChannel(signalingChannelRef.current);
        };
    }, [partyId]);

    if (!party) return <div style={{color: 'white', textAlign: 'center', paddingTop: '50px'}}>Cargando fiesta...</div>;

    return (
        <div style={{ padding: '20px', color: 'white', background: '#282c34', height: '100vh', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <h1>🎉 {party.name}</h1>
            <h2 style={{marginTop: '2rem'}}>Tu Micrófono de Karaoke</h2>
            <div style={{ marginTop: '3rem', fontSize: '1.5em', background: '#1e2127', padding: '20px', borderRadius: '15px' }}>
                <p style={{margin: 0}}>Estado de la Conexión:</p>
                <p style={{ fontWeight: 'bold', color: '#61dafb', marginTop: '10px' }}>{connectionStatus}</p>
            </div>
            <div style={{ marginTop: '3rem', fontSize: '5em' }}>🎤</div>
        </div>
    );
}