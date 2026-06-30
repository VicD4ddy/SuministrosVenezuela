import React, { useRef, useEffect, useState } from 'react';
import { Loader2, Navigation, MapPin } from 'lucide-react';
import { useLeaflet } from '../hooks/useLeaflet';
import { CentroAcopioConDetalles } from '../types/database.types';
import { obtenerLatLng } from '../lib/geo';
import { getCategoriaLabel, getEstatusMapColor } from '../lib/categorias';
import { vibrar } from '../lib/feedback';

interface TabMapaProps {
  centros: CentroAcopioConDetalles[];
}

export function TabMapa({ centros }: TabMapaProps) {
  const { L, isReady } = useLeaflet();
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Inicializar el mapa una sola vez cuando Leaflet está listo
  useEffect(() => {
    if (!isReady || !L || !containerRef.current) return;

    // Solo crear el mapa si no existe
    if (!mapRef.current) {
      const map = L.map(containerRef.current).setView([8.5, -66.5], 6);
      mapRef.current = map;

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
        userMarkerRef.current = null;
      }
    };
  }, [isReady, L]);

  // Actualizar solo los marcadores cuando cambian los centros (sin destruir el mapa)
  useEffect(() => {
    if (!L || !markersRef.current) return;

    markersRef.current.clearLayers();

    centros.forEach((centro) => {
      const posicion = obtenerLatLng(centro.coordenadas);
      if (!posicion) return;

      const color = getEstatusMapColor(centro.estatus_general);

      const pinIcon = L.divIcon({
        html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.35);"></div>`,
        className: 'custom-map-pin',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const necesidadesLista = centro.necesidades?.length > 0
        ? centro.necesidades.map(n => `<li>${getCategoriaLabel(n.categoria)} (${n.urgencia.toUpperCase()})</li>`).join('')
        : '<li>Sin suministros urgentes</li>';

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 160px; padding: 2px;">
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
        .addTo(markersRef.current)
        .bindPopup(popupContent);
    });
  }, [L, centros]);

  const centrarEnUsuario = () => {
    if (typeof window === 'undefined' || !navigator.geolocation || !L || !mapRef.current) {
      setGpsError('La geolocalización no está soportada o no está disponible.');
      return;
    }

    setGpsLoading(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        vibrar(100);

        // Mover cámara
        mapRef.current.setView([latitude, longitude], 14);

        // Remover pin de usuario anterior
        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
        }

        // Crear nuevo pin de usuario de color azul
        const userIcon = L.divIcon({
          html: `<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(59, 130, 246, 0.65);"></div>`,
          className: 'custom-user-pin',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon })
          .addTo(mapRef.current)
          .bindPopup('<b style="font-size: 11px;">Tu ubicación actual</b>')
          .openPopup();

        setGpsLoading(false);
      },
      (err) => {
        console.warn('Error detectando ubicación en mapa:', err);
        setGpsError('Permiso de ubicación denegado o señal GPS débil.');
        setGpsLoading(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4" role="tabpanel" id="panel-mapa" aria-label="Mapa de suministros">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">Mapa de Suministros SOS</h2>
          <p className="text-xs text-gray-500 mt-1">Visualización geográfica interactiva en tiempo real.</p>
        </div>
        
        <button onClick={centrarEnUsuario} disabled={gpsLoading || !isReady}
          className="py-2 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform shrink-0 disabled:opacity-50"
          aria-label="Ver centros de acopio cercanos a mi ubicación">
          {gpsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          VER CENTROS CERCANOS
        </button>
      </div>

      {gpsError && (
        <p className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-700 font-bold" role="alert">
          ⚠️ {gpsError}
        </p>
      )}

      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-inner">
        <div ref={containerRef} style={{ height: '320px', width: '100%' }} className="rounded-xl" />
        {!isReady && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[1000]" role="status">
            <Loader2 className="w-6 h-6 text-red-600 animate-spin mr-2" aria-hidden="true" />
            <p className="text-xs text-gray-500 font-bold">Cargando mapa...</p>
          </div>
        )}
      </div>

      <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leyenda</h4>
        <div className="flex items-center justify-between text-xs font-bold text-gray-700 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#dc2626] inline-block border-2 border-white shadow-sm" aria-hidden="true" />
            <span>Crítico</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#f59e0b] inline-block border-2 border-white shadow-sm" aria-hidden="true" />
            <span>Parcial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#10b981] inline-block border-2 border-white shadow-sm" aria-hidden="true" />
            <span>Estable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
