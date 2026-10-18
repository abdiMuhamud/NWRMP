import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './create-app';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

// Reused across invocations while the function instance stays warm.
let handler: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  handler ??= init().catch((err: unknown) => {
    handler = undefined; // retry on the next request
    throw err;
  });
  (await handler)(req, res);
}
