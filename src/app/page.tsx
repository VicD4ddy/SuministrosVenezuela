'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Search, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  PlusCircle, 
  Sparkles, 
  Heart, 
  Utensils, 
  Droplet, 
  Zap, 
  Activity, 
  Info,
  Settings,
  Map,
  Layers,
  Loader2
} from 'lucide-react';

import { useRealtimeCentros } from '../hooks/useRealtimeCentros';
import { CentroCard } from '../components/CentroCard';
import { CategoriaNecesidad, EstatusCentro } from '../types/database.types';
import { supabase } from '../lib/supabaseClient';

const ESTADOS_VENEZUELA = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 
  'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 
  'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 
  'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia', 'Vargas'
];

function getCategoriaLabel(categoria: string) {
  switch (categoria) {
    case 'agua_hidratacion':
      return 'Agua';
    case 'alimentos_no_perecederos':
      return 'Alimentos';
    case 'medicinas_primeros_auxilios':
      return 'Medicinas';
    case 'ropa_mantas':
      return 'Ropa/Mantas';
    case 'higiene_personal':
      return 'Higiene';
    case 'energia_electricidad':
      return 'Energía';
    default:
      return 'Suministro';
  }
}

// Función auxiliar para extraer Latitud y Longitud del tipo Point de Postgres
function obtenerLatLng(coordenadas: any): [number, number] | null {
  if (!coordenadas) return null;
  
  // Si viene como objeto { x, y } (Postgres Point: x = longitud, y = latitud)
  if (typeof coordenadas === 'object' && 'x' in coordenadas && 'y' in coordenadas) {
    return [coordenadas.y, coordenadas.x];
  }
  
  // Si viene como string "(longitud,latitud)"
  if (typeof coordenadas === 'string') {
    const match = coordenadas.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return [lat, lng];
      }
    }
  }
  
  return null;
}

