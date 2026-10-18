import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`NWRMP API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
