import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from 'src/redis/redis.service';
import {
  SocketEmitterEventsEnum,
  SocketListenerEventsEnum,
} from './enums/listenEvents.enums';

const playerPerRoom = 4;
@WebSocketGateway(4100, {
  cors: { origin: '*' },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly redisService: RedisService) {
    console.log('🚀 WebSocket Server Started on Port 4100');
  }

  @WebSocketServer() server: Server;

  async handleConnection(client: Socket) {
    try {
      const userId = client.handshake.query.userId as string; // Get userId from query

      if (!userId) {
        console.warn(
          `⚠️ Client ${client.id} did not provide a userId. Connection rejected.`,
        );
        client.emit(SocketListenerEventsEnum.ERROR, {
          message: 'User ID is required',
        });
        // client.disconnect();
        return;
      }

      console.log(`✅ Client ${client.id} connected as ${userId}`);
    } catch (error) {
      console.error('Failed to connect client', error);
      client.emit(SocketListenerEventsEnum.ERROR, {
        message: 'Failed to connect',
      });
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      
    } catch (error) {
      console.error('failed to disconnect client', error);
      client.emit(SocketListenerEventsEnum.ERROR, {
        message: 'Failed to disconnect',
      });
    }
  }

  //   async handleReconnection(client: Socket, userId: string) {
  //     try {
  //         console.log(`🔄 Attempting reconnection for ${userId}`);

  //         if (!userId) {
  //             console.warn(`⚠️ Missing userId, reconnection not possible`);
  //             client.emit("reconnect-failed", { message: "User session expired." });
  //             return;
  //         }

  //         // Retrieve game room from Redis
  //         const gameId = await this.redisService.get(`room:${userId}`);

  //         if (!gameId) {
  //             console.warn(`⚠️ No active game found for ${userId}`);
  //             client.emit("reconnect-failed", { message: "No active game found." });
  //             return;
  //         }

  //         // Ensure the client joins the correct room
  //         client.join(gameId);
  //         this.server.to(gameId).emit("player-reconnected", { playerId: userId });

  //         console.log(`✅ ${userId} rejoined room ${gameId} after reconnecting`);
  //     } catch (error) {
  //         console.error("❌ Reconnection failed due to server error:", error);
  //         client.emit("reconnect-failed", { message: "Server error during reconnection." });
  //     }
  // }

  private async startGame(client: Socket, gameId: string) {
    try {
      // start the game
      this.server
        .to(gameId)
        .emit(SocketListenerEventsEnum.STARTING_GAME, '1...');
      this.server
        .to(gameId)
        .emit(SocketListenerEventsEnum.STARTING_GAME, '2...');
      this.server
        .to(gameId)
        .emit(SocketListenerEventsEnum.STARTING_GAME, '3...');
    } catch (error) {
      console.error('failed to start game', error);
      client.emit(SocketListenerEventsEnum.ERROR, {
        message: 'Failed to start game',
      });
    }
  }
}
