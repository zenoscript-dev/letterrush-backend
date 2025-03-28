import { Controller, Get } from '@nestjs/common';
import { GameService } from 'src/guestGame/service/game.service';
import { Room } from 'src/types';

@Controller('rooms')
export class RoomController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  async getAllRooms(): Promise<{
    success: boolean;
    data: Room[];
    error?: string;
  }> {
    try {
      const rooms = await this.gameService.getRoomList();
      return {
        success: true,
        data: rooms,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }
}
