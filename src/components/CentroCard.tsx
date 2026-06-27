'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Check, ThumbsUp, ThumbsDown, AlertTriangle, Award, Eye, EyeOff, Share2 } from 'lucide-react';
import { CentroAcopioConDetalles } from '../types/database.types';
import { supabase } from '../lib/supabaseClient';
import { obtenerLatLng, calcularDistanciaKm, generarFingerprint, formatRelativeTime } from '../lib/geo';
import { getCategoriaIcon, getCategoriaLabel, getUrgenciaStyles, getUrgenciaLabel, getEstatusBorderColor } from '../lib/categorias';
import { vibrar, generarEnlaceWhatsApp } from '../lib/feedback';

interface CentroCardProps {
  centro: CentroAcopioConDetalles;
}

export function CentroCard({ centro }: CentroCardProps) {
  const [votosLocal, setVotosLocal] = useState<Record<string, 'vigente' | 'no_vigente'>>({});
  const [votando, setVotando] = useState<Record<string, boolean>>({});
  const [verSpam, setVerSpam] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('suministros_sos_votos');
      if (stored) setVotosLocal(JSON.parse(stored));
    } catch { /* silenciar */ }
  }, []);

  const handleVotar = async (necesidadId: string, tipoVoto: 'vigente' | 'no_vigente') => {
    if (votosLocal[necesidadId] || votando[necesidadId]) return;
    setVotando(prev => ({ ...prev, [necesidadId]: true }));

    const ejecutarVoto = async () => {
      const nuevosVotos = { ...votosLocal, [necesidadId]: tipoVoto };
      setVotosLocal(nuevosVotos);
      localStorage.setItem('suministros_sos_votos', JSON.stringify(nuevosVotos));

      try {
        const fp = generarFingerprint();
        const rpcName = tipoVoto === 'vigente' ? 'votar_necesidad_vigente' : 'votar_necesidad_no_vigente';
        const { data, error } = await supabase.rpc(rpcName, { p_necesidad_id: necesidadId, p_fingerprint: fp });

        if (error) {
          console.warn('Error al registrar voto:', error.message || error.code || JSON.stringify(error));
          const { [necesidadId]: _, ...revertido } = nuevosVotos;
          setVotosLocal(revertido);
          localStorage.setItem('suministros_sos_votos', JSON.stringify(revertido));
        } else {
          vibrar(100);
          if (data === false) {
            // Voto duplicado detectado por el servidor
            console.info('Voto duplicado detectado por rate-limiting del servidor.');
          }
        }
      } catch (err) {
        console.error('Error de red en votación:', err);
      } finally {
        setVotando(prev => ({ ...prev, [necesidadId]: false }));
      }
    };

    // Geofencing
    const centroPosicion = obtenerLatLng(centro.coordenadas);
    if (centroPosicion && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = calcularDistanciaKm(pos.coords.latitude, pos.coords.longitude, centroPosicion[0], centroPosicion[1]);
          if (dist > 15) {
            const ok = window.confirm(`⚠️ Estás a ${dist.toFixed(1)} km de este refugio.\n¿Deseas confirmar tu voto?`);
            if (!ok) { setVotando(prev => ({ ...prev, [necesidadId]: false })); return; }
          }
          ejecutarVoto();
        },
        () => ejecutarVoto(),
        { timeout: 5000 }
      );
    } else {
      ejecutarVoto();
    }
  };

  const compartirWhatsApp = () => {
    const necesidadesTexto = (centro.necesidades || [])
      .filter(n => n.estatus === 'pendiente')
      .map(n => `  • ${getCategoriaLabel(n.categoria)} (${n.urgencia.toUpperCase()}) — ${n.descripcion}`)
      .join('\n');

    const texto = `🚨 *SUMINISTROS SOS VENEZUELA* 🇻🇪\n\n*${centro.nombre}*\n📍 ${centro.municipio}, ${centro.estado}\n📋 ${centro.direccion}\n\n*Necesidades activas:*\n${necesidadesTexto || '  Sin necesidades reportadas'}\n\n🔗 Coordina en tiempo real.`;
    window.open(generarEnlaceWhatsApp(texto), '_blank');
  };

  const necesidadesFiltradas = (centro.necesidades || []).filter(n => n.estatus !== 'surtido');

  return (
    <div className={`bg-white rounded-xl shadow-sm border-t-4 ${getEstatusBorderColor(centro.estatus_general)} border-x border-b border-gray-100 overflow-hidden transition-all duration-300`}>
      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="font-bold text-gray-900 text-lg leading-tight flex items-center gap-1">
            {centro.nombre}
            {centro.verificado && (
              <span className="inline-flex text-blue-600" title="Coordinador Verificado" aria-label="Centro verificado oficialmente">
                <Award className="w-5 h-5 fill-blue-500 text-white" />
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={compartirWhatsApp} className="p-1 text-gray-400 hover:text-emerald-600 rounded transition-colors" aria-label="Compartir por WhatsApp" title="Compartir por WhatsApp">
              <Share2 className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 whitespace-nowrap">
              {formatRelativeTime(centro.ultima_actualizacion)}
            </span>
          </div>
        </div>

        <div className="flex items-center text-gray-600 text-xs mb-4 gap-1">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
          <span className="font-medium text-gray-700">{centro.municipio}, {centro.estado}</span>
          {centro.coordenadas && (<><span className="text-gray-300">|</span><span className="text-[10px] font-semibold text-blue-600">GPS</span></>)}
          <span className="text-gray-300">|</span>
          <span className="truncate max-w-[150px]" title={centro.direccion}>{centro.direccion}</span>
        </div>

        <div className="space-y-3">
          {necesidadesFiltradas.length === 0 ? (
            <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> Sin necesidades urgentes.
            </p>
          ) : (
            necesidadesFiltradas.map((necesidad) => {
              const score = necesidad.votos_vigente - (2 * necesidad.votos_no_vigente);
              const esSpam = score <= -3 || necesidad.votos_no_vigente >= 3;
              const yaVotoV = votosLocal[necesidad.id] === 'vigente';
              const yaVotoNV = votosLocal[necesidad.id] === 'no_vigente';
              const haVotado = yaVotoV || yaVotoNV;
              const oculto = esSpam && !verSpam[necesidad.id];

              return (
                <div key={necesidad.id} className={`border border-gray-100 rounded-lg p-3 transition-all ${esSpam ? 'bg-red-50/30 border-red-100/50' : 'bg-white'}`}>
                  {esSpam && (
                    <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-red-100/30">
                      <span className="text-[10px] font-bold text-red-700 bg-red-100/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Spam (Score: {score})
                      </span>
                      <button type="button" onClick={() => setVerSpam(prev => ({ ...prev, [necesidad.id]: !prev[necesidad.id] }))}
                        className="text-[10px] font-bold text-red-800 hover:underline flex items-center gap-1"
                        aria-label={oculto ? 'Mostrar contenido del reporte' : 'Ocultar reporte'}>
                        {oculto ? <><Eye className="w-3 h-3" /> Mostrar</> : <><EyeOff className="w-3 h-3" /> Ocultar</>}
                      </button>
                    </div>
                  )}

                  {!oculto ? (
                    <div className="animate-fadeIn">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 border text-xs font-semibold rounded-md ${getUrgenciaStyles(necesidad.urgencia)}`}>
                          {getCategoriaIcon(necesidad.categoria)}
                          {getCategoriaLabel(necesidad.categoria)} - {getUrgenciaLabel(necesidad.urgencia)}
                        </span>
                        <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">Cant: {necesidad.cantidad_requerida}</span>
                      </div>
                      <p className="text-gray-700 text-sm mb-3 font-medium">{necesidad.descripcion}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-gray-50">
                        <span className="text-[11px] text-gray-500 font-semibold">¿Sigue vigente?</span>
                        <div className="flex items-center gap-2" role="group" aria-label="Votar vigencia del reporte">
                          <button onClick={() => handleVotar(necesidad.id, 'vigente')} disabled={haVotado || votando[necesidad.id]}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${yaVotoV ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 active:scale-95'} disabled:cursor-not-allowed`}
                            aria-label={`Votar que sí sigue vigente (${necesidad.votos_vigente + (yaVotoV ? 1 : 0)} votos)`} aria-pressed={yaVotoV}>
                            <ThumbsUp className="w-3.5 h-3.5" />Sí ({necesidad.votos_vigente + (yaVotoV ? 1 : 0)})
                          </button>
                          <button onClick={() => handleVotar(necesidad.id, 'no_vigente')} disabled={haVotado || votando[necesidad.id]}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${yaVotoNV ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50 active:scale-95'} disabled:cursor-not-allowed`}
                            aria-label={`Votar que no sigue vigente (${necesidad.votos_no_vigente + (yaVotoNV ? 1 : 0)} votos)`} aria-pressed={yaVotoNV}>
                            <ThumbsDown className="w-3.5 h-3.5" />No ({necesidad.votos_no_vigente + (yaVotoNV ? 1 : 0)})
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs italic">Reporte minimizado por votos de spam.</p>
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
