// src/PartyRoom.jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { QRCodeSVG as QRCode } from 'qrcode.react';

export default function PartyRoom() {
    const { partyId } = useParams();
    const [party, setParty] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchParty = async () => {
            const { data, error } = await supabase
                .from('parties')
                .select('*')
                .eq('id', partyId)
                .single();

            if (error) {
                console.error('Error fetching party:', error);
                alert('No se pudo encontrar la fiesta.');
            } else {
                setParty(data);
            }
            setLoading(false);
        };

        fetchParty();
    }, [partyId]);

    if (loading) {
        return <div>Cargando sala de fiesta...</div>;
    }

    if (!party) {
        return <div>Fiesta no encontrada. <Link to="/">Volver al Dashboard</Link></div>;
    }

    // URL hipotética para que los invitados se unan. La usaremos más adelante.
    const joinUrl = `${window.location.origin}/join/${party.join_code}`; 

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            {/* Columna Izquierda: Cola y Controles */}
            <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #ccc' }}>
                <h1>Fiesta: {party.name}</h1>
                <p>¡La fiesta está en vivo! Comparte el código o el QR para que se unan.</p>
                <hr/>
                <h2>Cola de Canciones (Próximamente)</h2>
            </div>

            {/* Columna Derecha: QR e Info */}
            <div style={{ width: '300px', padding: '20px', textAlign: 'center', background: '#f4f4f4' }}>
                <h3>¡Únete a la Fiesta!</h3>
                <p>Escanea este código con tu celular</p>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', display: 'inline-block' }}>
                    <QRCode value={joinUrl} size={180} />
                </div>
                <p style={{ marginTop: '20px' }}>O usa el código:</p>
                <h2 style={{ letterSpacing: '2px', background: '#ddd', padding: '10px', borderRadius: '4px' }}>
                    {party.join_code}
                </h2>
                <br/>
                <Link to="/">← Volver al Dashboard</Link>
            </div>
        </div>
    );
}