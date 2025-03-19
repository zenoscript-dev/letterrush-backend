import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './service/game.service';
import { Interval } from '@nestjs/schedule';

@WebSocketGateway(4100, { cors: { origin: '*' }, namespace: '/game' })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly INACTIVE_TIMEOUT = 30000; // 30 seconds in milliseconds

  constructor(private readonly gameService: GameService) {
    console.log('🚀 Socket gateway constructor initialized');
  }

  // @Interval(5000) // Check every 5 seconds
  // async handleInactiveUsers() {
  //   try {
  //     const now = Date.now();
  //     const clients = await this.gameService.getAllClients();

  //     for (const client of clients) {
  //       if (now - client.lastActive > this.INACTIVE_TIMEOUT) {
  //         console.log('⏰ Removing inactive client:', client.socketId);
  //         await this.gameService.removeClient(client.socketId);
  //       }
  //     }
  //   } catch (error) {
  //     console.error('❌ Error cleaning inactive users:', error);
  //   }
  // }

  async handleConnection(client: Socket) {
    try {
      console.log('👋 New client connection attempt', { socketId: client.id });
      const roomId = client.handshake.query.roomId as string;
      const userId = client.handshake.query.userId as string;
      if(!roomId || !userId) {
        console.log('❌ Room ID and player ID are required');
        client.emit('error', { message: 'Room ID and player ID are required' });
        client.disconnect();
        return;
      }
      await this.gameService.connectPlayerToRoom(roomId, client, userId);
    } catch (error) {
      console.error('❌ Error in handleConnection:', error);
      client.emit('error', { message: 'Connection error' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      console.log('👋 Client disconnecting:', client.id);
      // Clean up user data immediately on disconnect
      await this.gameService.removeClient(client.id);
      console.log('✅ Client data removed:', client.id);
    } catch (error) {
      console.error('❌ Error in handleDisconnect:', error);
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(client: Socket) {
    try {
      
      console.log('✅ Client joined room:', { socketId: client.id });
    } catch (error) {
      console.error('❌ Error in handleJoinRoom:', error);
      client.emit('error', { message: error.message });
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
     
    } catch (error) {
      console.error('❌ Error in submitWord:', error);
      client.emit('error', { message: 'Submission failed' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(client: Socket) {
    try {
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
