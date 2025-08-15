// src/HostDashboard.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// 1. Nos aseguramos de que la función para generar el código esté aquí y completa.
const generateJoinCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PARTY-${result}`;
};

export default function HostDashboard({ user }) {
    const [loading, setLoading] = useState(false);
    const [partyName, setPartyName] = useState('');
    const navigate = useNavigate();

    const createParty = async () => {
        if (!partyName) {
            alert('Por favor, dale un nombre a tu fiesta.');
            return;
        }

        setLoading(true);
        const joinCode = generateJoinCode(); // Esta función ahora existe y devuelve un string.

        const { data, error } = await supabase
            .from('parties')
            .insert({
                host_user_id: user.id,
                name: partyName,
                join_code: joinCode, // Le pasamos el código generado.
            })
            .select()
            .single();

        if (error) {
            // El error que veías aparecía aquí.
            alert('Error al crear la fiesta: ' + error.message);
            setLoading(false);
        } else {
            navigate(`/party/${data.id}`);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2>Panel del Anfitrión</h2>
            <p>Bienvenido, {user.email}</p>
            <input
                type="text"
                placeholder="Nombre de la fiesta (ej: Viernes de Karaoke)"
                value={partyName}
                // 2. CORRECCIÓN: Cambiado 'e.targe.value' a 'e.target.value'
                onChange={(e) => setPartyName(e.target.value)}
                style={{ padding: '10px', width: '300px', marginRight: '10px' }}
            />
            <button onClick={createParty} disabled={loading}>
                {loading ? 'Creando...' : '🎉 Crear Nueva Fiesta'}
            </button>
            <hr style={{ margin: '20px 0' }} />
            <button onClick={() => supabase.auth.signOut()}>
                Cerrar Sesión
            </button>
        </div>
    );
}