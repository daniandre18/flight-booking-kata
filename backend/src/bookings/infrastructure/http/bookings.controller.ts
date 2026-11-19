import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  BookingLookupRequestSchema,
  CreateBookingRequestSchema,
  type BookingDto,
} from '@kata/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { ClientId } from '../../../shared-kernel/infrastructure/http/client-id.decorator';
import {
  BookingThrottle,
  LookupThrottle,
} from '../../../shared-kernel/infrastructure/http/rate-limits';
import { toBookingDto } from '../../application/booking-dto.mapper';
import { ConfirmBookingUseCase } from '../../application/confirm-booking.use-case';
import { LookupBookingUseCase } from '../../application/lookup-booking.use-case';
import { IdempotencyKey } from './idempotency-key.decorator';

class CreateBookingDto extends createZodDto(CreateBookingRequestSchema) {}
class BookingLookupDto extends createZodDto(BookingLookupRequestSchema) {}

export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

/** Traduce HTTP ↔ casos de uso; sin lógica de negocio (S de SOLID). contracts/openapi.yaml. */
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly lookupBooking: LookupBookingUseCase,
  ) {}

  /** 201 con la reserva nueva; 200 + `Idempotent-Replayed: true` si la clave ya la confirmó. */
  @Post()
  @BookingThrottle()
  async create(
    @Body() body: CreateBookingDto,
    @ClientId() clientId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingDto> {
    const result = await this.confirmBooking.execute({ clientId, idempotencyKey, request: body });
    if (result.replayed) {
      response.status(HttpStatus.OK).setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    }
    return toBookingDto(result.view);
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @LookupThrottle()
  async lookup(@Body() body: BookingLookupDto): Promise<BookingDto> {
    return toBookingDto(await this.lookupBooking.execute(body));
  }
}