export default function SuministrosApp() {
  // 1. Estados de Navegación y Vistas (Tab-based SPA para optimizar 3G)
  const [activeTab, setActiveTab] = useState<'suministros' | 'reportar' | 'mapa' | 'ajustes'>('suministros');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 2. Estados de Filtros
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<'todos' | 'critico' | 'parcial' | 'surtido'>('todos');

  // 3. Obtener centros y necesidades en tiempo real
  const { centros, loading, error, refetch } = useRealtimeCentros();

  // 4. Estados de Rol de Administrador Verificado (Se guarda en LocalStorage)
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  // 5. Estados del Formulario de Reporte
  const [nombreCentro, setNombreCentro] = useState('');
  const [estadoReporte, setEstadoReporte] = useState('Distrito Capital');
  const [municipioReporte, setMunicipioReporte] = useState('');
  const [direccionReporte, setDireccionReporte] = useState('');
  
  // Ubicación GPS
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Suministro a reportar
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<CategoriaNecesidad>('agua_hidratacion');
  const [urgenciaSeleccionada, setUrgenciaSeleccionada] = useState<'critico' | 'parcial' | 'recibiendo'>('critico');
  const [cantidadRequerida, setCantidadRequerida] = useState('');
  const [descripcionNecesidad, setDescripcionNecesidad] = useState('');

  // Estado de envío del formulario
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Referencias a los contenedores de mapas Leaflet
  const mapInstanceRef = useRef<any>(null);
  const miniMapInstanceRef = useRef<any>(null);

  // Cargar rol de admin y preferencias
  useEffect(() => {
    const adminSaved = localStorage.getItem('suministros_sos_admin');
    if (adminSaved === 'true') {
      setIsAdmin(true);
    }
  }, []);

  // EFECTO: Inicializar el Mapa Principal de Venezuela en tiempo real
  useEffect(() => {
    if (activeTab !== 'mapa' || typeof window === 'undefined') return;

    let activeMap: any = null;

    // Retrasar brevemente la inicialización para garantizar que el elemento del DOM con id "mapa-real" esté renderizado
    const timer = setTimeout(() => {
      const contenedorElemento = document.getElementById('mapa-real');
      if (!contenedorElemento) return;

      import('leaflet').then((L) => {
        // Limpiar mapa previo
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Cargar estilos CDN de Leaflet si no existen
        if (!document.getElementById('leaflet-css-global')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-global';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        // Crear mapa centrado en el territorio venezolano
        const map = L.map('mapa-real').setView([8.5, -66.5], 6);
        mapInstanceRef.current = map;
        activeMap = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        // Dibujar los marcadores en tiempo real
        centros.forEach((centro) => {
          const posicion = obtenerLatLng(centro.coordenadas);
          if (posicion) {
            const color = centro.estatus_general === 'critico' ? '#dc2626' : 
                          centro.estatus_general === 'parcial' ? '#f59e0b' : '#10b981';

            const pinIcon = L.divIcon({
              html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.35);"></div>`,
              className: 'custom-map-pin',
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });

            const necesidadesLista = centro.necesidades?.length > 0 
              ? centro.necesidades.map(n => `<li>${getCategoriaLabel(n.categoria)} (${n.urgencia.toUpperCase()})</li>`).join('')
              : '<li>Sin suministros urgentes</li>';

            const popupContent = `
              <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; min-width: 160px; padding: 2px;">
                <h4 style="margin: 0 0 3px 0; font-weight: bold; font-size: 13px; color: #111827;">${centro.nombre}</h4>
                <p style="margin: 0 0 6px 0; color: #4b5563; font-size: 10px;">${centro.municipio}, ${centro.estado}</p>
                <div style="margin-bottom: 6px;">
                  <span style="display: inline-block; padding: 1.5px 5px; border-radius: 4px; font-weight: bold; font-size: 9px; color: white; background-color: ${color};">
                    ${centro.estatus_general.toUpperCase()}
                  </span>
                </div>
                <ul style="margin: 0; padding-left: 14px; font-size: 10.5px; color: #374151; line-height: 1.35;">
                  ${necesidadesLista}
                </ul>
              </div>
            `;

            L.marker(posicion, { icon: pinIcon })
              .addTo(map)
              .bindPopup(popupContent);
          }
        });
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, centros]);

  // EFECTO: Inicializar el Mini Mapa del Reporte al tener GPS listo
  useEffect(() => {
    if (activeTab !== 'reportar' || !gpsReady || !latitud || !longitud || typeof window === 'undefined') {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      const contenedorElemento = document.getElementById('mini-mapa-reporte');
      if (!contenedorElemento) return;

      import('leaflet').then((L) => {
        if (miniMapInstanceRef.current) {
          miniMapInstanceRef.current.remove();
          miniMapInstanceRef.current = null;
        }

        // Cargar CSS si no existe
        if (!document.getElementById('leaflet-css-global')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-global';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        const map = L.map('mini-mapa-reporte', { zoomControl: false }).setView([latitud, longitud], 15);
        miniMapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OSM'
        }).addTo(map);

        const userIcon = L.divIcon({
          html: `<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.35);"></div>`,
          className: 'custom-user-pin',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        L.marker([latitud, longitud], { icon: userIcon })
          .addTo(map)
          .bindPopup('<b style="font-size: 11px;">Tu ubicación reportada</b>')
          .openPopup();
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
    };
  }, [activeTab, gpsReady, latitud, longitud]);

  // Función para simular detección de GPS y obtener coordenadas reales
  const detectarUbicacion = () => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no es compatible con este navegador.');
      return;
    }

    setGpsLoading(true);
    setGpsError('');
    setGpsReady(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitud(position.coords.latitude);
        setLongitud(position.coords.longitude);
        setGpsLoading(false);
        setGpsReady(true);
      },
      (error) => {
        console.error('Error al detectar GPS:', error);
        setGpsError('No se pudo acceder a la ubicación. Asegúrese de activar el GPS.');
        setGpsLoading(false);
        // Fallback: valores aproximados de Caracas
        setLatitud(10.4806);
        setLongitud(-66.9036);
        setGpsReady(true);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Validar clave de administrador en Ajustes
  const validarAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');

    // Token simple de coordinador oficial para baja conectividad
    if (adminToken.trim() === 'SOS-ADMIN-2026') {
      setIsAdmin(true);
      localStorage.setItem('suministros_sos_admin', 'true');
      setAdminSuccess('¡Modo Coordinador Verificado activado con éxito! Se aplicará la insignia oficial a sus reportes.');
      setAdminToken('');
    } else {
      setAdminError('Código de verificación incorrecto. Intente de nuevo.');
    }
  };

  const desactivarAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem('suministros_sos_admin');
    setAdminSuccess('Modo Coordinador desactivado.');
  };

  // Enviar el reporte a Supabase
  const handleEnviarReporte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreCentro.trim() || !municipioReporte.trim() || !direccionReporte.trim() || !cantidadRequerida.trim() || !descripcionNecesidad.trim()) {
      setSubmitError('Por favor complete todos los campos obligatorios.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // 1. Crear el centro de acopio
      const estatusCentroCalculado: EstatusCentro = 
        urgenciaSeleccionada === 'critico' ? 'critico' : 
        urgenciaSeleccionada === 'parcial' ? 'parcial' : 'surtido';

      const coordenadasPoint = latitud && longitud ? `(${longitud},${latitud})` : null;

      const { data: centroData, error: centroError } = await supabase
        .from('centros_acopio')
        .insert({
          nombre: nombreCentro.trim(),
          estado: estadoReporte,
          municipio: municipioReporte.trim(),
          direccion: direccionReporte.trim(),
          coordenadas: coordenadasPoint,
          estatus_general: estatusCentroCalculado,
          verificado: isAdmin,
          creado_por: null
        })
        .select()
        .single();

      if (centroError) throw centroError;

      // 2. Insertar la necesidad asociada
      const { error: necesidadError } = await supabase
        .from('necesidades')
        .insert({
          centro_id: centroData.id,
          categoria: categoriaSeleccionada,
          descripcion: descripcionNecesidad.trim(),
          cantidad_requerida: cantidadRequerida.trim(),
          estatus: 'pendiente',
          urgencia: urgenciaSeleccionada,
          votos_no_vigente: 0,
          votos_vigente: 0
        });

      if (necesidadError) throw necesidadError;

      setSubmitSuccess('¡Reporte enviado exitosamente! Los datos ya están sincronizados en tiempo real.');
      
      // Limpiar formulario
      setNombreCentro('');
      setMunicipioReporte('');
      setDireccionReporte('');
      setCantidadRequerida('');
      setDescripcionNecesidad('');
      setLatitud(null);
      setLongitud(null);
      setGpsReady(false);

      setTimeout(() => {
        setActiveTab('suministros');
        setSubmitSuccess('');
      }, 2000);

    } catch (err: any) {
      console.error('Error al subir reporte:', err);
      setSubmitError(err.message || 'Error de conexión con el servidor Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Lógica de Filtrado Local (Sin llamadas GET adicionales, ideal para 3G)
  const centrosFiltrados = centros.filter((centro) => {
    const matchEstado = estadoFiltro === 'todos' || centro.estado.toLowerCase() === estadoFiltro.toLowerCase();
    const matchUrgencia = urgenciaFiltro === 'todos' || centro.estatus_general === urgenciaFiltro;

    const query = searchQuery.toLowerCase().trim();
    const matchSearch = query === '' || 
      centro.nombre.toLowerCase().includes(query) ||
      centro.municipio.toLowerCase().includes(query) ||
      centro.direccion.toLowerCase().includes(query) ||
      centro.necesidades.some(n => 
        n.descripcion.toLowerCase().includes(query) || 
        getCategoriaLabel(n.categoria).toLowerCase().includes(query)
      );

    return matchEstado && matchUrgencia && matchSearch;
  });

  const criticosCount = centros.filter(c => c.estatus_general === 'critico').length;
  const parcialesCount = centros.filter(c => c.estatus_general === 'parcial').length;
  const surtidosCount = centros.filter(c => c.estatus_general === 'surtido').length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-xl relative border-x border-gray-100">
      
      {/* NAVBAR SUPERIOR */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-30 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
              <Radio className="w-5 h-5 text-emerald-600 relative z-10 shrink-0" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-1.5">
              Suministros SOS <span className="text-base">🇻🇪</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
              En Vivo
            </span>

            <button 
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg active:scale-95 transition-transform"
              title="Buscar suministros"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-2 animate-fadeIn">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input 
                type="text"
                placeholder="Ej. Refugio, comida, agua, Carabobo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                autoFocus
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2 text-xs font-bold text-gray-400 hover:text-gray-600"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* CUERPO DE LA APLICACIÓN */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* TABS 1: SUMINISTROS (VISTA PRINCIPAL) */}
        {activeTab === 'suministros' && (
          <div className="space-y-4">
            
            {/* Selector de Estado */}
            <div className="w-full">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Filtrar por Estado</label>
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold text-gray-800 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem', backgroundRepeat: 'no-repeat' }}
              >
                <option value="todos">Todos los Estados (Venezuela)</option>
                {ESTADOS_VENEZUELA.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </div>

            {/* Botón Reportar Necesidad / Centro */}
            <button
              onClick={() => setActiveTab('reportar')}
              className="w-full py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <PlusCircle className="w-5 h-5 shrink-0" />
              REPORTAR NECESIDAD / CENTRO
            </button>

            {/* Filtros rápidos por Urgencia */}
            <div className="flex gap-2">
              <button
                onClick={() => setUrgenciaFiltro(urgenciaFiltro === 'critico' ? 'todos' : 'critico')}
                className={`flex-1 py-2 px-1 text-xs font-bold rounded-lg border transition-all text-center ${
                  urgenciaFiltro === 'critico' 
                    ? 'bg-red-50 text-red-700 border-red-500 ring-2 ring-red-200' 
                    : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                Críticos ({criticosCount})
              </button>

              <button
                onClick={() => setUrgenciaFiltro(urgenciaFiltro === 'parcial' ? 'todos' : 'parcial')}
                className={`flex-1 py-2 px-1 text-xs font-bold rounded-lg border transition-all text-center ${
                  urgenciaFiltro === 'parcial' 
                    ? 'bg-amber-50 text-amber-800 border-amber-500 ring-2 ring-amber-200' 
                    : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                }`}
              >
                Parciales ({parcialesCount})
              </button>

              <button
                onClick={() => setUrgenciaFiltro(urgenciaFiltro === 'surtido' ? 'todos' : 'surtido')}
                className={`flex-1 py-2 px-1 text-xs font-bold rounded-lg border transition-all text-center ${
                  urgenciaFiltro === 'surtido' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-200' 
                    : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                Estables ({surtidosCount})
              </button>
            </div>

            {/* Banner Informativo de Baja Conectividad */}
            <div className="bg-blue-50 text-blue-800 text-xs border border-blue-100 p-3 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <span className="font-bold">Optimizado para 3G:</span> Para búsquedas del listado no consumimos datos de servidor; todo se procesa en local. Los mapas interactivos los puedes ver en la pestaña inferior.
              </p>
            </div>

            {/* Listado de Tarjetas */}
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                <p className="text-sm font-semibold text-gray-500">Cargando centros de acopio...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 text-red-800 text-sm border border-red-100 p-4 rounded-xl text-center space-y-2">
                <p className="font-bold">Error de conexión:</p>
                <p className="text-xs">{error}</p>
                <button 
                  onClick={refetch}
                  className="px-3 py-1.5 bg-red-700 text-white font-bold text-xs rounded hover:bg-red-800"
                >
                  Reintentar Conexión
                </button>
              </div>
            ) : centrosFiltrados.length === 0 ? (
              <div className="py-12 text-center bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm text-gray-500 font-semibold mb-2">No se encontraron centros de acopio.</p>
                <p className="text-xs text-gray-400">Intente modificando los filtros de estado o la búsqueda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {centrosFiltrados.map((centro) => (
                  <CentroCard key={centro.id} centro={centro} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TABS 2: FORMULARIO DE REPORTE */}
        {activeTab === 'reportar' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">Reportar Centro o Necesidad</h2>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                Proporcione detalles sobre la situación actual para coordinar asistencia.
              </p>
            </div>

            <form onSubmit={handleEnviarReporte} className="space-y-4">
              
              {/* Avisos de Envío */}
              {submitError && (
                <div className="p-3 bg-red-50 text-red-800 text-xs border border-red-200 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="font-semibold">{submitError}</span>
                </div>
              )}

              {submitSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 rounded-lg flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{submitSuccess}</span>
                </div>
              )}

              {/* Nombre del Centro */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600 uppercase">Nombre del Centro / Refugio *</label>
                <input 
                  type="text"
                  placeholder="Ej. Refugio San Juan, Escuela Bolívar..."
                  value={nombreCentro}
                  onChange={(e) => setNombreCentro(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  required
                />
              </div>

              {/* Ubicación Geográfica */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase">Estado *</label>
                  <select
                    value={estadoReporte}
                    onChange={(e) => setEstadoReporte(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  >
                    {ESTADOS_VENEZUELA.map((est) => (
                      <option key={est} value={est}>{est}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase">Municipio *</label>
                  <input 
                    type="text"
                    placeholder="Ej. Libertador"
                    value={municipioReporte}
                    onChange={(e) => setMunicipioReporte(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                    required
                  />
                </div>
              </div>

              {/* Dirección exacta */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600 uppercase">Dirección exacta *</label>
                <input 
                  type="text"
                  placeholder="Calle Principal con Av. Sucre, local frente a la plaza..."
                  value={direccionReporte}
                  onChange={(e) => setDireccionReporte(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  required
                />
              </div>

              {/* UBICACIÓN GPS */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-600 uppercase">Ubicación GPS (Opcional)</label>
                <button
                  type="button"
                  onClick={detectarUbicacion}
                  disabled={gpsLoading}
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border border-gray-200 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <MapPin className="w-3.5 h-3.5 text-gray-600" />
                  {gpsLoading ? 'Detectando señal GPS...' : 'DETECTAR MI UBICACIÓN'}
                </button>

                {gpsError && <p className="text-red-600 text-[10px] font-bold">{gpsError}</p>}

                {/* Mapa de Vista Previa */}
                <div className="relative h-32 rounded-lg overflow-hidden border border-gray-200">
                  {gpsReady && latitud && longitud ? (
                    <div id="mini-mapa-reporte" style={{ height: '100%', width: '100%' }} />
                  ) : (
                    <div className="h-full bg-gray-100 border border-dashed border-gray-300 flex flex-col items-center justify-center p-2">
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>
                      <MapPin className="w-6 h-6 text-gray-400 mb-1 z-10 animate-bounce" />
                      <span className="text-[10px] font-bold text-gray-500 z-10 bg-white/80 px-2 py-0.5 rounded shadow-sm border border-gray-100">
                        Vista Previa (Detectar GPS para ver el mapa)
                      </span>
                    </div>
                  )}
                </div>

                {gpsReady && (
                  <div className="flex items-center text-emerald-700 text-xs font-bold gap-1 mt-1">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Ubicación fijada correctamente</span>
                  </div>
                )}
              </div>

              {/* SELECCIÓN DE SUMINISTRO REQUERIDO */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-600 uppercase">Tipo de Suministros Necesitados *</label>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoriaSeleccionada('agua_hidratacion')}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center text-xs font-bold transition-all ${
                      categoriaSeleccionada === 'agua_hidratacion'
                        ? 'bg-blue-50 text-blue-700 border-blue-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Droplet className="w-6 h-6 mb-1 text-blue-600" />
                    Agua
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategoriaSeleccionada('alimentos_no_perecederos')}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center text-xs font-bold transition-all ${
                      categoriaSeleccionada === 'alimentos_no_perecederos'
                        ? 'bg-amber-50 text-amber-700 border-amber-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Utensils className="w-6 h-6 mb-1 text-amber-600" />
                    Comida
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategoriaSeleccionada('medicinas_primeros_auxilios')}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center text-xs font-bold transition-all ${
                      categoriaSeleccionada === 'medicinas_primeros_auxilios'
                        ? 'bg-red-50 text-red-700 border-red-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Heart className="w-6 h-6 mb-1 text-red-600" />
                    Medicinas
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategoriaSeleccionada('energia_electricidad')}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center text-xs font-bold transition-all ${
                      categoriaSeleccionada === 'energia_electricidad'
                        ? 'bg-yellow-50 text-yellow-800 border-yellow-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Zap className="w-6 h-6 mb-1 text-yellow-500" />
                    Energía
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCategoriaSeleccionada('higiene_personal')}
                  className={`w-full p-2.5 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                    categoriaSeleccionada === 'higiene_personal'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-500 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Otros Suministros (Higiene / Ropa)
                </button>
              </div>

              {/* NIVEL DE URGENCIA */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-600 uppercase">Nivel de Urgencia *</label>
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setUrgenciaSeleccionada('critico')}
                    className={`w-full p-2.5 rounded-lg border flex items-center justify-start gap-2 text-xs font-bold text-left transition-all ${
                      urgenciaSeleccionada === 'critico'
                        ? 'bg-red-50 text-red-700 border-red-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-red-50'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <div>
                      CRÍTICO (Sin Suministros / Urgencia Inmediata)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUrgenciaSeleccionada('parcial')}
                    className={`w-full p-2.5 rounded-lg border flex items-center justify-start gap-2 text-xs font-bold text-left transition-all ${
                      urgenciaSeleccionada === 'parcial'
                        ? 'bg-amber-50 text-amber-800 border-amber-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-amber-50'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      PARCIAL (Suministros Limitados / Recibiendo Ayuda Insuficiente)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUrgenciaSeleccionada('recibiendo')}
                    className={`w-full p-2.5 rounded-lg border flex items-center justify-start gap-2 text-xs font-bold text-left transition-all ${
                      urgenciaSeleccionada === 'recibiendo'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      RECIBIENDO (Estable por el momento)
                    </div>
                  </button>
                </div>
              </div>

              {/* Cantidad Requerida */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600 uppercase">Cantidad Necesitada *</label>
                <input 
                  type="text"
                  placeholder="Ej. 200 litros, para 50 familias, 10 cajas..."
                  value={cantidadRequerida}
                  onChange={(e) => setCantidadRequerida(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  required
                />
              </div>

              {/* Descripción de Necesidad */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600 uppercase">Detalle Adicional *</label>
                <textarea 
                  placeholder="Proporcione una descripción del suministro necesario, marcas o especificaciones críticas..."
                  value={descripcionNecesidad}
                  onChange={(e) => setDescripcionNecesidad(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800 resize-none"
                  required
                />
              </div>

              {isAdmin && (
                <div className="p-2.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Enviando como <strong>Coordinador Oficial Verificado</strong> (Insignia Azul).</span>
                </div>
              )}

              {/* BOTONES DE ACCIÓN */}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'ENVIAR REPORTE'
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => setActiveTab('suministros')}
                  className="flex-1 py-3 bg-white text-gray-800 font-bold text-sm border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-transform"
                >
                  CANCELAR
                </button>
              </div>

            </form>
          </div>
        )}

        {/* TABS 3: MAPA INTERACTIVO REAL */}
        {activeTab === 'mapa' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">Mapa de Suministros SOS</h2>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                Visualización geográfica interactiva en tiempo real.
              </p>
            </div>

            {/* Contenedor del Mapa Leaflet */}
            <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-inner">
              <div id="mapa-real" style={{ height: '320px', width: '100%' }} className="rounded-xl" />
              {centros.length === 0 && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[1000]">
                  <Loader2 className="w-6 h-6 text-red-600 animate-spin mr-2" />
                  <p className="text-xs text-gray-500 font-bold">Cargando puntos de acopio en mapa...</p>
                </div>
              )}
            </div>

            {/* Leyenda de Mapa */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leyenda de Prioridades</h4>
              <div className="flex items-center justify-between text-xs font-bold text-gray-700 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#dc2626] inline-block border-2 border-white shadow-sm" />
                  <span>Crítico</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#f59e0b] inline-block border-2 border-white shadow-sm" />
                  <span>Parcial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#10b981] inline-block border-2 border-white shadow-sm" />
                  <span>Estable</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TABS 4: AJUSTES / MODO COORDINADOR */}
        {activeTab === 'ajustes' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">Ajustes del Sistema</h2>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                Administración y roles de verificación comunitaria.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-xs leading-normal text-gray-700">
              <p>
                Cualquier ciudadano en Venezuela puede reportar y votar vigencia. Las cuentas oficiales de coordinadores y organizaciones aliadas (rescatistas, personal médico) cuentan con un código de verificación que les da la insignia azul de <strong>Coordinador Verificado</strong>.
              </p>
            </div>

            {isAdmin ? (
              <div className="p-4 border border-emerald-100 bg-emerald-50 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-bold text-emerald-800">Modo Coordinador Activo</span>
                </div>
                <p className="text-xs text-emerald-700">
                  Tus reportes y modificaciones en los centros serán marcados como oficiales y tendrán prioridad absoluta en la pantalla principal.
                </p>
                <button
                  onClick={desactivarAdmin}
                  className="w-full py-2 bg-white text-red-700 border border-red-200 font-bold text-xs rounded-lg hover:bg-red-50"
                >
                  Desactivar Modo Coordinador
                </button>
              </div>
            ) : (
              <form onSubmit={validarAdmin} className="space-y-3 border border-gray-100 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-gray-800">Activar Validación Oficial</h3>
                
                {adminError && <p className="text-red-600 text-xs font-bold">{adminError}</p>}
                {adminSuccess && <p className="text-emerald-700 text-xs font-bold">{adminSuccess}</p>}

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Clave de Coordinador Autorizado</label>
                  <input
                    type="password"
                    placeholder="Introduce el código de verificación"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  />
                  <p className="text-[10px] text-gray-400">Introduce <strong>SOS-ADMIN-2026</strong> para probar la verificación oficial.</p>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow"
                >
                  VERIFICAR CÓDIGO
                </button>
              </form>
            )}

            <div className="text-center pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-1">
              <p className="font-bold">Suministros SOS v1.1.0 (MVP)</p>
              <p>Diseñado para responder en emergencias humanitarias bajo redes de baja conectividad.</p>
              <p>Caracas, Venezuela - 2026</p>
            </div>
          </div>
        )}

      </main>

      {/* TABS DE NAVEGACIÓN INFERIOR (Mobile-First) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 py-2.5 px-4 flex items-center justify-around z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab('suministros')}
          className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${
            activeTab === 'suministros' ? 'text-red-700 font-bold' : 'text-gray-400 font-semibold'
          }`}
        >
          <Layers className="w-5 h-5 shrink-0" />
          <span className="text-[10px]">Suministros</span>
        </button>

        <button
          onClick={() => setActiveTab('reportar')}
          className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${
            activeTab === 'reportar' ? 'text-red-700 font-bold' : 'text-gray-400 font-semibold'
          }`}
        >
          <PlusCircle className="w-5 h-5 shrink-0" />
          <span className="text-[10px]">Reportar</span>
        </button>

        <button
          onClick={() => setActiveTab('mapa')}
          className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${
            activeTab === 'mapa' ? 'text-red-700 font-bold' : 'text-gray-400 font-semibold'
          }`}
        >
          <Map className="w-5 h-5 shrink-0" />
          <span className="text-[10px]">Mapa</span>
        </button>

        <button
          onClick={() => setActiveTab('ajustes')}
          className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${
            activeTab === 'ajustes' ? 'text-red-700 font-bold' : 'text-gray-400 font-semibold'
          }`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span className="text-[10px]">Ajustes</span>
        </button>
      </nav>
    </div>
  );
}
