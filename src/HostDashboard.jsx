// src/HostDashboard.jsx (Modificado)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Importar useNavigate
import { supabase } from './supabaseClient';

const generateJoinCode = () => { /* ... (sin cambios) ... */ };

export default function HostDashboard({ user }) {
    const [loading, setLoading] = useState(false);
    const [partyName, setPartyName] = useState('');
    const navigate = useNavigate(); // 2. Inicializar useNavigate

    const createParty = async () => {
        if (!partyName) {
            alert('Por favor, dale un nombre a tu fiesta.');
            return;
        }

        setLoading(true);
        const joinCode = generateJoinCode();
        const { data, error } = await supabase
            .from('parties')
            .insert({ host_user_id: user.id, name: partyName, join_code: joinCode })
            .select()
            .single();

        if (error) {
            alert('Error al crear la fiesta: ' + error.message);
            setLoading(false);
        } else {
            // 3. Redirigir a la nueva página de la fiesta
            navigate(`/party/${data.id}`);
        }
        // No necesitamos setLoading(false) aquí porque ya navegamos a otra página
    };

    return (
         // ... (el resto del JSX no cambia) ...
        <div style={{ padding: '20px' }}>
            <h2>Panel del Anfitrión</h2>
            <p>Bienvenido, {user.email}</p>
            <input
                type="text"
                placeholder="Nombre de la fiesta (ej: Viernes de Karaoke)"
                value={partyName}
                onChange={(e) => setPartyName(e.targe.value)}
                style={{ padding: '10px', width: '300px', marginRight: '10px' }}
            />
            <button onClick={createParty} disabled={loading}>
                {loading ? 'Creando...' : '🎉 Crear Nueva Fiesta'}
            </button>
            <hr style={{ margin: '20px 0' }}/>
            <button onClick={() => supabase.auth.signOut()}>
                Cerrar Sesión
            </button>
        </div>
    );
}