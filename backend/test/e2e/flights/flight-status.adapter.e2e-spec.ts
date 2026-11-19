import { FLIGHT_STATUS_PORT, type FlightStatusPort } from '../../../src/flights';
import { PrismaUnitOfWork } from '../../../src/shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { createTestApp, type TestApp } from '../support/test-app';

describe('PrismaFlightStatusAdapter.markSoldOutIfFull (integración)', () => {
  let ctx: TestApp;
  let port: FlightStatusPort;
  let uow: PrismaUnitOfWork;

  beforeAll(async () => {
    ctx = await createTestApp();
    port = ctx.app.get<FlightStatusPort>(FLIGHT_STATUS_PORT);
    uow = ctx.app.get(PrismaUnitOfWork);
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  const bookAll = (flightId: string, except?: { row: number; letter: string }) =>
    ctx.prisma.seat.updateMany({
      where: { flightId, ...(except ? { NOT: { row: except.row, letter: except.letter } } : {}) },
      data: { status: 'BOOKED' },
    });

  const statusOf = async (flightId: string) =>
    (await ctx.prisma.flight.findUniqueOrThrow({ where: { id: flightId } })).status;

  it('marca SOLD_OUT cuando todos los asientos están reservados', async () => {
    const flightId = await ctx.createFlight();
    await bookAll(flightId);
    await expect(uow.run(() => port.markSoldOutIfFull(flightId))).resolves.toBe(true);
    expect(await statusOf(flightId)).toBe('SOLD_OUT');
  });

  it('no cambia el vuelo si queda un asiento libre', async () => {
    const flightId = await ctx.createFlight();
    await bookAll(flightId, { row: 30, letter: 'F' });
    await expect(uow.run(() => port.markSoldOutIfFull(flightId))).resolves.toBe(false);
    expect(await statusOf(flightId)).toBe('SCHEDULED');
  });

  it('no cambia un vuelo cancelado', async () => {
    const flightId = await ctx.createFlight({ status: 'CANCELLED' });
    await bookAll(flightId);
    await expect(uow.run(() => port.markSoldOutIfFull(flightId))).resolves.toBe(false);
    expect(await statusOf(flightId)).toBe('CANCELLED');
  });

  it('exige una unidad de trabajo activa (escritura fuera de transacción = bug)', async () => {
    const flightId = await ctx.createFlight();
    await expect(port.markSoldOutIfFull(flightId)).rejects.toThrow(/UnitOfWork/);
  });
});
