import { Controller, Get, Logger } from '@nestjs/common';
import { GameService } from 'src/guestGame/service/game.service';

@Controller('rooms')
export class RoomController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  async getAllRooms() {
    try {
      const rooms = await this.gameService.getRoomList();
      return {
        success: true,
        data: rooms,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
