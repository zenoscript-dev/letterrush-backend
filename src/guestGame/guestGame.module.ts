import { Module } from '@nestjs/common';
import { GameGateway } from './guestGame.gateway';
import { GameService } from './service/game.service';

@Module({
  providers: [GameGateway, GameService],
})
export class GuestGameModule {}
