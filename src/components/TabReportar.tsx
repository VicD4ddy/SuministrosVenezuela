'use client';

import React, { useState } from 'react';
import { MapPin, CheckCircle, AlertTriangle, PlusCircle, Droplet, Utensils, Heart, Zap, Activity, Loader2, Search, Siren } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useGeolocation } from '../hooks/useGeolocation';
import { useLeaflet } from '../hooks/useLeaflet';
import { supabase } from '../lib/supabaseClient';
import { CategoriaNecesidad, EstatusCentro, CentroAcopioConDetalles } from '../types/database.types';
import { vibrar } from '../lib/feedback';
import { getCategoriaLabel } from '../lib/categorias';
import { useRef, useEffect } from 'react';

const ESTADOS_VENEZUELA = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
  'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
  'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta',
  'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia', 'Vargas'
];

interface TabReportarProps {
  isAdmin: boolean;
  isOnline: boolean;
  centros: CentroAcopioConDetalles[];
  onEncolar: (reporte: any) => boolean;
  onTabChange: (tab: string) => void;
  refetch: () => Promise<void>;
}

export function TabReportar({ isAdmin, isOnline, centros, onEncolar, onTabChange, refetch }: TabReportarProps) {
  const [mode, setMode] = useState<'nuevo' | 'existente'>('nuevo');
  const [centroExistenteId, setCentroExistenteId] = useState('');
  const [busquedaCentro, setBusquedaCentro] = useState('');

  const [nombreCentro, setNombreCentro] = useState('');
  const [estadoReporte, setEstadoReporte] = useState('Distrito Capital');
  const [municipioReporte, setMunicipioReporte] = useState('');
  const [direccionReporte, setDireccionReporte] = useState('');

  const { latitud, longitud, gpsLoading, gpsReady, gpsError, detectarUbicacion, resetGps } = useGeolocation();
  const [latitudCentro, setLatitudCentro] = useState<number | null>(null);
  const [longitudCentro, setLongitudCentro] = useState<number | null>(null);
  const [ubicacionFijada, setUbicacionFijada] = useState(false);

  useEffect(() => {
    if (gpsReady && latitud && longitud) {
      setLatitudCentro(latitud);
      setLongitudCentro(longitud);
      setUbicacionFijada(true);
    }
  }, [gpsReady, latitud, longitud]);

  const { L, isReady: leafletReady } = useLeaflet();
  const miniMapRef = useRef<any>(null);
  const miniMapContainerRef = useRef<HTMLDivElement>(null);

  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<CategoriaNecesidad[]>(['agua_hidratacion']);

  const toggleCategoria = (cat: CategoriaNecesidad) => {
    setCategoriasSeleccionadas(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };
  const [urgenciaSeleccionada, setUrgenciaSeleccionada] = useState<'critico' | 'parcial' | 'recibiendo'>('critico');
  const [cantidadRequerida, setCantidadRequerida] = useState('');
  const [descripcionNecesidad, setDescripcionNecesidad] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Mini mapa interactivo
  useEffect(() => {
    if (!leafletReady || !L || !miniMapContainerRef.current) {
      if (miniMapRef.current) { miniMapRef.current.remove(); miniMapRef.current = null; }
      return;
    }

    if (miniMapRef.current) { miniMapRef.current.remove(); miniMapRef.current = null; }

    const latInicial = latitudCentro || 10.4806;
    const lngInicial = longitudCentro || -66.9036;
    const zoomInicial = latitudCentro ? 15 : 6;

    const map = L.map(miniMapContainerRef.current, { zoomControl: true }).setView([latInicial, lngInicial], zoomInicial);
    miniMapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

    let marker: any = null;
    if (latitudCentro && longitudCentro) {
      const pinIcon = L.divIcon({
        html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.35);"></div>`,
        className: 'custom-center-pin', iconSize: [14, 14], iconAnchor: [7, 7],
      });
      marker = L.marker([latitudCentro, longitudCentro], { icon: pinIcon }).addTo(map)
        .bindPopup('<b style="font-size:11px;">Ubicación seleccionada</b>').openPopup();
    }

    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      setLatitudCentro(lat);
      setLongitudCentro(lng);
      setUbicacionFijada(true);
      vibrar(50);
    });

    return () => { if (miniMapRef.current) { miniMapRef.current.remove(); miniMapRef.current = null; } };
  }, [leafletReady, L, latitudCentro, longitudCentro]);

  const centrosFiltrados = centros.filter(c =>
    busquedaCentro === '' ||
    c.nombre.toLowerCase().includes(busquedaCentro.toLowerCase()) ||
    c.municipio.toLowerCase().includes(busquedaCentro.toLowerCase())
  );

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'nuevo' && (!nombreCentro.trim() || !municipioReporte.trim() || !direccionReporte.trim())) {
      setSubmitError('Complete todos los campos del centro.'); return;
    }
    if (mode === 'existente' && !centroExistenteId) {
      setSubmitError('Seleccione un centro existente.'); return;
    }
    if (categoriasSeleccionadas.length === 0) {
      setSubmitError('Seleccione al menos un tipo de suministro.'); return;
    }
    if (!cantidadRequerida.trim() || !descripcionNecesidad.trim()) {
      setSubmitError('Complete la cantidad y descripción de la necesidad.'); return;
    }
    setSubmitError('');
    setShowConfirm(true);
  };

  const handleEnviarReporte = async () => {
    setShowConfirm(false);
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    // Modo: agregar necesidad a centro existente
    if (mode === 'existente') {
      if (!isOnline) {
        setSubmitError('Se necesita conexión para agregar necesidades a centros existentes.');
        setIsSubmitting(false); return;
      }
      try {
        const rows = categoriasSeleccionadas.map(cat => ({
          centro_id: centroExistenteId,
          categoria: cat,
          descripcion: descripcionNecesidad.trim(),
          cantidad_requerida: cantidadRequerida.trim(),
          estatus: 'pendiente' as const,
          urgencia: urgenciaSeleccionada,
          votos_no_vigente: 0, votos_vigente: 0,
        }));
        const { error } = await supabase.from('necesidades').insert(rows);
        if (error) throw error;
        vibrar(200);
        setSubmitSuccess('¡Necesidad agregada al centro existente!');
        setCantidadRequerida(''); setDescripcionNecesidad('');
        await refetch();
        setTimeout(() => { onTabChange('suministros'); setSubmitSuccess(''); }, 1500);
      } catch (err: any) {
        setSubmitError(err.message || 'Error al agregar necesidad.');
      } finally { setIsSubmitting(false); }
      return;
    }

    // Modo: crear centro nuevo (con soporte offline)
    if (!isOnline) {
      // Encolar un reporte por cada categoría seleccionada
      let allOk = true;
      for (const cat of categoriasSeleccionadas) {
        const ok = onEncolar({
          nombreCentro: nombreCentro.trim(),
          estado: estadoReporte,
          municipio: municipioReporte.trim(),
          direccion: direccionReporte.trim(),
          latitud: latitudCentro, longitud: longitudCentro, categoria: cat,
          descripcion: descripcionNecesidad.trim(),
          cantidad: cantidadRequerida.trim(),
          urgencia: urgenciaSeleccionada, verificado: isAdmin,
        });
        if (!ok) { allOk = false; break; }
      }
      if (!allOk) { setSubmitError('Cola offline llena (máx. 20 reportes). Espere a sincronizar.'); setIsSubmitting(false); return; }
      vibrar(200);
      setSubmitSuccess('⚠️ Sin conexión. Reporte guardado localmente.');
      resetForm();
      setTimeout(() => { onTabChange('suministros'); setSubmitSuccess(''); }, 3500);
      setIsSubmitting(false); return;
    }

    try {
      const estatus: EstatusCentro = urgenciaSeleccionada === 'critico' ? 'critico' : urgenciaSeleccionada === 'parcial' ? 'parcial' : 'surtido';
      const coords = latitudCentro && longitudCentro ? `(${longitudCentro},${latitudCentro})` : null;

      const { data: centroData, error: cErr } = await supabase.from('centros_acopio').insert({
        nombre: nombreCentro.trim(),
        estado: estadoReporte,
        municipio: municipioReporte.trim(),
        direccion: direccionReporte.trim(),
        coordenadas: coords, estatus_general: estatus,
        verificado: isAdmin, creado_por: null,
      }).select().single();
      if (cErr) throw cErr;

      const necesidadesRows = categoriasSeleccionadas.map(cat => ({
        centro_id: centroData.id, categoria: cat,
        descripcion: descripcionNecesidad.trim(),
        cantidad_requerida: cantidadRequerida.trim(),
        estatus: 'pendiente' as const, urgencia: urgenciaSeleccionada, votos_no_vigente: 0, votos_vigente: 0,
      }));
      const { error: nErr } = await supabase.from('necesidades').insert(necesidadesRows);
      if (nErr) throw nErr;

      vibrar(200);
      setSubmitSuccess('¡Reporte enviado y sincronizado en tiempo real!');
      resetForm();
      await refetch();
      setTimeout(() => { onTabChange('suministros'); setSubmitSuccess(''); }, 1500);
    } catch (err: any) {
      setSubmitError(err.message || 'Error de conexión.');
    } finally { setIsSubmitting(false); }
  };

  const resetForm = () => {
    setNombreCentro(''); setMunicipioReporte(''); setDireccionReporte('');
    setCategoriasSeleccionadas(['agua_hidratacion']);
    setCantidadRequerida(''); setDescripcionNecesidad(''); resetGps();
    setLatitudCentro(null); setLongitudCentro(null); setUbicacionFijada(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4" role="tabpanel" id="panel-reportar" aria-label="Formulario de reporte">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Reportar Centro o Necesidad</h2>
        <p className="text-xs text-gray-500 mt-1">Proporcione detalles para coordinar asistencia.</p>
      </div>

      {/* Selector de modo */}
      <div className="flex gap-2" role="group" aria-label="Tipo de reporte">
        <button type="button" onClick={() => setMode('nuevo')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${mode === 'nuevo' ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          aria-pressed={mode === 'nuevo'}>
          <PlusCircle className="w-3.5 h-3.5 inline mr-1" />Centro Nuevo
        </button>
        <button type="button" onClick={() => setMode('existente')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${mode === 'existente' ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          aria-pressed={mode === 'existente'}>
          <Search className="w-3.5 h-3.5 inline mr-1" />Agregar a Existente
        </button>
      </div>

      <form onSubmit={handlePreSubmit} className="space-y-4">
        {submitError && <div className="p-3 bg-red-50 text-red-800 text-xs border border-red-200 rounded-lg flex items-center gap-1.5" role="alert"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0" /><span className="font-semibold">{submitError}</span></div>}
        {submitSuccess && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 rounded-lg flex items-center gap-1.5" role="alert"><CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /><span className="font-semibold">{submitSuccess}</span></div>}

        {mode === 'existente' ? (
          <div className="space-y-2">
            <label htmlFor="buscar-centro" className="block text-xs font-bold text-gray-600 uppercase">Buscar Centro Existente *</label>
            <input id="buscar-centro" type="text" placeholder="Buscar por nombre o municipio..." value={busquedaCentro} onChange={e => setBusquedaCentro(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800" />
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {centrosFiltrados.slice(0, 10).map(c => (
                <button key={c.id} type="button" onClick={() => setCentroExistenteId(c.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${centroExistenteId === c.id ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold' : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50'}`}
                  aria-pressed={centroExistenteId === c.id}>
                  <span className="font-bold">{c.nombre}</span> — <span className="text-gray-500">{c.municipio}, {c.estado}</span>
                </button>
              ))}
              {centrosFiltrados.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No se encontraron centros.</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="nombre-centro" className="block text-xs font-bold text-gray-600 uppercase">Nombre del Centro *</label>
              <input id="nombre-centro" type="text" placeholder="Ej. Refugio San Juan..." value={nombreCentro} onChange={e => setNombreCentro(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="estado-reporte" className="block text-xs font-bold text-gray-600 uppercase">Estado *</label>
                <select id="estado-reporte" value={estadoReporte} onChange={e => setEstadoReporte(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800">
                  {ESTADOS_VENEZUELA.map(est => <option key={est} value={est}>{est}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="municipio" className="block text-xs font-bold text-gray-600 uppercase">Municipio *</label>
                <input id="municipio" type="text" placeholder="Ej. Libertador" value={municipioReporte} onChange={e => setMunicipioReporte(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800" required />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="direccion" className="block text-xs font-bold text-gray-600 uppercase">Dirección exacta *</label>
              <input id="direccion" type="text" placeholder="Calle Principal con Av. Sucre..." value={direccionReporte} onChange={e => setDireccionReporte(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800" required />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-600 uppercase">Ubicación GPS (Opcional)</label>
              <div className="flex gap-2">
                <button type="button" onClick={detectarUbicacion} disabled={gpsLoading}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border border-gray-200 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  aria-label="Detectar ubicación GPS actual">
                  <MapPin className="w-3.5 h-3.5 text-gray-600" />{gpsLoading ? 'Detectando...' : 'DETECTAR MI UBICACIÓN'}
                </button>
                {ubicacionFijada && (
                  <button type="button" onClick={() => { setLatitudCentro(null); setLongitudCentro(null); setUbicacionFijada(false); resetGps(); }}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200"
                    aria-label="Borrar ubicación del mapa">
                    BORRAR PIN
                  </button>
                )}
              </div>
              {gpsError && <p className="text-red-600 text-[10px] font-bold" role="alert">{gpsError}</p>}
              
              <p className="text-[10px] font-medium text-gray-500">
                💡 Toca cualquier parte del mapa para fijar o ajustar manualmente el pin.
              </p>

              <div className="relative h-36 rounded-lg overflow-hidden border border-gray-200">
                {leafletReady ? (
                  <div ref={miniMapContainerRef} style={{ height: '100%', width: '100%' }} />
                ) : (
                  <div className="h-full bg-gray-100 border border-dashed border-gray-300 flex flex-col items-center justify-center p-2">
                    <MapPin className="w-6 h-6 text-gray-400 mb-1 animate-bounce" aria-hidden="true" />
                    <span className="text-[10px] font-bold text-gray-500 bg-white/80 px-2 py-0.5 rounded shadow-sm border border-gray-100">Cargando mapa interactivo...</span>
                  </div>
                )}
              </div>
              {ubicacionFijada && (
                <div className="flex items-center text-emerald-700 text-xs font-bold gap-1 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Ubicación seleccionada ({latitudCentro?.toFixed(4)}, {longitudCentro?.toFixed(4)})</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Categoría — Selección Múltiple (clases explícitas para evitar purga de Tailwind) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-600 uppercase">
            Tipo de Suministro * <span className="text-gray-400 normal-case font-medium">(selecciona uno o más)</span>
          </label>
          {categoriasSeleccionadas.length > 0 && (
            <p className="text-[11px] font-semibold text-blue-600">
              {categoriasSeleccionadas.length} suministro(s) seleccionado(s) — <span className="text-gray-400 font-medium">toca de nuevo para quitar</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'agua_hidratacion' as const, label: 'Agua', Icon: Droplet,
                active: 'bg-blue-50 text-blue-700 border-blue-500 shadow-sm ring-2 ring-blue-200',
                iconCls: 'text-blue-600' },
              { key: 'alimentos_no_perecederos' as const, label: 'Comida', Icon: Utensils,
                active: 'bg-amber-50 text-amber-700 border-amber-500 shadow-sm ring-2 ring-amber-200',
                iconCls: 'text-amber-600' },
              { key: 'medicinas_primeros_auxilios' as const, label: 'Medicinas', Icon: Heart,
                active: 'bg-red-50 text-red-700 border-red-500 shadow-sm ring-2 ring-red-200',
                iconCls: 'text-red-600' },
              { key: 'energia_electricidad' as const, label: 'Energía', Icon: Zap,
                active: 'bg-yellow-50 text-yellow-700 border-yellow-500 shadow-sm ring-2 ring-yellow-200',
                iconCls: 'text-yellow-600' },
            ].map(({ key, label, Icon, active, iconCls }) => {
              const selected = categoriasSeleccionadas.includes(key);
              return (
                <button key={key} type="button" onClick={() => toggleCategoria(key)}
                  className={`p-3 rounded-lg border flex flex-col items-center justify-center text-xs font-bold transition-all relative ${
                    selected ? active : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`} aria-pressed={selected} aria-label={`${label}${selected ? ' (seleccionado)' : ''}`}>
                  {selected && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <Icon className={`w-6 h-6 mb-1 ${iconCls}`} />{label}
                </button>
              );
            })}
          </div>
          {(() => {
            const selHigiene = categoriasSeleccionadas.includes('higiene_personal');
            return (
              <button type="button" onClick={() => toggleCategoria('higiene_personal')}
                className={`w-full p-2.5 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all relative ${
                  selHigiene ? 'bg-indigo-50 text-indigo-700 border-indigo-500 shadow-sm ring-2 ring-indigo-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`} aria-pressed={selHigiene}>
                {selHigiene && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </span>
                )}
                <Activity className="w-4 h-4 text-indigo-600" />Otros (Higiene / Ropa)
              </button>
            );
          })()}
        </div>

        {/* Urgencia — clases explícitas para evitar purga de Tailwind */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-600 uppercase">Nivel de Urgencia *</label>
          {[
            { key: 'critico' as const, label: 'CRÍTICO (Sin suministros)',
              active: 'bg-red-50 text-red-700 border-red-500 shadow-sm', iconCls: 'text-red-600' },
            { key: 'parcial' as const, label: 'PARCIAL (Suministros limitados)',
              active: 'bg-amber-50 text-amber-700 border-amber-500 shadow-sm', iconCls: 'text-amber-600' },
            { key: 'recibiendo' as const, label: 'RECIBIENDO (Estable)',
              active: 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm', iconCls: 'text-emerald-600' },
          ].map(({ key, label, active, iconCls }) => (
            <button key={key} type="button" onClick={() => setUrgenciaSeleccionada(key)}
              className={`w-full p-2.5 rounded-lg border flex items-center gap-2 text-xs font-bold text-left transition-all ${
                urgenciaSeleccionada === key ? active : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`} aria-pressed={urgenciaSeleccionada === key}>
              <AlertTriangle className={`w-4 h-4 ${iconCls} shrink-0`} />{label}
            </button>
          ))}
        </div>

        {/* Campos de detalle */}
        <div className="space-y-1">
          <label htmlFor="cantidad" className="block text-xs font-bold text-gray-600 uppercase">Cantidad Necesitada *</label>
          <input id="cantidad" type="text" placeholder="Ej. 200 litros, para 50 familias..." value={cantidadRequerida} onChange={e => setCantidadRequerida(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800" required />
        </div>

        <div className="space-y-1">
          <label htmlFor="descripcion" className="block text-xs font-bold text-gray-600 uppercase">Detalle Adicional *</label>
          <textarea id="descripcion" placeholder="Descripción del suministro necesario..." value={descripcionNecesidad} onChange={e => setDescripcionNecesidad(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800 resize-none" required />
        </div>

        {isAdmin && (
          <div className="p-2.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" /><span>Enviando como <strong>Coordinador Verificado</strong></span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={isSubmitting}
            className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
            aria-label="Enviar reporte de necesidad">
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : 'ENVIAR REPORTE'}
          </button>
          <button type="button" onClick={() => onTabChange('suministros')}
            className="flex-1 py-3 bg-white text-gray-800 font-bold text-sm border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-transform">
            CANCELAR
          </button>
        </div>
      </form>

      {/* Modal de confirmación */}
      <ConfirmModal open={showConfirm} title="Confirmar Reporte"
        confirmLabel="Enviar Reporte" cancelLabel="Revisar"
        onConfirm={handleEnviarReporte} onCancel={() => setShowConfirm(false)}>
        <div className="space-y-1.5 text-xs">
          {mode === 'nuevo' ? (
            <>
              <p><strong>Centro:</strong> {nombreCentro}</p>
              <p><strong>Ubicación:</strong> {municipioReporte}, {estadoReporte}</p>
            </>
          ) : (
            <p><strong>Centro seleccionado:</strong> {centros.find(c => c.id === centroExistenteId)?.nombre || '—'}</p>
          )}
          <p><strong>Suministros ({categoriasSeleccionadas.length}):</strong> {categoriasSeleccionadas.map(c => getCategoriaLabel(c)).join(', ')}</p>
          <p><strong>Urgencia:</strong> {urgenciaSeleccionada.toUpperCase()}</p>
          <p><strong>Cantidad:</strong> {cantidadRequerida}</p>
        </div>
      </ConfirmModal>
    </div>
  );
}
