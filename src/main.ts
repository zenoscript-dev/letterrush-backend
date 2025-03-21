import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // process.on('SIGINT', async () => {
  //   console.log('Received SIGINT (Ctrl+C). Cleaning up...');
  //   await app.close(); // Graceful shutdown
  //   process.exit(0); // Exit safely
  // });

  await app.listen(3100);
}
bootstrap();
