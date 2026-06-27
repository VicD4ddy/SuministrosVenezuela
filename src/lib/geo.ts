// Utilidades geográficas compartidas — Suministros SOS 🇻🇪

/**
 * Extrae latitud y longitud de un POINT de Postgres.
 * Supabase devuelve POINT como string "(lng,lat)" o como objeto {x, y}.
 */
export function obtenerLatLng(coordenadas: any): [number, number] | null {
  if (!coordenadas) return null;
  if (typeof coordenadas === 'object' && 'x' in coordenadas && 'y' in coordenadas) {
    return [coordenadas.y, coordenadas.x];
  }
  if (typeof coordenadas === 'string') {
    const match = coordenadas.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return [lat, lng];
      }
    }
  }
  return null;
}

/**
 * Calcula la distancia geodésica entre dos puntos usando la Fórmula de Haversine.
 * Retorna la distancia en kilómetros.
 */
export function calcularDistanciaKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Radio de la Tierra en Km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Genera un fingerprint simple del dispositivo para rate-limiting de votaciones.
 * No es criptográficamente seguro, pero suficiente para anti-spam básico.
 */
export function generarFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join('|');

  // Hash simple (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(i);
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

/**
 * Formatea una fecha ISO en texto relativo legible en español.
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();

    if (diffInMs < 0) return 'Hace un momento';

    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    if (diffInMins < 1) return 'Hace un momento';
    if (diffInMins < 60) return `Hace ${diffInMins} min`;

    const diffInHours = Math.floor(diffInMins / 60);
    if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `Hace ${diffInDays} ${diffInDays === 1 ? 'día' : 'días'}`;
  } catch {
    return 'Recientemente';
  }
}

// Coordenadas aproximadas de las capitales/centros de los estados de Venezuela
const CENTROS_ESTADOS_VENEZUELA = [
  { nombre: 'Amazonas', lat: 5.6639, lon: -67.6236 },
  { nombre: 'Anzoátegui', lat: 10.1347, lon: -64.6858 },
  { nombre: 'Apure', lat: 7.8939, lon: -67.4724 },
  { nombre: 'Aragua', lat: 10.2469, lon: -67.5958 },
  { nombre: 'Barinas', lat: 8.6226, lon: -70.2075 },
  { nombre: 'Bolívar', lat: 8.1160, lon: -63.5484 },
  { nombre: 'Carabobo', lat: 10.1620, lon: -68.0077 },
  { nombre: 'Cojedes', lat: 9.6612, lon: -68.5827 },
  { nombre: 'Delta Amacuro', lat: 9.0603, lon: -62.0510 },
  { nombre: 'Distrito Capital', lat: 10.4806, lon: -66.9036 },
  { nombre: 'Falcón', lat: 11.4045, lon: -69.6734 },
  { nombre: 'Guárico', lat: 9.9115, lon: -67.3537 },
  { nombre: 'Lara', lat: 10.0678, lon: -69.3474 },
  { nombre: 'Mérida', lat: 8.5878, lon: -71.1434 },
  { nombre: 'Miranda', lat: 10.3444, lon: -67.0433 },
  { nombre: 'Monagas', lat: 9.7420, lon: -63.1764 },
  { nombre: 'Nueva Esparta', lat: 11.0287, lon: -63.8628 },
  { nombre: 'Portuguesa', lat: 9.0418, lon: -69.7421 },
  { nombre: 'Sucre', lat: 10.4530, lon: -64.1826 },
  { nombre: 'Táchira', lat: 7.7669, lon: -72.2250 },
  { nombre: 'Trujillo', lat: 9.3701, lon: -70.4348 },
  { nombre: 'Yaracuy', lat: 10.3399, lon: -68.7417 },
  { font: 'Zulia', nombre: 'Zulia', lat: 10.6427, lon: -71.6125 },
  { nombre: 'Vargas', lat: 10.6012, lon: -66.9322 }
];

/**
 * Retorna el estado más cercano de Venezuela en base a latitud y longitud.
 */
export function obtenerEstadoPorCoordenadas(lat: number, lon: number): string {
  let estadoMasCercano = 'Distrito Capital';
  let distanciaMinima = Infinity;

  for (const estado of CENTROS_ESTADOS_VENEZUELA) {
    const dist = calcularDistanciaKm(lat, lon, estado.lat, estado.lon);
    if (dist < distanciaMinima) {
      distanciaMinima = dist;
      estadoMasCercano = estado.nombre;
    }
  }

  return estadoMasCercano;
}

