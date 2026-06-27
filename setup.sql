-- =========================================================================
-- SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS (v3 PRODUCCIÓN): SUMINISTROS SOS 🇻🇪
-- Copia y ejecuta este script en el editor SQL de la consola de Supabase.
-- =========================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. ELIMINACIÓN DE TABLAS EXISTENTES (Por seguridad al re-inicializar)
DROP TRIGGER IF EXISTS trigger_alerta_critica ON necesidades CASCADE;
DROP FUNCTION IF EXISTS alerta_necesidad_critica() CASCADE;
DROP TRIGGER IF EXISTS trigger_actualizar_centro_tiempo ON centros_acopio CASCADE;
DROP FUNCTION IF EXISTS actualizar_marca_tiempo_centro() CASCADE;
DROP FUNCTION IF EXISTS votar_necesidad_vigente(UUID) CASCADE;
DROP FUNCTION IF EXISTS votar_necesidad_no_vigente(UUID) CASCADE;
DROP FUNCTION IF EXISTS votar_necesidad_vigente(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS votar_necesidad_no_vigente(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_categoria_label_sql(TEXT) CASCADE;
DROP TABLE IF EXISTS votos_registro CASCADE;
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
    coordenadas POINT NULL,
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
    urgencia TEXT NOT NULL DEFAULT 'critico' CHECK (urgencia IN ('critico', 'parcial', 'recibiendo')),
    votos_no_vigente INTEGER NOT NULL DEFAULT 0,
    votos_vigente INTEGER NOT NULL DEFAULT 0,
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

-- TABLA: votos_registro (Rate-Limiting de votaciones)
-- Previene que un mismo dispositivo vote múltiples veces la misma necesidad
CREATE TABLE votos_registro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    necesidad_id UUID NOT NULL REFERENCES necesidades(id) ON DELETE CASCADE,
    voter_fingerprint TEXT NOT NULL,
    tipo_voto TEXT NOT NULL CHECK (tipo_voto IN ('vigente', 'no_vigente')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_voto_por_dispositivo UNIQUE (necesidad_id, voter_fingerprint)
);

-- 4. ÍNDICES PARA OPTIMIZACIÓN EN REDES LENTAS (3G)
CREATE INDEX idx_centros_acopio_estado ON centros_acopio(estado);
CREATE INDEX idx_centros_acopio_municipio ON centros_acopio(municipio);
CREATE INDEX idx_centros_acopio_estatus_general ON centros_acopio(estatus_general);
CREATE INDEX idx_necesidades_centro_id ON necesidades(centro_id);
CREATE INDEX idx_votos_registro_necesidad ON votos_registro(necesidad_id);
CREATE INDEX idx_votos_registro_fingerprint ON votos_registro(voter_fingerprint);

-- 5. HABILITAR SEGURIDAD A NIVEL DE FILAS (RLS)
ALTER TABLE centros_acopio ENABLE ROW LEVEL SECURITY;
ALTER TABLE necesidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE votos_registro ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS DE SEGURIDAD (RLS) CON VALIDACIÓN JWT DE ROLES

-- POLÍTICAS: centros_acopio
CREATE POLICY "Permitir lectura pública de centros" ON centros_acopio
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción de centros (verificación restringida)" ON centros_acopio
    FOR INSERT WITH CHECK (
        (verificado = false) OR 
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'administrador_verificado')
    );

CREATE POLICY "Permitir actualización de centros (verificación restringida)" ON centros_acopio
    FOR UPDATE USING (true)
    WITH CHECK (
        (verificado = false) OR
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'administrador_verificado')
    );

-- POLÍTICAS: necesidades
CREATE POLICY "Permitir lectura pública de necesidades" ON necesidades
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de necesidades" ON necesidades
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualización pública de necesidades" ON necesidades
    FOR UPDATE USING (true);

-- POLÍTICAS: historial_entregas
CREATE POLICY "Permitir lectura pública de historial" ON historial_entregas
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de historial" ON historial_entregas
    FOR INSERT WITH CHECK (true);

-- POLÍTICAS: votos_registro
CREATE POLICY "Permitir lectura pública de votos" ON votos_registro
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública de votos" ON votos_registro
    FOR INSERT WITH CHECK (true);


