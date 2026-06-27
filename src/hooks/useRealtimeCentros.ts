import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CentroAcopioConDetalles, CentroAcopio, Necesidad } from '../types/database.types';

export function useRealtimeCentros() {
  const [centros, setCentros] = useState<CentroAcopioConDetalles[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Función para realizar la carga inicial de datos (SSR/Client fallback)
  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Consultar centros de acopio ordenados por última actualización
      const { data, error: dbError } = await supabase
        .from('centros_acopio')
        .select(`
          *,
          necesidades (*)
        `)
        .order('ultima_actualizacion', { ascending: false });

      if (dbError) throw dbError;

      // Moldear los datos
      const centrosFormateados: CentroAcopioConDetalles[] = (data || []).map((centro: any) => ({
        ...centro,
        necesidades: centro.necesidades || [],
      }));

      setCentros(centrosFormateados);
    } catch (err: any) {
      console.error('Error detallado al cargar centros de acopio:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code,
        rawError: err
      });

      const esPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || 
                            process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-url') ||
                            supabase.auth.getSession === undefined; // Check si el cliente está usando fallbacks
      
      if (esPlaceholder) {
        setError(
          'Las credenciales de Supabase no están configuradas. ' +
          'Por favor, crea un archivo ".env.local" en la raíz del proyecto con ' +
          'NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY de tu consola de Supabase, ' +
          'y luego reinicia el servidor de desarrollo (npm run dev).'
        );
      } else {
        setError(err.message || 'Error de conexión o permisos con Supabase (verifica el RLS y las tablas).');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Cargar datos iniciales
    cargarDatos();

    // 2. Suscribirse a cambios en tiempo real
    const canal = supabase
      .channel('public:cambios-suministros')
      // A. Escuchar cambios en la tabla centros_acopio
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'centros_acopio' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setCentros((prevCentros) => {
            if (eventType === 'INSERT') {
              const nuevoCentro = newRow as CentroAcopio;
              // Evitar duplicados si ya se cargó
              if (prevCentros.some((c) => c.id === nuevoCentro.id)) return prevCentros;
              return [{ ...nuevoCentro, necesidades: [] }, ...prevCentros];
            }

            if (eventType === 'UPDATE') {
              const centroActualizado = newRow as CentroAcopio;
              return prevCentros.map((centro) => {
                if (centro.id === centroActualizado.id) {
                  // Mantener las necesidades del centro en el cliente al actualizar datos generales del centro
                  return {
                    ...centro,
                    ...centroActualizado,
                    necesidades: centro.necesidades,
                  };
                }
                return centro;
              });
            }

            if (eventType === 'DELETE') {
              const centroEliminado = oldRow as { id: string };
              return prevCentros.filter((centro) => centro.id !== centroEliminado.id);
            }

            return prevCentros;
          });
        }
      )
      // B. Escuchar cambios en la tabla necesidades
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'necesidades' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setCentros((prevCentros) => {
            if (eventType === 'INSERT') {
              const nuevaNecesidad = newRow as Necesidad;
              return prevCentros.map((centro) => {
                if (centro.id === nuevaNecesidad.centro_id) {
                  // Evitar duplicados
                  if (centro.necesidades.some((n) => n.id === nuevaNecesidad.id)) return centro;
                  return {
                    ...centro,
                    necesidades: [...centro.necesidades, nuevaNecesidad],
                  };
                }
                return centro;
              });
            }

            if (eventType === 'UPDATE') {
              const necesidadActualizada = newRow as Necesidad;
              return prevCentros.map((centro) => {
                if (centro.id === necesidadActualizada.centro_id) {
                  return {
                    ...centro,
                    necesidades: centro.necesidades.map((n) =>
                      n.id === necesidadActualizada.id ? necesidadActualizada : n
                    ),
                  };
                }
                return centro;
              });
            }

            if (eventType === 'DELETE') {
              const necesidadEliminada = oldRow as { id: string; centro_id?: string };
              return prevCentros.map((centro) => {
                // Si conocemos el centro_id del elemento eliminado, optimizamos la búsqueda,
                // de lo contrario filtramos en todos los centros.
                if (!necesidadEliminada.centro_id || centro.id === necesidadEliminada.centro_id) {
                  return {
                    ...centro,
                    necesidades: centro.necesidades.filter((n) => n.id !== necesidadEliminada.id),
                  };
                }
                return centro;
              });
            }

            return prevCentros;
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('🔴 Conectado en tiempo real al canal de emergencias de Supabase');
        }
      });

    // Limpiar la suscripción al desmontar el componente para evitar fugas de memoria
    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargarDatos]);

  return { centros, loading, error, refetch: cargarDatos, setCentros };
}
