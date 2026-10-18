import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/** Shared app setup for the local server (main.ts) and the Vercel function (vercel.ts). */
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Behind the Vite proxy or Vercel: take the client address from X-Forwarded-For.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Responses depend on who is signed in; never let a proxy or browser cache them.
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });

  return app;
}
