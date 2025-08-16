// src/App.jsx

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import HostDashboard from './HostDashboard';
import PartyRoom from './PartyRoom';
import JoinPage from './JoinPage';
import GuestRoom from './GuestRoom';
import './App.css'; // Asegúrate de que la importación sea a App.css

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };
    fetchSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div>Cargando...</div>;

  return (
    <Router>
      <Routes>
        {/* --- RUTAS PÚBLICAS (INVITADO) --- */}
        {/* Un invitado no necesita iniciar sesión para acceder a estas. */}
        <Route path="/join" element={<JoinPage />} />
        <Route path="/guest/party/:partyId" element={<GuestRoom />} />


        {/* --- RUTAS PROTEGIDAS (ANFITRIÓN) --- */}
        {/* Si no hay sesión, estas rutas redirigen al login. */}
        <Route path="/login" element={!session ? <Auth /> : <Navigate to="/" />} />
        <Route path="/" element={session ? <HostDashboard user={session.user} /> : <Navigate to="/login" />} />
        
        {/* ESTA ES LA RUTA CRÍTICA: Debe renderizar PartyRoom (la del anfitrión) */}
        <Route path="/party/:partyId" element={session ? <PartyRoom /> : <Navigate to="/login" />} />

      </Routes>
    </Router>
  );
}

export default App;