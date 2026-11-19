import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/** Tamaño máximo de un mensaje del cliente: los payloads válidos son de pocos bytes. */
export const SOCKET_MAX_PAYLOAD_BYTES = 16 * 1024;

/**
 * Adaptador Socket.io con la configuración de la app (principio X): CORS con los mismos orígenes
 * que HTTP y un límite de tamaño por mensaje, equivalente al límite del body.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins },
      maxHttpBufferSize: SOCKET_MAX_PAYLOAD_BYTES,
    }) as Server;
  }
}
