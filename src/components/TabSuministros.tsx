'use client';

import React from 'react';
import { PlusCircle, Loader2 } from 'lucide-react';
import { CentroCard } from './CentroCard';
import { CentroAcopioConDetalles } from '../types/database.types';

interface TabSuministrosProps {
  centros: CentroAcopioConDetalles[];
  loading: boolean;
  error: string | null;
  estadoFiltro: string;
  urgenciaFiltro: string;
  onEstadoChange: (estado: string) => void;
  onUrgenciaChange: (urgencia: string) => void;
  onRefetch: () => void;
  onTabChange: (tab: string) => void;
}

const ESTADOS_VENEZUELA = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
  'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
  'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta',
  'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia', 'Vargas'
];

export function TabSuministros({
  centros, loading, error, estadoFiltro, urgenciaFiltro,
  onEstadoChange, onUrgenciaChange, onRefetch, onTabChange,
}: TabSuministrosProps) {
  const criticosCount = centros.filter(c => c.estatus_general === 'critico').length;
  const parcialesCount = centros.filter(c => c.estatus_general === 'parcial').length;
  const surtidosCount = centros.filter(c => c.estatus_general === 'surtido').length;

  return (
    <div className="space-y-4" role="tabpanel" id="panel-suministros" aria-label="Lista de suministros">
      {/* Botón Reportar — PRIMERO: acción más urgente en emergencia */}
      <div className="space-y-1.5 text-center">
        <button
          onClick={() => onTabChange('reportar')}
          className="w-full py-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"
          aria-label="Reportar una nueva necesidad o centro de acopio"
        >
          <PlusCircle className="w-5 h-5 shrink-0" />
          REPORTAR NECESIDAD / CENTRO
        </button>
        <p className="text-[10px] text-gray-500 font-medium leading-normal px-2">
          Al reportar una necesidad o centro de acopio te volverás coordinador de dicha zona y los que quieran ayudarte se pondrán en contacto contigo.
        </p>
      </div>

      {/* Filtros rápidos de urgencia */}
      <div className="flex gap-2" role="group" aria-label="Filtros de urgencia">
        {[
          { key: 'critico', label: 'Críticos', count: criticosCount, colors: { active: 'bg-red-50 text-red-700 border-red-500 ring-2 ring-red-200', idle: 'bg-white text-red-600 border-red-200 hover:bg-red-50' } },
          { key: 'parcial', label: 'Parciales', count: parcialesCount, colors: { active: 'bg-amber-50 text-amber-800 border-amber-500 ring-2 ring-amber-200', idle: 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50' } },
          { key: 'surtido', label: 'Estables', count: surtidosCount, colors: { active: 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-200', idle: 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50' } },
        ].map(({ key, label, count, colors }) => (
          <button
            key={key}
            onClick={() => onUrgenciaChange(urgenciaFiltro === key ? 'todos' : key)}
            className={`flex-1 py-2 px-1 text-xs font-bold rounded-lg border transition-all text-center ${urgenciaFiltro === key ? colors.active : colors.idle}`}
            aria-pressed={urgenciaFiltro === key}
            aria-label={`Filtrar por ${label}`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Selector de Estado — filtro secundario */}
      <div className="w-full">
        <select
          id="filtro-estado"
          value={estadoFiltro}
          onChange={(e) => onEstadoChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold text-gray-800 appearance-none"
          aria-label="Filtrar centros por estado de Venezuela"
          style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem', backgroundRepeat: 'no-repeat' }}
        >
          <option value="todos">📍 Filtrar por Estado</option>
          {ESTADOS_VENEZUELA.map((estado) => (
            <option key={estado} value={estado}>{estado}</option>
          ))}
        </select>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-500">Cargando centros de acopio...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-800 text-sm border border-red-100 p-4 rounded-xl text-center space-y-2" role="alert">
          <p className="font-bold">Error de conexión:</p>
          <p className="text-xs">{error}</p>
          <button onClick={onRefetch} className="px-3 py-1.5 bg-red-700 text-white font-bold text-xs rounded hover:bg-red-800" aria-label="Reintentar conexión con el servidor">
            Reintentar Conexión
          </button>
        </div>
      ) : centros.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500 font-semibold mb-2">No se encontraron centros de acopio.</p>
          <p className="text-xs text-gray-400">Intente modificando los filtros de estado o la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {centros.map((centro) => (
            <CentroCard key={centro.id} centro={centro} refetch={onRefetch} />
          ))}
        </div>
      )}
    </div>
  );
}