-- 7. FUNCIONES ALMACENADAS RPC PARA VOTACIONES CON RATE-LIMITING
-- Ahora reciben un fingerprint y solo incrementan si el voto es nuevo

CREATE OR REPLACE FUNCTION votar_necesidad_vigente(p_necesidad_id UUID, p_fingerprint TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Intentar registrar el voto. Si ya existe (UNIQUE violation), no hacer nada.
    INSERT INTO votos_registro (necesidad_id, voter_fingerprint, tipo_voto)
    VALUES (p_necesidad_id, p_fingerprint, 'vigente')
    ON CONFLICT (necesidad_id, voter_fingerprint) DO NOTHING;
    
    -- Si se insertó (voto nuevo), incrementar el conteo
    IF FOUND THEN
        UPDATE necesidades
        SET votos_vigente = votos_vigente + 1
        WHERE id = p_necesidad_id;
        RETURN true;
    END IF;
    
    RETURN false; -- Voto duplicado, no se contabilizó
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION votar_necesidad_no_vigente(p_necesidad_id UUID, p_fingerprint TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO votos_registro (necesidad_id, voter_fingerprint, tipo_voto)
    VALUES (p_necesidad_id, p_fingerprint, 'no_vigente')
    ON CONFLICT (necesidad_id, voter_fingerprint) DO NOTHING;
    
    IF FOUND THEN
        UPDATE necesidades
        SET votos_no_vigente = votos_no_vigente + 1
        WHERE id = p_necesidad_id;
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. TRIGGERS

-- Trigger A: Actualizar marca de tiempo
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

-- Trigger B: Alerta automática por webhook de necesidades críticas a Telegram
CREATE OR REPLACE FUNCTION alerta_necesidad_critica()
RETURNS TRIGGER AS $$
DECLARE
    telegram_bot_token TEXT := 'TU_BOT_TOKEN_AQUI';
    telegram_chat_id TEXT := 'TU_CHAT_ID_AQUI';
    mensaje TEXT;
    centro_nombre TEXT;
BEGIN
    IF NEW.urgencia = 'critico' AND NEW.estatus = 'pendiente' THEN
        SELECT nombre INTO centro_nombre FROM centros_acopio WHERE id = NEW.centro_id;
        
        mensaje := '🚨 *SUMINISTROS SOS: ALERTA CRÍTICA* 🚨' || chr(10) || chr(10) ||
                   '*Lugar:* ' || centro_nombre || chr(10) ||
                   '*Suministro:* ' || get_categoria_label_sql(NEW.categoria) || ' - ' || NEW.descripcion || chr(10) ||
                   '*Cantidad Necesitada:* ' || NEW.cantidad_requerida || chr(10) ||
                   '🇻🇪 Coordinación de Emergencias en Tiempo Real.';

        IF telegram_bot_token <> 'TU_BOT_TOKEN_AQUI' AND telegram_chat_id <> 'TU_CHAT_ID_AQUI' THEN
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || telegram_bot_token || '/sendMessage',
                headers := '{"Content-Type": "application/json"}'::jsonb,
                body := json_build_object(
                    'chat_id', telegram_chat_id,
                    'text', mensaje,
                    'parse_mode', 'Markdown'
                )::jsonb
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_categoria_label_sql(cat TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE 
        WHEN cat = 'agua_hidratacion' THEN 'Agua/Hidratación'
        WHEN cat = 'alimentos_no_perecederos' THEN 'Alimentos no perecederos'
        WHEN cat = 'medicinas_primeros_auxilios' THEN 'Medicinas/Primeros Auxilios'
        WHEN cat = 'ropa_mantas' THEN 'Ropa/Mantas'
        WHEN cat = 'higiene_personal' THEN 'Higiene Personal'
        WHEN cat = 'energia_electricidad' THEN 'Energía/Electricidad'
        ELSE 'Suministro General'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TRIGGER trigger_alerta_critica
    AFTER INSERT ON necesidades
    FOR EACH ROW
    EXECUTE FUNCTION alerta_necesidad_critica();
