import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import {
  FlightParamsSchema,
  UpdateFlightStatusRequestSchema,
  type FlightDto,
  type UpdateFlightStatusRequest,
} from '@kata/shared';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { toFlightDto } from '../../flights';
import { AdminThrottle } from '../../shared-kernel/infrastructure/http/rate-limits';
import { ChangeFlightStatusUseCase } from '../application/change-flight-status.use-case';
import { AdminKeyGuard } from './admin-key.guard';

class FlightParamsDto extends createZodDto(FlightParamsSchema) {}

/**
 * Acciones de administración (HU4) sin lógica de negocio: clave en tiempo constante
 * (`AdminKeyGuard`), límite por IP y body validado con el esquema de shared.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(private readonly changeFlightStatus: ChangeFlightStatusUseCase) {}

  @Patch('flights/:flightId/status')
  @AdminThrottle()
  async updateStatus(
    @Param() params: FlightParamsDto,
    // Unión discriminada: se valida con un pipe propio (un DTO de clase no puede extender una unión).
    @Body(new ZodValidationPipe(UpdateFlightStatusRequestSchema)) body: UpdateFlightStatusRequest,
  ): Promise<FlightDto> {
    const flight = await this.changeFlightStatus.execute({
      flightId: params.flightId,
      request: body,
    });
    return toFlightDto(flight);
  }
}
