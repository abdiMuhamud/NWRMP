import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Shared app setup for the local server (main.ts) and the Vercel function (vercel.ts). */
export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });

  return app;
}
