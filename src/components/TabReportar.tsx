'use client';

import React, { useState } from 'react';
import { MapPin, CheckCircle, AlertTriangle, PlusCircle, Droplet, Utensils, Heart, Zap, Activity, Loader2, Search, Siren, ShieldAlert } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useGeolocation } from '../hooks/useGeolocation';
import { useLeaflet } from '../hooks/useLeaflet';
import { supabase } from '../lib/supabaseClient';
import { CategoriaNecesidad, EstatusCentro, CentroAcopioConDetalles } from '../types/database.types';
import { vibrar } from '../lib/feedback';
import { getCategoriaLabel } from '../lib/categorias';
import { useRef, useEffect } from 'react';
import {
  verificarCooldown,
  registrarReporteEnCooldown,
  validarHoneypot,
  filtrarContenido,
  detectarDuplicadoGeografico,
  validarDistanciaGPS,
  obtenerPreguntaCaptcha,
  validarRespuestaCaptcha
} from '../lib/antispam';
import { generarFingerprint } from '../lib/geo';
import { useAuth } from '../hooks/useAuth';

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
  const { user } = useAuth();

  const [nombreCentro, setNombreCentro] = useState('');
  const [estadoReporte, setEstadoReporte] = useState('Distrito Capital');
  const [municipioReporte, setMunicipioReporte] = useState('');
  const [direccionReporte, setDireccionReporte] = useState('');
  const [mensajeAlerta, setMensajeAlerta] = useState('');

  const handleMensajeAlertaChange = (val: string) => {
    const palabras = val.split(/\s+/).filter(Boolean);
    if (palabras.length <= 100) {
      setMensajeAlerta(val);
    } else {
      const recortado = palabras.slice(0, 100).join(' ');
      setMensajeAlerta(recortado);
    }
  };

  const totalPalabrasAlerta = mensajeAlerta.split(/\s+/).filter(Boolean).length;
  const palabrasRestantesAlerta = 100 - totalPalabrasAlerta;

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

  const [busquedaMap, setBusquedaMap] = useState('');
  const [sugerenciasMap, setSugerenciasMap] = useState<any[]>([]);
  const [buscandoMap, setBuscandoMap] = useState(false);

  const buscarUbicacionMap = async (query: string) => {
    if (!query.trim()) {
      setSugerenciasMap([]);
      return;
    }
    // Si no hay conexión a internet, no intentar buscar
    if (!isOnline) {
      setSugerenciasMap([]);
      return;
    }
    setBuscandoMap(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ve&limit=5&addressdetails=1`
      );
      if (response.ok) {
        const data = await response.json();
        setSugerenciasMap(data);
      }
    } catch (err) {
      console.warn('No se pudo buscar la dirección en el mapa (posible problema de red o CORS):', err);
    } finally {
      setBuscandoMap(false);
    }
  };

  // Debounce para búsqueda
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (busquedaMap.trim().length > 2) {
        // Evitar re-buscar si ya seleccionamos exactamente ese display_name
        const coincideExacto = sugerenciasMap.some(s => s.display_name === busquedaMap);
        if (!coincideExacto) {
          buscarUbicacionMap(busquedaMap);
        }
      } else {
        setSugerenciasMap([]);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [busquedaMap]);

  const seleccionarSugerencia = (sug: any) => {
    const lat = parseFloat(sug.lat);
    const lon = parseFloat(sug.lon);
    setLatitudCentro(lat);
    setLongitudCentro(lon);
    setUbicacionFijada(true);
    setSugerenciasMap([]);
    setBusquedaMap(sug.display_name);

    // Autocompletado inteligente de Estado y Municipio
    if (sug.address) {
      const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      // 1. Mapear Estado
      if (sug.address.state) {
        const stateInput = normalizar(sug.address.state);
        const estadoEncontrado = ESTADOS_VENEZUELA.find(est => {
          const estNorm = normalizar(est);
          return stateInput.includes(estNorm) || estNorm.includes(stateInput);
        });
        if (estadoEncontrado) {
          setEstadoReporte(estadoEncontrado);
        }
      }

      // 2. Mapear Municipio
      const municipioVal = sug.address.municipality || sug.address.county || sug.address.city || sug.address.town || '';
      if (municipioVal) {
        // Limpiar palabras comunes devueltas por Nominatim como "Municipio "
        const limpio = municipioVal.replace(/Municipio\s+/i, '').replace(/Parroquia\s+/i, '').trim();
        setMunicipioReporte(limpio);
      }
      
      // 3. Mapear dirección sugerida inicial si está vacía
      if (!direccionReporte.trim() && sug.display_name) {
        // Usar los primeros dos segmentos como dirección sugerida
        const partes = sug.display_name.split(',');
        const dirSugerida = partes.slice(0, 2).join(',').trim();
        setDireccionReporte(dirSugerida);
      }
    }

    if (miniMapRef.current) {
      miniMapRef.current.setView([lat, lon], 16);
    }
    vibrar(100);
  };

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

  // --- Anti-Spam State ---
  const [honeypot, setHoneypot] = useState('');
  const [duplicadoDetectado, setDuplicadoDetectado] = useState<CentroAcopioConDetalles | null>(null);
  const [showDuplicadoModal, setShowDuplicadoModal] = useState(false);

  // --- CAPTCHA condicional ---
  const [requiereCaptcha, setRequiereCaptcha] = useState(false);
  const [captchaPregunta, setCaptchaPregunta] = useState<{ pregunta: string; respuestas: string[] } | null>(null);
  const [captchaRespuesta, setCaptchaRespuesta] = useState('');

  // Verificar la reputación del dispositivo al iniciar
  useEffect(() => {
    if (!isOnline) return;
    const verificarReputacion = async () => {
      try {
        const fp = generarFingerprint();
        const { data, error } = await (supabase as any)
          .from('reputacion_dispositivo')
          .select('puntaje')
          .eq('fingerprint', fp)
          .maybeSingle();
        
        if (data && data.puntaje < -5) {
          setRequiereCaptcha(true);
          setCaptchaPregunta(obtenerPreguntaCaptcha());
        }
      } catch {
        // En caso de error, no bloquear la experiencia de usuario
      }
    };
    verificarReputacion();
  }, [isOnline]);

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

    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { attribution: '&copy; Google Maps' }).addTo(map);

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

    // === ANTI-SPAM: Honeypot ===
    if (!validarHoneypot(honeypot)) {
      // Bot detectado — descartar silenciosamente
      setSubmitSuccess('¡Reporte enviado!'); // Mensaje falso para el bot
      return;
    }

    // === ANTI-SPAM: CAPTCHA condicional ===
    if (requiereCaptcha && captchaPregunta) {
      if (!validarRespuestaCaptcha(captchaPregunta, captchaRespuesta)) {
        setSubmitError('Respuesta de verificación incorrecta. Por favor, intenta de nuevo.');
        // Recargar una nueva pregunta
        setCaptchaPregunta(obtenerPreguntaCaptcha());
        setCaptchaRespuesta('');
        return;
      }
    }

    // === ANTI-SPAM: Rate Limiting (Cooldown) ===
    const cooldown = verificarCooldown();
    if (!cooldown.permitido) {
      const mins = Math.ceil(cooldown.segundosRestantes / 60);
      setSubmitError(`Has reportado recientemente. Espera ${mins} minuto(s) para enviar otro reporte.`);
      return;
    }

    // Validaciones de campos estándar
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

    // === ANTI-SPAM: Filtro de Contenido ===
    const filtro = filtrarContenido([
      nombreCentro, municipioReporte, direccionReporte,
      cantidadRequerida, descripcionNecesidad
    ]);
    if (!filtro.limpio) {
      setSubmitError('Tu reporte contiene contenido que no puede ser publicado. Revisa el texto e intenta de nuevo.');
      return;
    }

    // === ANTI-SPAM: Detección de Duplicados Geográficos (solo modo nuevo) ===
    if (mode === 'nuevo') {
      const dup = detectarDuplicadoGeografico(centros, nombreCentro.trim(), latitudCentro, longitudCentro);
      if (dup.esDuplicado && dup.centroSimilar) {
        setDuplicadoDetectado(dup.centroSimilar);
        setShowDuplicadoModal(true);
        return;
      }
    }

    setSubmitError('');
    setShowConfirm(true);
  };

  const handleEnviarReporte = async () => {
    setShowConfirm(false);
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    const fp = generarFingerprint();

    // Modo: agregar necesidad a centro existente
    if (mode === 'existente') {
      if (!isOnline) {
        setSubmitError('Se necesita conexión para agregar necesidades a centros existentes.');
        setIsSubmitting(false); return;
      }
      try {
        const telUsuario = user?.user_metadata?.telefono || '';

        // 1. Consultar necesidades actuales del centro de acopio
        const { data: existentes, error: queryErr } = await (supabase as any)
          .from('necesidades')
          .select('*')
          .eq('centro_id', centroExistenteId);
        
        if (queryErr) throw queryErr;

        const necesidadesExistentes = existentes || [];

        // 2. Iterar sobre las categorías seleccionadas
        for (const cat of categoriasSeleccionadas) {
          const existente = necesidadesExistentes.find((n: any) => n.categoria === cat);

          if (existente) {
            // Caso A: Ya existe una necesidad para esta categoría en el centro -> Consolidar (update)
            // Concatenar descripción anterior con la nueva
            const nuevaDesc = `${existente.descripcion} | ${descripcionNecesidad.trim()}`;
            
            // Concatenar teléfono si no está ya en la lista de colaboradores
            let telefonosActualizados = existente.colaboradores_telefonos || existente.telefono_contacto || '';
            if (telUsuario && !telefonosActualizados.includes(telUsuario)) {
              telefonosActualizados = telefonosActualizados 
                ? `${telefonosActualizados}, ${telUsuario}` 
                : telUsuario;
            }

            const { error: updErr } = await (supabase as any)
              .from('necesidades')
              .update({
                descripcion: nuevaDesc,
                cantidad_requerida: cantidadRequerida.trim(), // Sobrescribir con la cantidad requerida más nueva
                urgencia: urgenciaSeleccionada,
                votos_no_vigente: 0, // Resetear votos de no vigente ya que se está reportando vigencia
                colaboradores_telefonos: telefonosActualizados
              })
              .eq('id', existente.id);

            if (updErr) throw updErr;
          } else {
            // Caso B: No existe -> Crear nueva (insert)
            const { error: insErr } = await (supabase as any)
              .from('necesidades')
              .insert({
                centro_id: centroExistenteId,
                categoria: cat,
                descripcion: descripcionNecesidad.trim(),
                cantidad_requerida: cantidadRequerida.trim(),
                estatus: 'pendiente' as const,
                urgencia: urgenciaSeleccionada,
                votos_no_vigente: 0,
                votos_vigente: 0,
                reportado_por_fingerprint: fp,
                reportado_autenticado: user !== null,
                telefono_contacto: telUsuario || null,
                colaboradores_telefonos: telUsuario || null
              });

            if (insErr) throw insErr;
          }
        }

        vibrar(200);
        setSubmitSuccess('¡Necesidad procesada y consolidada en el centro!');
        setCantidadRequerida(''); setDescripcionNecesidad('');
        await refetch();
        setTimeout(() => { onTabChange('suministros'); setSubmitSuccess(''); }, 1500);
      } catch (err: any) {
        setSubmitError(err.message || 'Error al procesar necesidades.');
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
          reportado_por_fingerprint: fp,
          reportado_autenticado: user !== null,
          mensaje_alerta: mensajeAlerta.trim() || null
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

      // Medida 3: Validación geográfica
      const gpsVerificado = latitud && longitud && latitudCentro && longitudCentro
        ? validarDistanciaGPS(latitud, longitud, latitudCentro, longitudCentro)
        : false;

      const { data: centroData, error: cErr } = await (supabase as any).from('centros_acopio').insert({
        nombre: nombreCentro.trim(),
        estado: estadoReporte,
        municipio: municipioReporte.trim(),
        direccion: direccionReporte.trim(),
        coordenadas: coords,
        estatus_general: estatus,
        verificado: isAdmin,
        creado_por: user?.id || null,
        reportado_por_fingerprint: fp,
        reportado_autenticado: user !== null,
        gps_verificado: gpsVerificado,
        telefono_contacto: user?.user_metadata?.telefono || null,
        mensaje_alerta: mensajeAlerta.trim() || null
      }).select().single();
      if (cErr) throw cErr;

      const necesidadesRows = categoriasSeleccionadas.map(cat => ({
        centro_id: centroData.id,
        categoria: cat,
        descripcion: descripcionNecesidad.trim(),
        cantidad_requerida: cantidadRequerida.trim(),
        estatus: 'pendiente' as const,
        urgencia: urgenciaSeleccionada,
        votos_no_vigente: 0,
        votos_vigente: 0,
        reportado_por_fingerprint: fp,
        reportado_autenticado: user !== null,
        telefono_contacto: user?.user_metadata?.telefono || null,
        colaboradores_telefonos: user?.user_metadata?.telefono || null
      }));
      const { error: nErr } = await (supabase as any).from('necesidades').insert(necesidadesRows);
      if (nErr) throw nErr;

      vibrar(200);
      registrarReporteEnCooldown();
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
    setMensajeAlerta(''); setBusquedaMap(''); setSugerenciasMap([]);
    setCaptchaRespuesta('');
  };

  if (!user) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6 text-center animate-fadeIn" role="tabpanel" id="panel-reportar" aria-label="Autenticación requerida">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-100">
          <Siren className="w-8 h-8 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Registro e Inicio de Sesión Requerido</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
            Para evitar reportes falsos y spam, debes registrarte y proveer tu número de teléfono celular antes de poder reportar refugios o necesidades de suministros.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onTabChange('ajustes')}
          className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl shadow-md active:scale-95 transition-transform"
        >
          IR A INICIAR SESIÓN / REGISTRO
        </button>
      </div>
    );
  }

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
        {/* Honeypot anti-bot (invisible para humanos) */}
        <input
          type="text"
          name="website_url"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
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
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase">Ubicación del Refugio (Opcional)</label>
              
              {/* Input Yummy Rides de búsqueda de dirección */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar dirección en el mapa (ej. Plaza Altamira, Chacao)..."
                  value={busquedaMap}
                  onChange={e => setBusquedaMap(e.target.value)}
                  className="w-full pl-9 pr-12 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold text-gray-800"
                />
                {buscandoMap && (
                  <span className="absolute right-3 top-3 text-[9px] text-gray-400 font-bold animate-pulse">Buscando...</span>
                )}
                
                {sugerenciasMap.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 divide-y divide-gray-100 animate-fadeIn overflow-hidden">
                    {sugerenciasMap.map((sug, idx) => {
                      const partes = sug.display_name.split(',');
                      const titulo = partes[0];
                      const subtitulo = partes.slice(1).join(',').trim();
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => seleccionarSugerencia(sug)}
                          className="w-full text-left px-4 py-2.5 hover:bg-red-50/50 hover:text-red-900 transition-all flex items-start gap-2.5"
                        >
                          <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          <div className="truncate">
                            <p className="text-xs font-bold text-gray-800 truncate">{titulo}</p>
                            {subtitulo && <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">{subtitulo}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={detectarUbicacion} disabled={gpsLoading}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border border-gray-200 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  aria-label="Detectar ubicación GPS actual">
                  <MapPin className="w-3.5 h-3.5 text-gray-600" />{gpsLoading ? 'Detectando...' : 'DETECTAR MI UBICACIÓN'}
                </button>
                {ubicacionFijada && (
                  <button type="button" onClick={() => { setLatitudCentro(null); setLongitudCentro(null); setUbicacionFijada(false); resetGps(); setBusquedaMap(''); }}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200 active:scale-95 transition-transform"
                    aria-label="Borrar ubicación del mapa">
                    BORRAR PIN
                  </button>
                )}
              </div>
              
              {gpsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-800 text-xs font-semibold animate-shake" role="alert">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Permiso de ubicación denegado</p>
                    <p className="text-[10px] text-red-600 font-medium mt-0.5">Active el GPS en los ajustes de su navegador o use el buscador superior para marcar el pin en el mapa.</p>
                  </div>
                </div>
              )}
              
              <p className="text-[10px] font-medium text-gray-500">
                💡 Escribe la dirección arriba o toca directamente el mapa para ajustar el pin.
              </p>

              <div className="relative h-72 rounded-lg overflow-hidden border border-gray-200">
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

        {mode === 'nuevo' && (
          <div className="space-y-1">
            <label htmlFor="mensaje-alerta" className="flex justify-between text-xs font-bold text-gray-600 uppercase">
              <span>Mensaje del Coordinador (Opcional)</span>
              <span className={`text-[10px] ${palabrasRestantesAlerta < 10 ? 'text-red-500 font-bold' : 'text-gray-400 font-semibold'}`}>
                {palabrasRestantesAlerta} palabras restantes
              </span>
            </label>
            <textarea
              id="mensaje-alerta"
              placeholder="Aviso rápido de 100 palabras. Ej. Recibimos donaciones solo en la entrada norte, preguntar por Juan..."
              value={mensajeAlerta}
              onChange={e => handleMensajeAlertaChange(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800 resize-none"
            />
          </div>
        )}

        {isAdmin && (
          <div className="p-2.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" /><span>Enviando como <strong>Coordinador Verificado</strong></span>
          </div>
        )}

        {requiereCaptcha && captchaPregunta && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <label htmlFor="captcha-input" className="block text-xs font-bold text-amber-900 uppercase">
              Verificación de seguridad (Reputación baja)
            </label>
            <p className="text-xs text-amber-800 font-semibold">{captchaPregunta.pregunta}</p>
            <input
              id="captcha-input"
              type="text"
              placeholder="Escribe tu respuesta aquí..."
              value={captchaRespuesta}
              onChange={e => setCaptchaRespuesta(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium text-amber-950"
              required
            />
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

      {/* Modal de duplicado geográfico detectado */}
      <ConfirmModal open={showDuplicadoModal} title="Centro Similar Detectado"
        confirmLabel="Usar Existente" cancelLabel="Crear Nuevo"
        onConfirm={() => {
          if (duplicadoDetectado) {
            setMode('existente');
            setCentroExistenteId(duplicadoDetectado.id);
            setBusquedaCentro(duplicadoDetectado.nombre);
          }
          setShowDuplicadoModal(false);
          setDuplicadoDetectado(null);
        }}
        onCancel={() => {
          setShowDuplicadoModal(false);
          setDuplicadoDetectado(null);
          setShowConfirm(true);
        }}>
        <div className="space-y-2 text-xs">
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Ya existe un centro similar:</p>
              <p className="text-amber-800 mt-1"><strong>{duplicadoDetectado?.nombre}</strong></p>
              <p className="text-amber-700">{duplicadoDetectado?.municipio}, {duplicadoDetectado?.estado}</p>
            </div>
          </div>
          <p className="text-gray-600">¿Deseas agregar tu necesidad al centro existente en lugar de crear uno nuevo?</p>
        </div>
      </ConfirmModal>
    </div>
  );
}
