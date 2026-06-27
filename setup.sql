-- =========================================================================
-- SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS: SUMINISTROS SOS 🇻🇪
-- Copia y ejecuta este script en el editor SQL de la consola de Supabase.
-- =========================================================================

-- 1. EXTENSIONES
-- UUID Generator y soporte para coordenadas espaciales si fuese necesario.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ELIMINACIÓN DE TABLAS EXISTENTES (Si aplica, por seguridad)
DROP TABLE IF EXISTS historial_entregas CASCADE;
DROP TABLE IF EXISTS necesidades CASCADE;
DROP TABLE IF EXISTS centros_acopio CASCADE;

-- 3. CREACIÓN DE TABLAS

-- TABLA: centros_acopio
CREATE TABLE centros_acopio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    estado TEXT NOT NULL,
    municipio TEXT NOT NULL,
    direccion TEXT NOT NULL,
    coordenadas POINT NULL, -- point almacena (longitud, latitud)
    estatus_general TEXT NOT NULL CHECK (estatus_general IN ('critico', 'parcial', 'surtido')),
    verificado BOOLEAN NOT NULL DEFAULT false,
    creado_por UUID NULL,
    ultima_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLA: necesidades
CREATE TABLE necesidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centro_id UUID NOT NULL REFERENCES centros_acopio(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL CHECK (categoria IN (
        'agua_hidratacion', 
        'alimentos_no_perecederos', 
        'medicinas_primeros_auxilios', 
        'ropa_mantas', 
        'higiene_personal',
        'energia_electricidad'
    )),
    descripcion TEXT NOT NULL,
    cantidad_requerida TEXT NOT NULL,
    estatus TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'surtido')),
    urgencia TEXT NOT NULL DEFAULT 'critico' CHECK (urgencia IN ('critico', 'parcial', 'recibiendo')), -- Añadido para estatus individual
    votos_no_vigente INTEGER NOT NULL DEFAULT 0,
    votos_vigente INTEGER NOT NULL DEFAULT 0, -- Adicionado para soportar botón "Sigue vigente"
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLA: historial_entregas
CREATE TABLE historial_entregas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centro_id UUID NOT NULL REFERENCES centros_acopio(id) ON DELETE CASCADE,
    item_entregado TEXT NOT NULL,
    cantidad_entregada TEXT NOT NULL,
    hora_entrega TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ÍNDICES PARA OPTIMIZACIÓN EN REDES LENTAS (3G)
-- Permite búsquedas instantáneas y filtrado eficiente por región y urgencia en la app móvil.
CREATE INDEX idx_centros_acopio_estado ON centros_acopio(estado);
CREATE INDEX idx_centros_acopio_municipio ON centros_acopio(municipio);
CREATE INDEX idx_centros_acopio_estatus_general ON centros_acopio(estatus_general);
CREATE INDEX idx_necesidades_centro_id ON necesidades(centro_id);

-- 5. HABILITAR SEGURIDAD A NIVEL DE FILAS (RLS)
ALTER TABLE centros_acopio ENABLE ROW LEVEL SECURITY;
ALTER TABLE necesidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_entregas ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS DE SEGURIDAD (RLS)

-- Políticas para centros_acopio
CREATE POLICY "Permitir lectura pública de centros" ON centros_acopio
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de centros" ON centros_acopio
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualización pública de centros" ON centros_acopio
    FOR UPDATE USING (true);

-- Políticas para necesidades
CREATE POLICY "Permitir lectura pública de necesidades" ON necesidades
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de necesidades" ON necesidades
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualización pública de necesidades" ON necesidades
    FOR UPDATE USING (true);

-- Políticas para historial_entregas
CREATE POLICY "Permitir lectura pública de historial" ON historial_entregas
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de historial" ON historial_entregas
    FOR INSERT WITH CHECK (true);

-- 7. FUNCIONES ALMACENADAS RPC PARA CONTROL DE SPAM Y VOTACIONES
-- Estas funciones permiten votos rápidos y ligeros desde dispositivos móviles sin
-- necesidad de dar permisos de edición masiva a nivel de columna a clientes anónimos.

-- Incrementar votos de vigencia (Sigue vigente)
CREATE OR REPLACE FUNCTION votar_necesidad_vigente(necesidad_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE necesidades
    SET votos_vigente = votos_vigente + 1
    WHERE id = necesidad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Incrementar votos de no vigencia (Reporte falso o ya no se necesita)
CREATE OR REPLACE FUNCTION votar_necesidad_no_vigente(necesidad_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE necesidades
    SET votos_no_vigente = votos_no_vigente + 1
    WHERE id = necesidad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para actualizar automáticamente la columna 'ultima_actualizacion' en centros_acopio
CREATE OR REPLACE FUNCTION actualizar_marca_tiempo_centro()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ultima_actualizacion = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_centro_tiempo
    BEFORE UPDATE ON centros_acopio
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_marca_tiempo_centro();
