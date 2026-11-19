import type { Socket } from 'socket.io';
import {
  clientIdHandshake,
  parseRoomPayload,
} from '../../../src/realtime/infrastructure/socket-handshake';

function fakeSocket(auth: unknown): Socket {
  return { handshake: { auth }, data: {} } as unknown as Socket;
}

describe('handshake del socket', () => {
  it('acepta un clientId v4 y lo guarda en socket.data', () => {
    const socket = fakeSocket({ clientId: '3F2B8C1E-7A4D-4E9B-9C1A-2D5E6F708192' });
    const next = jest.fn();
    clientIdHandshake(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as { clientId: string }).clientId).toBe(
      '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192',
    );
  });

  it.each([
    [{}],
    [{ clientId: 'falso' }],
    [{ clientId: 'a43ba235-6321-5a88-b282-0af2d4095301' }],
    [null],
  ])('rechaza %j con CLIENT_ID_REQUIRED', (auth) => {
    const next = jest.fn();
    clientIdHandshake(fakeSocket(auth), next);
    expect(next).toHaveBeenCalledWith(new Error('CLIENT_ID_REQUIRED'));
  });
});

describe('parseRoomPayload', () => {
  it('acepta un flightId válido', () => {
    expect(parseRoomPayload({ flightId: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10' })).toEqual({
      ok: true,
      flightId: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
    });
  });

  it.each([[{ flightId: 'x' }], [{}], ['texto'], [null]])(
    'rechaza %j con VALIDATION_ERROR',
    (payload) => {
      expect(parseRoomPayload(payload)).toEqual({ ok: false, code: 'VALIDATION_ERROR' });
    },
  );
});
