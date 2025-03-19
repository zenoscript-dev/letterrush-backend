import { Module } from '@nestjs/common';
import { GameService } from 'src/guestGame/service/game.service';
import { RedisModule } from 'src/redis/redis.module';
import { RoomController } from './room.controller';

@Module({
  imports: [
    RedisModule,
  ],
  controllers: [RoomController],
  providers: [GameService],
  exports: [GameService]
})
export class RoomsModule {}
