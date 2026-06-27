'use client';

import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Check, 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle, 
  Droplet, 
  Utensils, 
  Heart, 
  Zap, 
  Activity,
  Award,
  Sparkles
} from 'lucide-react';
import { CentroAcopioConDetalles, Necesidad } from '../types/database.types';
import { supabase } from '../lib/supabaseClient';

interface CentroCardProps {
  centro: CentroAcopioConDetalles;
}

// Función de tiempo relativo optimizada en JS puro
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    
    // Si la hora del cliente está desincronizada o el reporte es muy nuevo
    if (diffInMs < 0) return 'Hace un momento';

    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    if (diffInMins < 1) return 'Hace un momento';
    if (diffInMins < 60) return `Hace ${diffInMins} min`;
    
    const diffInHours = Math.floor(diffInMins / 60);
    if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `Hace ${diffInDays} ${diffInDays === 1 ? 'día' : 'días'}`;
  } catch (e) {
    return 'Recientemente';
  }
}

// Icono correspondiente a la categoría
function getCategoriaIcon(categoria: string) {
  switch (categoria) {
    case 'agua_hidratacion':
      return <Droplet className="w-3.5 h-3.5 mr-1 text-blue-600" />;
    case 'alimentos_no_perecederos':
      return <Utensils className="w-3.5 h-3.5 mr-1 text-amber-600" />;
    case 'medicinas_primeros_auxilios':
      return <Heart className="w-3.5 h-3.5 mr-1 text-red-600" />;
    case 'ropa_mantas':
      return <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />;
    case 'higiene_personal':
      return <Activity className="w-3.5 h-3.5 mr-1 text-emerald-600" />;
    case 'energia_electricidad':
      return <Zap className="w-3.5 h-3.5 mr-1 text-yellow-500" />;
    default:
      return <Activity className="w-3.5 h-3.5 mr-1 text-gray-600" />;
  }
}

// Nombre legible de la categoría
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

