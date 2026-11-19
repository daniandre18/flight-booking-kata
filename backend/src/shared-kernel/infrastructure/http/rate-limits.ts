import { type ExecutionContext, Injectable } from '@nestjs/common';
import {
  Throttle,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import { ClientIdSchema } from '@kata/shared';
import type { Request } from 'express';

/**
 * Límites de solicitudes (research.md §25, principio X). Dos contadores: `ip` (siempre) y
 * `client` (`X-Client-Id` válido). En la consulta del boleto y en admin solo cuenta la IP:
 * el `X-Client-Id` lo elige quien llama y rotarlo evadiría el límite.
 */
export const THROTTLER_IP = 'ip';
export const THROTTLER_CLIENT = 'client';

interface Window {
  limit: number;
  ttlMs: number;
}

interface RatePolicy {
  ip: Window;
  client?: Window;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const RATE_LIMITS = {
  holds: { client: { limit: 20, ttlMs: 10 * SECOND }, ip: { limit: 200, ttlMs: 10 * SECOND } },
  booking: { client: { limit: 5, ttlMs: MINUTE }, ip: { limit: 30, ttlMs: MINUTE } },
  lookup: { ip: { limit: 10, ttlMs: MINUTE } },
  admin: { ip: { limit: 20, ttlMs: MINUTE } },
  default: { ip: { limit: 300, ttlMs: MINUTE } },
} satisfies Record<string, RatePolicy>;

/** Se lee en cada solicitud para que las pruebas puedan ajustar los límites. */
export function rateLimitMultiplier(): number {
  const value = Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

const scaled = (limit: number) => (): number => Math.ceil(limit * rateLimitMultiplier());

function trackByIp(req: Record<string, unknown>): Promise<string> {
  return Promise.resolve(`ip:${String((req as unknown as Request).ip)}`);
}

function trackByClient(req: Record<string, unknown>): Promise<string> {
  const parsed = ClientIdSchema.safeParse((req as unknown as Request).headers['x-client-id']);
  return parsed.success ? Promise.resolve(`client:${parsed.data}`) : trackByIp(req);
}

function toThrottleOptions(
  policy: RatePolicy,
): Record<string, { limit: () => number; ttl: number }> {
  const options: Record<string, { limit: () => number; ttl: number }> = {
    [THROTTLER_IP]: { limit: scaled(policy.ip.limit), ttl: policy.ip.ttlMs },
  };
  if (policy.client) {
    options[THROTTLER_CLIENT] = { limit: scaled(policy.client.limit), ttl: policy.client.ttlMs };
  }
  return options;
}

export const HoldsThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle(toThrottleOptions(RATE_LIMITS.holds));
export const BookingThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle(toThrottleOptions(RATE_LIMITS.booking));
export const LookupThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle(toThrottleOptions(RATE_LIMITS.lookup));
export const AdminThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle(toThrottleOptions(RATE_LIMITS.admin));

/** El contador `client` solo limita donde una ruta lo define; por defecto no restringe. */
export function buildThrottlerOptions(): ThrottlerModuleOptions {
  const ipDefault: ThrottlerOptions = {
    name: THROTTLER_IP,
    limit: scaled(RATE_LIMITS.default.ip.limit),
    ttl: RATE_LIMITS.default.ip.ttlMs,
    getTracker: trackByIp,
  };
  const clientDefault: ThrottlerOptions = {
    name: THROTTLER_CLIENT,
    limit: Number.MAX_SAFE_INTEGER,
    ttl: MINUTE,
    getTracker: trackByClient,
  };
  return { throttlers: [ipDefault, clientDefault] };
}

/** Solo HTTP: el gateway de tiempo real no pasa por el throttler. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override canActivate(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'http' ? super.canActivate(context) : Promise.resolve(true);
  }
}
