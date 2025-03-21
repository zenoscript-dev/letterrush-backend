import { Module } from '@nestjs/common';
import { GameGateway } from './guestGame.gateway';
import { GameService } from './service/game.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [GameGateway, GameService],
  exports: [GameService, GameGateway],
})
export class GuestGameModule {}