// Estilos de la necesidad en base a urgencia
function getUrgenciaStyles(urgencia: 'critico' | 'parcial' | 'recibiendo') {
  switch (urgencia) {
    case 'critico':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'parcial':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'recibiendo':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function getUrgenciaLabel(urgencia: 'critico' | 'parcial' | 'recibiendo') {
  switch (urgencia) {
    case 'critico':
      return 'CRÍTICO';
    case 'parcial':
      return 'Recibiendo';
    case 'recibiendo':
      return 'Estable';
    default:
      return 'Pendiente';
  }
}

export function CentroCard({ centro }: CentroCardProps) {
  // Guardar votos emitidos en el cliente para deshabilitar clicks repetidos
  const [votosLocal, setVotosLocal] = useState<{ [key: string]: 'vigente' | 'no_vigente' }>({});
  const [votando, setVotando] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // Cargar historial de votos del usuario en este navegador
    const storedVotes = localStorage.getItem('suministros_sos_votos');
    if (storedVotes) {
      try {
        setVotosLocal(JSON.parse(storedVotes));
      } catch (e) {
        console.error('Error parseando votos locales', e);
      }
    }
  }, []);

  // Función para manejar el voto
  const handleVotar = async (necesidadId: string, tipoVoto: 'vigente' | 'no_vigente') => {
    // Si ya votó esta necesidad, no hacer nada
    if (votosLocal[necesidadId] || votando[necesidadId]) return;

    setVotando(prev => ({ ...prev, [necesidadId]: true }));

    // Actualización optimista del estado para evitar lag en 3G
    const nuevosVotos = { ...votosLocal, [necesidadId]: tipoVoto };
    setVotosLocal(nuevosVotos);
    localStorage.setItem('suministros_sos_votos', JSON.stringify(nuevosVotos));

    try {
      // Llamar a la función RPC de Supabase para incrementar votos en el servidor
      const rpcName = tipoVoto === 'vigente' ? 'votar_necesidad_vigente' : 'votar_necesidad_no_vigente';
      const { error } = await supabase.rpc(rpcName, { necesidad_id: necesidadId });
      
      if (error) {
        // Si hay error en base de datos, revertir voto local
        console.error('Error al registrar voto en Supabase:', error);
        const { [necesidadId]: _, ...revertedVotes } = nuevosVotos;
        setVotosLocal(revertedVotes);
        localStorage.setItem('suministros_sos_votos', JSON.stringify(revertedVotes));
      }
    } catch (err) {
      console.error('Error de red en votación:', err);
    } finally {
      setVotando(prev => ({ ...prev, [necesidadId]: false }));
    }
  };

  // Color del borde de prioridad del centro de acopio
  const getBordeColor = (estatus: string) => {
    switch (estatus) {
      case 'critico':
        return 'border-t-red-600';
      case 'parcial':
        return 'border-t-amber-500';
      case 'surtido':
        return 'border-t-emerald-600';
      default:
        return 'border-t-gray-400';
    }
  };

  // Filtrar necesidades válidas (que no tengan más de 3 votos no vigentes para evitar spam)
  const necesidadesFiltradas = centro.necesidades?.filter(
    (n) => n.estatus !== 'surtido'
  ) || [];

  return (
    <div className={`bg-white rounded-xl shadow-sm border-t-4 ${getBordeColor(centro.estatus_general)} border-x border-b border-gray-100 overflow-hidden transition-all duration-300`}>
      <div className="p-4">
        
        {/* Cabecera del Centro */}
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-bold text-gray-900 text-lg leading-tight flex items-center gap-1">
              {centro.nombre}
              {centro.verificado && (
                <span className="inline-flex text-blue-600" title="Centro Verificado Oficial">
                  <Award className="w-5 h-5 fill-blue-500 text-white" />
                </span>
              )}
            </h3>
          </div>
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 whitespace-nowrap shrink-0">
            {formatRelativeTime(centro.ultima_actualizacion)}
          </span>
        </div>

        {/* Ubicación */}
        <div className="flex items-center text-gray-600 text-xs mb-4 gap-1">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-700">{centro.municipio}, {centro.estado}</span>
          <span className="text-gray-300">|</span>
          <span className="truncate" title={centro.direccion}>{centro.direccion}</span>
        </div>

        {/* Listado de Necesidades Activas */}
        <div className="space-y-3">
          {necesidadesFiltradas.length === 0 ? (
            <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" /> No hay necesidades urgentes reportadas en este momento.
            </p>
          ) : (
            necesidadesFiltradas.map((necesidad) => {
              const esSpam = necesidad.votos_no_vigente >= 3;
              const yaVotoVigente = votosLocal[necesidad.id] === 'vigente';
              const yaVotoNoVigente = votosLocal[necesidad.id] === 'no_vigente';
              const haVotado = yaVotoVigente || yaVotoNoVigente;

              return (
                <div 
                  key={necesidad.id} 
                  className={`border border-gray-100 rounded-lg p-3 transition-opacity duration-200 ${esSpam ? 'opacity-50 bg-gray-50' : 'bg-white'}`}
                >
                  {/* Fila superior de la Necesidad */}
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 border text-xs font-semibold rounded-md ${getUrgenciaStyles(necesidad.urgencia)}`}>
                      {getCategoriaIcon(necesidad.categoria)}
                      {getCategoriaLabel(necesidad.categoria)} - {getUrgenciaLabel(necesidad.urgencia)}
                    </span>
                    <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      Cant: {necesidad.cantidad_requerida}
                    </span>
                  </div>

                  {/* Descripción */}
                  <p className="text-gray-700 text-sm mb-3 font-medium">
                    {necesidad.descripcion}
                  </p>

                  {/* Sección Anti-Spam / Validación Comunitaria */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-gray-50">
                    <span className="text-xs text-gray-500 font-semibold">
                      ¿Sigue vigente este reporte?
                    </span>
                    
                    <div className="flex items-center gap-2">
                      {/* Botón Sí - Sigue Vigente */}
                      <button
                        onClick={() => handleVotar(necesidad.id, 'vigente')}
                        disabled={haVotado || votando[necesidad.id]}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                          yaVotoVigente 
                            ? 'bg-emerald-600 text-white border-emerald-600' 
                            : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 active:scale-95'
                        } disabled:cursor-not-allowed`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Sí ({necesidad.votos_vigente + (yaVotoVigente ? 1 : 0)})
                      </button>

                      {/* Botón No - Ya no se necesita / Reporte Falso */}
                      <button
                        onClick={() => handleVotar(necesidad.id, 'no_vigente')}
                        disabled={haVotado || votando[necesidad.id]}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                          yaVotoNoVigente 
                            ? 'bg-red-600 text-white border-red-600' 
                            : 'bg-white text-red-700 border-red-200 hover:bg-red-50 active:scale-95'
                        } disabled:cursor-not-allowed`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        No ({necesidad.votos_no_vigente + (yaVotoNoVigente ? 1 : 0)})
                      </button>
                    </div>
                  </div>

                  {/* Alerta de Verificación si acumula sospechas de spam/falsedad */}
                  {esSpam && (
                    <div className="mt-2.5 bg-red-50 text-red-800 text-xs border border-red-200 px-3 py-2 rounded-lg flex items-start gap-1.5 animate-pulse">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Reporte bajo revisión:</span> Este suministro ha recibido múltiples reportes de no vigencia o falsedad por la comunidad. Requiere verificación oficial.
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
