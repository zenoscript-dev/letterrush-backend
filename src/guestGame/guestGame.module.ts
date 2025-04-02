import { Module } from '@nestjs/common';
import { GameGateway } from './guestGame.gateway';
import { GameService } from './service/game.service';
import { ScheduleModule } from '@nestjs/schedule';
import { WordService } from './service/word.service';
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [GameGateway, GameService, WordService],
  exports: [GameService, GameGateway, WordService],
})
export class GuestGameModule {}
