import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './service/game.service';

@WebSocketGateway(4100, {
  cors: { origin: '*', pingTimeout: 60000, pingInterval: 30000 },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly INACTIVE_TIMEOUT = 30000; // 30 seconds in milliseconds

  constructor(private readonly gameService: GameService) {
    console.log('🚀 Socket gateway constructor initialized');
  }

  // @Interval(5000) // Check every 5 seconds
  async handleSendRandomWord() {
    try {
      const randomWord = await this.gameService.getRandomWord();
      if (randomWord.length) {
        console.log('Asdasdasdasdasasd');
        await this.server
          .to('2b0db6ff-e988-4b04-abc2-c765252d2e69')
          .emit('randomWord', randomWord[0]);
      }

      console.log(randomWord, 'Adsdasdasdasdadasda');
    } catch (error) {
      console.error('❌ Error cleaning inactive users:', error);
    }
  }

  async handleConnection(client: Socket) {
    try {
      console.log('👋 New client connection attempt', { socketId: client.id });
      const roomId = client.handshake.query.roomId as string;
      const nickname = client.handshake.query.nickname as string;
      if (!roomId || !nickname) {
        console.log('❌ Room ID and player ID are required');
        client.emit('error', { message: 'Room ID and player ID are required' });
        client.disconnect();
        return;
      }
      await this.gameService.connectPlayerToRoom(roomId, client, nickname);
      this.server
        .to(roomId)
        .emit('player-joined', `${nickname} joined the room`);
    } catch (error) {
      console.error('❌ Error in handleConnection:', error);
      client.emit('error', { message: error.message || 'Connection error' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        console.log('❌ Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        client.disconnect();
        return;
      }
      console.log('👋 Client disconnecting:', client.id);
      // Clean up user data immediately on disconnect
      const removed = await this.gameService.removeClient(nickname, client);
      if (removed.removed) {
        console.log('✅ Client data removed:', client.id);
        this.server
          .to(removed.roomId)
          .emit('player-left', `${nickname} left the room`);
      } else {
        console.log('❌ Client data not removed:', client.id);
      }
    } catch (error) {
      console.error('❌ Error in handleDisconnect:', error);
    }
  }

  @SubscribeMessage('chat')
  async handleChat(client: Socket, { message }) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        console.log('❌ Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        return;
      }
      if (!message) {
        console.log('❌ Message is required');
        client.emit('error', { message: 'Message is required' });
        return;
      }
      const result = await this.gameService.handleChat(client, nickname);
      if (result) {
        this.server.to(result).emit('chat', message);
      }
    } catch (error) {
      console.error('❌ Error in chat:', error);
    }
  }

  @SubscribeMessage('sendWord')
  async handleSendWord(client: Socket, { word }) {
    try {
    } catch (error) {
      console.error('❌ Error in sendWord:', error);
      client.emit('error', { message: 'Failed to send word' });
    }
  }

  @SubscribeMessage('submitWord')
  async handleSubmitWord(client: Socket, { word }) {
    try {
      const roomId = client.handshake.query.roomId as string;
    } catch (error) {
      console.error('❌ Error in submitWord:', error);
      client.emit('error', { message: 'Submission failed' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(client: Socket) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        console.log('❌ Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        return;
      }
      const result = await this.gameService.removeClient(nickname, client);
      if (result.removed) {
        this.server
          .to(result.roomId)
          .emit('player-left', `${nickname} left the room`);
      }
      client.disconnect();
    } catch (error) {
      console.error('❌ Error in leaveRoom:', error);
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  @SubscribeMessage('getRoomSize')
  async handleGetRoomSize(client: Socket, { roomId }) {
    try {
    } catch (error) {
      console.error('❌ Error in getRoomSize:', error);
      client.emit('error', { message: 'Failed to get room size' });
    }
  }

  @SubscribeMessage('ping')
  async handlePing(client: Socket) {
    try {
      console.log('🏓 Ping received:', { socketId: client.id });
      // await this.gameService.updateClientActivity(client.id);
      client.emit('pong', { message: 'Still connected' });
      console.log('✅ Pong sent:', { socketId: client.id });
    } catch (error) {
      console.error('❌ Error in ping:', error);
    }
  }
}
