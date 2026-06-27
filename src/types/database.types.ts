// Tipos de datos estrictos y aplanados para el MVP de Suministros SOS 🇻🇪

export type EstatusCentro = 'critico' | 'parcial' | 'surtido';

export type CategoriaNecesidad = 
  | 'agua_hidratacion' 
  | 'alimentos_no_perecederos' 
  | 'medicinas_primeros_auxilios' 
  | 'ropa_mantas' 
  | 'higiene_personal'
  | 'energia_electricidad';

export type EstatusNecesidad = 'pendiente' | 'surtido';

export interface CoordenadasPoint {
  x: number; // Longitud
  y: number; // Latitud
}

export interface CentroAcopio {
  id: string;
  nombre: string;
  estado: string;
  municipio: string;
  direccion: string;
  coordenadas: string | null;
  estatus_general: EstatusCentro;
  verificado: boolean;
  creado_por: string | null;
  ultima_actualizacion: string;
  // Anti-spam
  reportado_por_fingerprint?: string | null;
  reportado_autenticado?: boolean;
  gps_verificado?: boolean;
  telefono_contacto?: string | null;
  mensaje_alerta?: string | null;
}

export interface Necesidad {
  id: string;
  centro_id: string;
  categoria: CategoriaNecesidad;
  descripcion: string;
  cantidad_requerida: string;
  estatus: EstatusNecesidad;
  urgencia: 'critico' | 'parcial' | 'recibiendo';
  votos_no_vigente: number;
  votos_vigente: number;
  creado_en: string;
  // Anti-spam
  reportado_por_fingerprint?: string | null;
  reportado_autenticado?: boolean;
  telefono_contacto?: string | null;
  colaboradores_telefonos?: string | null;
}

export interface HistorialEntrega {
  id: string;
  centro_id: string;
  item_entregado: string;
  cantidad_entregada: string;
  hora_entrega: string;
}

export interface CentroAcopioConDetalles extends Omit<CentroAcopio, 'coordenadas'> {
  coordenadas: CoordenadasPoint | string | null;
  necesidades: Necesidad[];
  historial_entregas?: HistorialEntrega[];
}

export interface LogModeracion {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  accion: string;
  entidad_tipo: 'centro' | 'necesidad';
  entidad_id: string;
  entidad_nombre: string | null;
  detalles: string | null;
  creado_en: string;
}

export interface ReputacionDispositivo {
  fingerprint: string;
  puntaje: number;
  total_reportes: number;
  reportes_eliminados: number;
  ultimo_reporte: string | null;
  actualizado_en: string;
}

// Estructura explícita del esquema de Supabase para evitar errores de compilación 'never[]'
export interface Database {
  public: {
    Tables: {
      centros_acopio: {
        Row: {
          id: string;
          nombre: string;
          estado: string;
          municipio: string;
          direccion: string;
          coordenadas: string | null;
          estatus_general: EstatusCentro;
          verificado: boolean;
          creado_por: string | null;
          ultima_actualizacion: string;
          reportado_por_fingerprint?: string | null;
          reportado_autenticado?: boolean;
          gps_verificado?: boolean;
          telefono_contacto?: string | null;
          mensaje_alerta?: string | null;
        };
        Insert: {
          id?: string;
          nombre: string;
          estado: string;
          municipio: string;
          direccion: string;
          coordenadas?: string | null;
          estatus_general: EstatusCentro;
          verificado?: boolean;
          creado_por?: string | null;
          ultima_actualizacion?: string;
          reportado_por_fingerprint?: string | null;
          reportado_autenticado?: boolean;
          gps_verificado?: boolean;
          telefono_contacto?: string | null;
          mensaje_alerta?: string | null;
        };
        Update: {
          id?: string;
          nombre?: string;
          estado?: string;
          municipio?: string;
          direccion?: string;
          coordenadas?: string | null;
          estatus_general?: EstatusCentro;
          verificado?: boolean;
          creado_por?: string | null;
          ultima_actualizacion?: string;
          reportado_por_fingerprint?: string | null;
          reportado_autenticado?: boolean;
          gps_verificado?: boolean;
          telefono_contacto?: string | null;
          mensaje_alerta?: string | null;
        };
        Relationships: [];
      };
      necesidades: {
        Row: {
          id: string;
          centro_id: string;
          categoria: CategoriaNecesidad;
          descripcion: string;
          cantidad_requerida: string;
          estatus: EstatusNecesidad;
          urgencia: 'critico' | 'parcial' | 'recibiendo';
          votos_no_vigente: number;
          votos_vigente: number;
          creado_en: string;
        };
        Insert: {
          id?: string;
          centro_id: string;
          categoria: CategoriaNecesidad;
          descripcion: string;
          cantidad_requerida: string;
          estatus?: EstatusNecesidad;
          urgencia?: 'critico' | 'parcial' | 'recibiendo';
          votos_no_vigente?: number;
          votos_vigente?: number;
          creado_en?: string;
        };
        Update: {
          id?: string;
          centro_id?: string;
          categoria?: CategoriaNecesidad;
          descripcion?: string;
          cantidad_requerida?: string;
          estatus?: EstatusNecesidad;
          urgencia?: 'critico' | 'parcial' | 'recibiendo';
          votos_no_vigente?: number;
          votos_vigente?: number;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "necesidades_centro_id_fkey";
            columns: ["centro_id"];
            referencedRelation: "centros_acopio";
            referencedColumns: ["id"];
          }
        ];
      };
      historial_entregas: {
        Row: {
          id: string;
          centro_id: string;
          item_entregado: string;
          cantidad_entregada: string;
          hora_entrega: string;
        };
        Insert: {
          id?: string;
          centro_id: string;
          item_entregado: string;
          cantidad_entregada: string;
          hora_entrega?: string;
        };
        Update: {
          id?: string;
          centro_id?: string;
          item_entregado?: string;
          cantidad_entregada?: string;
          hora_entrega?: string;
        };
        Relationships: [
          {
            foreignKeyName: "historial_entregas_centro_id_fkey";
            columns: ["centro_id"];
            referencedRelation: "centros_acopio";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      votar_necesidad_toggle: {
        Args: { p_necesidad_id: string; p_fingerprint: string; p_tipo_voto: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
