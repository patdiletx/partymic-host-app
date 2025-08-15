// src/JoinPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function JoinPage() {
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!joinCode) return;

        setLoading(true);
        setError('');

        const { data, error: dbError } = await supabase
            .from('parties')
            .select('id')
            .eq('join_code', joinCode.toUpperCase())
            .eq('is_active', true)
            .single();

        if (dbError || !data) {
            setError('Fiesta no encontrada o código incorrecto.');
            setLoading(false);
        } else {
            // Si la fiesta existe, redirigimos al invitado a la sala
            navigate(`/guest/party/${data.id}`);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
            <h1>PartyMic</h1>
            <h3>Únete a la Fiesta</h3>
            <form onSubmit={handleJoin}>
                <input
                    type="text"
                    placeholder="PARTY-XXXXXX"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    style={{ padding: '12px', fontSize: '1.2em', textAlign: 'center', textTransform: 'uppercase', width: '100%', boxSizing: 'border-box' }}
                />
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', marginTop: '10px', fontSize: '1.1em' }}>
                    {loading ? 'Buscando...' : 'Unirse'}
                </button>
            </form>
            {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
        </div>
    );
}