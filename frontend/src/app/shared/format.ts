import {
  BOGOTA_TIME_ZONE,
  type FlightStatus,
  type ReleaseReason,
  type SeatType,
} from '@kata/shared';

/** Formatos y textos para la persona usuaria (español, hora de Bogotá). Una sola definición. */
const TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const TIME_WITH_SECONDS = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const MONEY = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const formatTime = (iso: string): string => TIME.format(new Date(iso));
export const formatDate = (iso: string): string => DATE.format(new Date(iso));
export const formatClock = (iso: string): string => TIME_WITH_SECONDS.format(new Date(iso));
export const formatMoney = (amount: number): string => MONEY.format(amount);

const PERCENT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
/** `1,1 %` (separador decimal y espacio del español). */
export const formatPercent = (value: number): string => `${PERCENT.format(value)} %`;

/** Duración compacta: `55m`, `1h 40m`, `2h`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Duración para lectores de pantalla: "1 hora y 40 minutos". */
export function spokenDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [
    hours > 0 ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : '',
    rest > 0 ? `${rest} ${rest === 1 ? 'minuto' : 'minutos'}` : '',
  ].filter(Boolean);
  return parts.join(' y ');
}

/** `mm:ss` a partir de milisegundos restantes (nunca negativo). */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = {
  SCHEDULED: 'Programado',
  DELAYED: 'Retrasado',
  CANCELLED: 'Cancelado',
  SOLD_OUT: 'Agotado',
};

export const SEAT_TYPE_LABEL: Record<SeatType, string> = {
  WINDOW: 'ventana',
  MIDDLE: 'medio',
  AISLE: 'pasillo',
};

export const RELEASE_REASON_LABEL: Record<ReleaseReason, string> = {
  MANUAL: 'liberación',
  EXPIRED: 'vencimiento',
  FLIGHT_CANCELLED: 'liberación por cancelación',
};

export const AIRPORT_LABEL = {
  BOG: 'Bogotá (BOG)',
  MDE: 'Medellín (MDE)',
  CLO: 'Cali (CLO)',
  CTG: 'Cartagena (CTG)',
  BAQ: 'Barranquilla (BAQ)',
} as const;
