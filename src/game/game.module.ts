import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RedisModule } from 'src/redis/redis.module';
@Module({
  imports: [RedisModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GameModule {}
