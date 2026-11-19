import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  FlightParamsSchema,
  FlightSeatParamsSchema,
  type HoldSeatResponse,
  type MyHoldsResponse,
  type SeatMapSnapshot,
} from '@kata/shared';
import { createZodDto } from 'nestjs-zod';
import { ClientId } from '../../../shared-kernel/infrastructure/http/client-id.decorator';
import { HoldsThrottle } from '../../../shared-kernel/infrastructure/http/rate-limits';
import { GetMyHoldsUseCase } from '../../application/get-my-holds.use-case';
import { GetSeatMapUseCase } from '../../application/get-seat-map.use-case';
import { HoldSeatUseCase } from '../../application/hold-seat.use-case';
import { ReleaseSeatUseCase } from '../../application/release-seat.use-case';
import {
  toHoldSeatResponse,
  toMyHoldsResponse,
  toSeatMapSnapshot,
} from '../../application/seat-dto.mapper';

class FlightParamsDto extends createZodDto(FlightParamsSchema) {}
class FlightSeatParamsDto extends createZodDto(FlightSeatParamsSchema) {}

/** Traduce HTTP ↔ casos de uso; sin lógica de negocio (S de SOLID). */
@Controller()
export class SeatsController {
  constructor(
    private readonly holdSeat: HoldSeatUseCase,
    private readonly releaseSeat: ReleaseSeatUseCase,
    private readonly getSeatMap: GetSeatMapUseCase,
    private readonly getMyHolds: GetMyHoldsUseCase,
  ) {}

  @Post('flights/:flightId/seats/:seatId/hold')
  @HoldsThrottle()
  async hold(
    @Param() params: FlightSeatParamsDto,
    @ClientId() clientId: string,
  ): Promise<HoldSeatResponse> {
    const result = await this.holdSeat.execute({
      flightId: params.flightId,
      seatCode: params.seatId,
      clientId,
    });
    return toHoldSeatResponse(result);
  }

  @Delete('flights/:flightId/seats/:seatId/hold')
  @HttpCode(204)
  @HoldsThrottle()
  async release(@Param() params: FlightSeatParamsDto, @ClientId() clientId: string): Promise<void> {
    await this.releaseSeat.execute({
      flightId: params.flightId,
      seatCode: params.seatId,
      clientId,
    });
  }

  @Get('flights/:flightId/seats')
  async seatMap(@Param() params: FlightParamsDto): Promise<SeatMapSnapshot> {
    return toSeatMapSnapshot(await this.getSeatMap.execute(params.flightId));
  }

  @Get('clients/me/holds')
  async myHolds(@ClientId() clientId: string): Promise<MyHoldsResponse> {
    return toMyHoldsResponse(await this.getMyHolds.execute(clientId));
  }
}
