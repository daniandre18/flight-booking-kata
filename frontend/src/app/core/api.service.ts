import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ActivityEntryDto,
  BookingDto,
  BookingLookupRequest,
  CreateBookingRequest,
  FlightDto,
  FlightStatsDto,
  HoldSeatResponse,
  MyHoldsResponse,
  SearchFlightsQuery,
  SeatMapSnapshot,
  UpdateFlightStatusRequest,
} from '@kata/shared';
import { firstValueFrom } from 'rxjs';
import { SILENT_ERRORS } from './error.interceptor';

export interface RequestOptions {
  /** El error se muestra en la pantalla, no en un toast. */
  silent?: boolean;
}

const contextFor = (options: RequestOptions = {}): HttpContext =>
  new HttpContext().set(SILENT_ERRORS, options.silent ?? false);

/** Cliente REST tipado con los contratos de `@kata/shared` (contracts/openapi.yaml). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  searchFlights(query: SearchFlightsQuery): Promise<FlightDto[]> {
    return firstValueFrom(this.http.get<FlightDto[]>('/api/flights', { params: { ...query } }));
  }

  getFlight(flightId: string, options?: RequestOptions): Promise<FlightDto> {
    return firstValueFrom(
      this.http.get<FlightDto>(`/api/flights/${flightId}`, { context: contextFor(options) }),
    );
  }

  getSeatMap(flightId: string): Promise<SeatMapSnapshot> {
    return firstValueFrom(this.http.get<SeatMapSnapshot>(`/api/flights/${flightId}/seats`));
  }

  getFlightStats(flightId: string): Promise<FlightStatsDto> {
    return firstValueFrom(this.http.get<FlightStatsDto>(`/api/flights/${flightId}/stats`));
  }

  getFlightEvents(flightId: string, limit = 50): Promise<ActivityEntryDto[]> {
    return firstValueFrom(
      this.http.get<ActivityEntryDto[]>(`/api/flights/${flightId}/events`, {
        params: { limit },
      }),
    );
  }

  holdSeat(flightId: string, seatId: string): Promise<HoldSeatResponse> {
    return firstValueFrom(
      this.http.post<HoldSeatResponse>(`/api/flights/${flightId}/seats/${seatId}/hold`, null),
    );
  }

  releaseSeat(flightId: string, seatId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/flights/${flightId}/seats/${seatId}/hold`));
  }

  getMyHolds(flightId?: string): Promise<MyHoldsResponse> {
    const params: Record<string, string> = flightId === undefined ? {} : { flightId };
    return firstValueFrom(this.http.get<MyHoldsResponse>('/api/clients/me/holds', { params }));
  }

  createBooking(request: CreateBookingRequest, idempotencyKey: string): Promise<BookingDto> {
    return firstValueFrom(
      this.http.post<BookingDto>('/api/bookings', request, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      }),
    );
  }

  lookupBooking(request: BookingLookupRequest, options?: RequestOptions): Promise<BookingDto> {
    return firstValueFrom(
      this.http.post<BookingDto>('/api/bookings/lookup', request, {
        context: contextFor(options),
      }),
    );
  }

  updateFlightStatus(
    flightId: string,
    request: UpdateFlightStatusRequest,
    adminKey: string,
  ): Promise<FlightDto> {
    return firstValueFrom(
      this.http.patch<FlightDto>(`/api/admin/flights/${flightId}/status`, request, {
        headers: new HttpHeaders({ 'X-Admin-Key': adminKey }),
        context: contextFor({ silent: true }),
      }),
    );
  }
}
