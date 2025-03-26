import { Interval } from '@nestjs/schedule';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { generateUUID } from 'src/utils/game.utils';
import { GameService } from './service/game.service';

interface Message {
  id: string;
  message: string;
  roomId: string;
  nickName: string;
  type: MessageType;
}

export enum MessageType {
  CHAT = 'chat',
  SUBMIT_WORD = 'submit-word',
  LEAVE_ROOM = 'leave-room',
  WORD_MATCH = 'word-match',
  WORD_NOT_MATCH = 'word-not-match',
  START_GAME = 'start-game',
  RANDOM_WORD = 'random-word',
  PLAYER_JOINED = 'player-joined',
  PLAYER_LEFT = 'player-left',
  NUMBER_OF_PLAYERS = 'number-of-players',
  WINNER = 'winner',
  SCORE = 'score',
  RANK = 'rank',
}

@WebSocketGateway({
  cors: { origin: '*', pingTimeout: 60000, pingInterval: 30000 },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {
    console.log('🚀 Socket gateway constructor initialized');
  }

  // @Interval(5000) // Check every 5 seconds
  async handleSendRandomWord({ roomId }: { roomId: string }) {
    try {
      if (!roomId) {
        console.log('❌ Room ID is required');
        throw new Error('Room ID is required');
      }
      const currentWord = await this.gameService.sendRandomWordToRoom(roomId);
      if (currentWord) {
        await this.server.to(roomId).emit('random-word', currentWord);
      } else {
        console.log('❌ No word available in Redis');
        throw new Error('No word available in Redis');
      }
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
      this.server.to(roomId).emit('player-joined', {
        id: generateUUID(),
        message: `${nickname.split('@')[0]} joined the room`,
        roomId,
        nickName: 'letterrush-bot',
        type: MessageType.PLAYER_JOINED,
      } as Message);
      await this.handleGetNumberOfPlayersInRoom(roomId);
      await this.gameService.sendWordToNewlyConnectedPlayer(client, roomId);
      const leaderBoard = await this.gameService.getLeaderBoard(roomId);
      this.server.to(roomId).emit('leader-board', leaderBoard);
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
        this.server.to(removed.roomId).emit('player-left', {
          id: generateUUID(),
          message: `${nickname.split('@')[0]} left the room`,
          roomId: removed.roomId,
          nickName: 'letterrush-bot',
          type: MessageType.PLAYER_LEFT,
        } as Message);
        await this.handleGetNumberOfPlayersInRoom(removed.roomId);
        const leaderBoard = await this.gameService.getLeaderBoard(
          removed.roomId,
        );
        this.server.to(removed.roomId).emit('leader-board', leaderBoard);
      } else {
        console.log('❌ Client data not removed:', client.id);
      }
    } catch (error) {
      console.error('❌ Error in handleDisconnect:', error);
    }
  }

  async handleGetNumberOfPlayersInRoom(roomId: string) {
    try {
      const numberOfPlayers =
        await this.gameService.getNumberOfPlayersInRoom(roomId);
      this.server.to(roomId).emit('number-of-players', numberOfPlayers);
      if (numberOfPlayers === 2) {
        console.log('🔄 Starting game for room:', roomId);
        this.server.to(roomId).emit('start-game', {
          id: generateUUID(),
          message: 'Game is started',
          roomId,
          nickName: 'letterrush-bot',
          type: MessageType.START_GAME,
        } as Message);
        await this.handleSendRandomWord({ roomId });
      }
    } catch (error) {
      console.error('❌ Error in getNumberOfPlayersInRoom:', error);
    }
  }

  async handleReconnect(client: Socket) {
    console.log('🔄 Client reconnecting:', client.id);
    const roomId = client.handshake.query.roomId as string;
    const nickname = client.handshake.query.nickname as string;
    if (!roomId || !nickname) {
      console.log('❌ Room ID and player ID are required');
      client.emit('error', { message: 'Room ID and player ID are required' });
      client.disconnect();
      return;
    }
    await this.gameService.connectPlayerToRoom(roomId, client, nickname);

    await this.handleGetNumberOfPlayersInRoom(roomId);
    await this.gameService.sendWordToNewlyConnectedPlayer(client, roomId);
    const leaderBoard = await this.gameService.getLeaderBoard(roomId);
    this.server.to(roomId).emit('leader-board', leaderBoard);
  }
  catch(error) {
    console.error('❌ Error in handleReconnect:', error);
    throw new Error('Reconnection failed');
  }

  @SubscribeMessage('chat')
  async handleChat(client: Socket, { message }: { message: string }) {
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
        console.log('🔄 Emitting chat message to room:', result);
        this.server.to(result).emit('chat', {
          id: generateUUID(),
          message,
          roomId: result,
          nickName: nickname,
          type: MessageType.CHAT,
        } as Message);
      }
    } catch (error) {
      console.error('❌ Error in chat:', error);
    }
  }

  @SubscribeMessage('submit-word')
  async handleSubmitWord(client: Socket, { word }: { word: string }) {
    try {
      const nickName = client.handshake.query.nickname as string;
      if (!word) {
        console.log('❌ Word is required');
        client.emit('error', { message: 'Word is required' });
        return;
      }

      if (!nickName) {
        console.log('❌ Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        return;
      }

      const result = await this.gameService.handleSubmitWord(
        client,
        word.toLowerCase(),
        nickName,
      );
      if (result.success) {
        this.server.to(result.roomId).emit('word-match', {
          id: generateUUID(),
          message: `${result.winner.split('@')[0]} won the round by correctly typing "${word}"!`,
          roomId: result.roomId,
          nickName: 'letterrush-bot',
          type: MessageType.WORD_MATCH,
        } as Message);
        const leaderBoard = await this.gameService.getLeaderBoard(
          result.roomId,
        );
        this.server.to(result.roomId).emit('leader-board', leaderBoard);
        await client.emit(
          'score',
          await this.gameService.getPlayerScore(result.roomId, nickName),
        );
        await this.handleSendRandomWord({
          roomId: result.roomId,
        });
        console.log('🔄 Getting player rank');
        const playerRank = await this.gameService.getPlayerRank(
          result.roomId,
          nickName,
        );
        console.log('🔄 Player rank:', playerRank);
        return client.emit('rank', playerRank);
      } else {
        // client.emit('wordNotMatch', { message: 'Word does not match' });
        this.server.to(result.roomId).emit('word-not-match', {
          id: generateUUID(),
          message: `${nickName.split('@')[0]} submitted "${word}" but it does not match the current word!`,
          roomId: result.roomId,
          nickName: nickName,
          type: MessageType.WORD_NOT_MATCH,
        } as Message);
        console.log('🔄 Getting player rank');
        const playerRank = await this.gameService.getPlayerRank(
          result.roomId,
          nickName,
        );
        return client.emit('rank', playerRank);
      }
    } catch (error) {
      console.error('❌ Error in submitWord:', error);
      client.emit('error', { message: 'Submission failed' });
    }
  }

  @SubscribeMessage('leave-room')
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
        this.server.to(result.roomId).emit('player-left', {
          id: generateUUID(),
          message: `${nickname.split('@')[0]} left the room`,
          roomId: result.roomId,
          nickName: 'letterrush-bot',
          type: MessageType.PLAYER_LEFT,
        } as Message);
      }
      client.disconnect();
    } catch (error) {
      console.error('❌ Error in leaveRoom:', error);
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  @SubscribeMessage('get-room-size')
  async handleGetRoomSize(client: Socket, { roomId }: { roomId: string }) {
    try {
      const numberOfPlayers =
        await this.gameService.getNumberOfPlayersInRoom(roomId);
      this.server.to(roomId).emit('number-of-players', numberOfPlayers);
    } catch (error) {
      console.error('❌ Error in getRoomSize:', error);
      client.emit('error', { message: 'Failed to get room size' });
    }
  }

  @Interval(15000)
  async handlePing() {
    try {
      const allRooms = await this.gameService.getRoomList();
      console.log('🏓 Starting ping check for all rooms');

      // Iterate through all rooms
      for (const roomId of allRooms) {
        // Get all players in the room
        const playersInRoom = await this.gameService.getPlayersInRoom(roomId);

        // Ping each player and check activity
        for (const player of playersInRoom) {
          const playerSocket = await this.gameService.getPlayerSocket(player);
          if (playerSocket) {
            try {
              // Get socket instance from socket id
              const socket = this.server.sockets.sockets.get(playerSocket);

              if (socket) {
                // Try to ping the client
                socket.emit('ping-check');

                // Wait briefly for response
                const isActive = await new Promise((resolve) => {
                  const timeout = setTimeout(() => resolve(false), 5000);

                  socket.once('pong-response', () => {
                    clearTimeout(timeout);
                    resolve(true);
                  });
                });

                if (!isActive) {
                  console.log(
                    `❌ Player ${player} is inactive, disconnecting...`,
                  );
                  socket.disconnect();
                  await this.gameService.removeClient(player, socket);
                }
              }
            } catch (err) {
              console.error(`Error pinging player ${player}:`, err);
            }
          }
        }

        // Send updated leaderboard after checking all players in this room
        const leaderBoard = await this.gameService.getLeaderBoard(roomId);
        this.server.to(roomId).emit('leader-board', leaderBoard);
      }

      console.log('✅ Completed ping check for all rooms');
    } catch (error) {
      console.error('❌ Error in ping:', error);
    }
  }
}
