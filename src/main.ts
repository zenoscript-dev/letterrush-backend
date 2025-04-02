import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { ClusterService } from './cluster.service';

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
  app.setGlobalPrefix('api/v1');
  const helmet = require('helmet');
  app.use(helmet());

  await app.listen(3700);
}
ClusterService.clusterize(bootstrap);
