// src/App.jsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import HostDashboard from './HostDashboard';
import PartyRoom from './PartyRoom'; // Crearemos este componente a continuación
import './App.css';

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div>Cargando...</div>; // Muestra un loader mientras se verifica la sesión
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!session ? <Auth /> : <Navigate to="/" />} />
        <Route path="/" element={session ? <HostDashboard user={session.user} /> : <Navigate to="/login" />} />
        <Route path="/party/:partyId" element={session ? <PartyRoom /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;