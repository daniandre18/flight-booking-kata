import type { IncomingMessage } from 'node:http';
import pino from 'pino';
import { Writable } from 'node:stream';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';
import { type AppConfig } from '../../../src/shared-kernel/infrastructure/config';
import {
  buildPinoHttpOptions,
  holderTagFromRequest,
} from '../../../src/shared-kernel/infrastructure/logger.module';

const CLIENT_ID = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const config = { logLevel: 'info', logPretty: false } as AppConfig;

function captureLog(entry: Record<string, unknown>): string {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const options = buildPinoHttpOptions(config);
  const logger = pino({ redact: options.redact as pino.redactOptions }, sink);
  logger.info(entry, 'solicitud');
  return output;
}

describe('opciones del logger (principio X)', () => {
  it('redacta X-Client-Id, X-Admin-Key, authorization y los datos de tarjeta', () => {
    const output = captureLog({
      req: {
        headers: {
          'x-client-id': CLIENT_ID,
          'x-admin-key': 'demo-admin-key',
          authorization: 'Bearer t',
        },
      },
      body: { card: { number: '4111111111111111', cvv: '123' } },
    });
    expect(output).not.toContain(CLIENT_ID);
    expect(output).not.toContain('demo-admin-key');
    expect(output).not.toContain('Bearer t');
    expect(output).not.toContain('4111111111111111');
    expect(output).not.toContain('"123"');
    expect(output).toContain('[redactado]');
  });

  it('usa el holderTag como contexto, nunca el clientId', () => {
    const request = { headers: { 'x-client-id': CLIENT_ID } } as unknown as IncomingMessage;
    expect(holderTagFromRequest(request)).toBe(holderTagOf(CLIENT_ID));
    const options = buildPinoHttpOptions(config);
    const customProps = options.customProps as (req: IncomingMessage) => Record<string, unknown>;
    expect(customProps(request)).toEqual({ holderTag: holderTagOf(CLIENT_ID) });
    expect(JSON.stringify(customProps(request))).not.toContain(CLIENT_ID);
  });

  it('no inventa contexto si el header no es un UUID v4', () => {
    const request = { headers: { 'x-client-id': 'falso' } } as unknown as IncomingMessage;
    expect(holderTagFromRequest(request)).toBeNull();
  });
});
