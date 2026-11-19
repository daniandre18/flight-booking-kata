import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import { PrismaService } from '../../shared-kernel/infrastructure/persistence/prisma.service';

export interface HealthResponse {
  status: 'ok';
  db: 'up';
}

/** `GET /health`, fuera del prefijo `/api` (constitución, principio VIII). */
@SkipThrottle({ ip: true, client: true })
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DomainError('SERVICE_UNAVAILABLE', 'La base de datos no responde');
    }
    return { status: 'ok', db: 'up' };
  }
}
