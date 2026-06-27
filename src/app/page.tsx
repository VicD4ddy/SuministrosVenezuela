'use client';

import React, { useState, useEffect } from 'react';

import { useRealtimeCentros } from '../hooks/useRealtimeCentros';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useOledDark } from '../hooks/useOledDark';
import { useAuth } from '../hooks/useAuth';
import { getCategoriaLabel } from '../lib/categorias';
import { obtenerEstadoPorCoordenadas } from '../lib/geo';

import { Header } from '../components/Header';
import { BottomNav, TabId } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';
import { TabSuministros } from '../components/TabSuministros';
import { TabReportar } from '../components/TabReportar';
import { TabMapa } from '../components/TabMapa';
import { TabEstadisticas } from '../components/TabEstadisticas';
import { TabAjustes } from '../components/TabAjustes';

export default function SuministrosApp() {
  const [activeTab, setActiveTab] = useState<TabId>('suministros');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [urgenciaFiltro, setUrgenciaFiltro] = useState('todos');

  const { centros, loading, error, refetch } = useRealtimeCentros();
  const { isOnline, colaOffline, sincronizando, syncAlert, procesarCola, encolarReporte } = useOfflineSync(refetch);
  const { oledDark, toggleOledDark } = useOledDark();
  const { user, isAdmin } = useAuth();

  // Registrar Service Worker solo en producción
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('💚 SW registrado:', reg.scope))
        .catch((err) => console.error('🛑 SW falló:', err));
    }
  }, []);

  // Auto-detectar ubicación al abrir la app para fijar el estado por defecto
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const estado = obtenerEstadoPorCoordenadas(pos.coords.latitude, pos.coords.longitude);
          console.log(`📍 Ubicación detectada. Configurando filtro por defecto a: ${estado}`);
          setEstadoFiltro(estado);
        },
        (err) => {
          console.warn('⚠️ No se pudo obtener la ubicación para el filtro inicial de estado:', err.message);
        },
        { timeout: 8000 }
      );
    }
  }, []);

  // Filtrar y ordenar centros
  const centrosFiltrados = centros.filter((centro) => {
    const matchEstado = estadoFiltro === 'todos' || centro.estado.toLowerCase() === estadoFiltro.toLowerCase();
    const matchUrgencia = urgenciaFiltro === 'todos' || centro.estatus_general === urgenciaFiltro;
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = q === '' ||
      centro.nombre.toLowerCase().includes(q) ||
      centro.municipio.toLowerCase().includes(q) ||
      centro.direccion.toLowerCase().includes(q) ||
      centro.necesidades.some(n =>
        n.descripcion.toLowerCase().includes(q) ||
        getCategoriaLabel(n.categoria).toLowerCase().includes(q)
      );
    return matchEstado && matchUrgencia && matchSearch;
  }).sort((a, b) => {
    const isACoordinator = user && a.creado_por === user?.id;
    const isBCoordinator = user && b.creado_por === user?.id;
    if (isACoordinator && !isBCoordinator) return -1;
    if (!isACoordinator && isBCoordinator) return 1;
    return 0; // Mantener el orden original de Supabase (por urgencia/fecha)
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-xl relative border-x border-gray-100">
      <OfflineBanner
        count={colaOffline.length}
        isOnline={isOnline}
        sincronizando={sincronizando}
        syncAlert={syncAlert}
        onSync={procesarCola}
      />

      <Header
        isOnline={isOnline}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        onSearchChange={setSearchQuery}
      />

      <main className="flex-1 overflow-y-auto p-4 pb-28">
        {activeTab === 'suministros' && (
          <TabSuministros
            centros={centrosFiltrados}
            loading={loading}
            error={error}
            estadoFiltro={estadoFiltro}
            urgenciaFiltro={urgenciaFiltro}
            onEstadoChange={setEstadoFiltro}
            onUrgenciaChange={setUrgenciaFiltro}
            onRefetch={refetch}
            onTabChange={(t) => setActiveTab(t as TabId)}
          />
        )}

        {activeTab === 'reportar' && (
          <TabReportar
            isAdmin={isAdmin}
            isOnline={isOnline}
            centros={centros}
            onEncolar={encolarReporte}
            onTabChange={(t) => setActiveTab(t as TabId)}
            refetch={refetch}
          />
        )}

        {activeTab === 'mapa' && (
          <TabMapa centros={centros} />
        )}

        {activeTab === 'estadisticas' && (
          <TabEstadisticas centros={centros} />
        )}

        {activeTab === 'ajustes' && (
          <TabAjustes
            oledDark={oledDark}
            onToggleOled={toggleOledDark}
            centros={centros}
            refetch={refetch}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
