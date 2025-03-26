import { Logger } from '@nestjs/common';
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

@WebSocketGateway(4100, {
  cors: { origin: '*', pingTimeout: 60000, pingInterval: 30000 },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly gameService: GameService) {
    this.logger.log('Socket gateway constructor initialized');
  }

  // @Interval(5000) // Check every 5 seconds
  async handleSendRandomWord({ roomId }: { roomId: string }) {
    try {
      if (!roomId) {
        this.logger.error('Room ID is required');
        throw new Error('Room ID is required');
      }
      const currentWord = await this.gameService.sendRandomWordToRoom(roomId);
      if (currentWord) {
        await this.server.to(roomId).emit('random-word', currentWord);
      } else {
        this.logger.error('No word available in Redis');
        throw new Error('No word available in Redis');
      }
    } catch (error) {
      this.logger.error(`Error cleaning inactive users: ${error.message}`);
    }
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(
        `New client connection attempt - Socket ID: ${client.id}`,
      );
      const roomId = client.handshake.query.roomId as string;
      const nickname = client.handshake.query.nickname as string;
      if (!roomId || !nickname) {
        this.logger.error('Room ID and player ID are required');
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
      this.logger.error(`Error in handleConnection: ${error.message}`);
      client.emit('error', { message: error.message || 'Connection error' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        this.logger.error('Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        client.disconnect();
        return;
      }
      this.logger.log(`Client disconnecting: ${client.id}`);
      const removed = await this.gameService.removeClient(nickname, client);
      if (removed.removed) {
        this.logger.log(`Client data removed: ${client.id}`);
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
        this.logger.warn(`Client data not removed: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Error in handleDisconnect: ${error.message}`);
    }
  }

  async handleGetNumberOfPlayersInRoom(roomId: string) {
    try {
      const numberOfPlayers =
        await this.gameService.getNumberOfPlayersInRoom(roomId);
      this.server.to(roomId).emit('number-of-players', numberOfPlayers);
      if (numberOfPlayers === 2) {
        this.logger.log(`Starting game for room: ${roomId}`);
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
      this.logger.error(`Error in getNumberOfPlayersInRoom: ${error.message}`);
    }
  }

  async handleReconnect(client: Socket) {
    this.logger.log(`Client reconnecting: ${client.id}`);
    const roomId = client.handshake.query.roomId as string;
    const nickname = client.handshake.query.nickname as string;
    if (!roomId || !nickname) {
      this.logger.error('Room ID and player ID are required');
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
    this.logger.error(`Error in handleReconnect: ${error.message}`);
    throw new Error('Reconnection failed');
  }

  @SubscribeMessage('chat')
  async handleChat(client: Socket, { message }: { message: string }) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        this.logger.error('Nickname is required');
        client.emit('error', { message: 'Nickname is required' });
        return;
      }
      if (!message) {
        this.logger.error('Message is required');
        client.emit('error', { message: 'Message is required' });
        return;
      }
      const result = await this.gameService.handleChat(client, nickname);
      if (result) {
        this.logger.log(`Emitting chat message to room: ${result}`);
        this.server.to(result).emit('chat', {
          id: generateUUID(),
          message,
          roomId: result,
          nickName: nickname,
          type: MessageType.CHAT,
        } as Message);
      }
    } catch (error) {
      this.logger.error(`Error in chat: ${error.message}`);
    }
  }

  @SubscribeMessage('submit-word')
  async handleSubmitWord(client: Socket, { word }: { word: string }) {
    try {
      const nickName = client.handshake.query.nickname as string;
      if (!word) {
        this.logger.error('Word is required');
        client.emit('error', { message: 'Word is required' });
        return;
      }

      if (!nickName) {
        this.logger.error('Nickname is required');
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
        this.logger.log('Getting player rank');
        const playerRank = await this.gameService.getPlayerRank(
          result.roomId,
          nickName,
        );
        this.logger.log(`Player rank: ${playerRank}`);
        return client.emit('rank', playerRank);
      } else {
        this.server.to(result.roomId).emit('word-not-match', {
          id: generateUUID(),
          message: `${nickName.split('@')[0]} submitted "${word}" but it does not match the current word!`,
          roomId: result.roomId,
          nickName: nickName,
          type: MessageType.WORD_NOT_MATCH,
        } as Message);
        this.logger.log('Getting player rank');
        const playerRank = await this.gameService.getPlayerRank(
          result.roomId,
          nickName,
        );
        return client.emit('rank', playerRank);
      }
    } catch (error) {
      this.logger.error(`Error in submitWord: ${error.message}`);
      client.emit('error', { message: 'Submission failed' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(client: Socket) {
    try {
      const nickname = client.handshake.query.nickname as string;
      if (!nickname) {
        this.logger.error('Nickname is required');
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
      this.logger.error(`Error in leaveRoom: ${error.message}`);
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
      this.logger.error(`Error in getRoomSize: ${error.message}`);
      client.emit('error', { message: 'Failed to get room size' });
    }
  }

  @Interval(15000)
  async handlePing() {
    try {
      const allRooms = await this.gameService.getRoomList();
      this.logger.log('Starting ping check for all rooms');

      for (const roomId of allRooms) {
        const playersInRoom = await this.gameService.getPlayersInRoom(roomId);

        for (const player of playersInRoom) {
          const playerSocket = await this.gameService.getPlayerSocket(player);
          if (playerSocket) {
            try {
              const socket = this.server.sockets.sockets.get(playerSocket);

              if (socket) {
                socket.emit('ping-check');

                const isActive = await new Promise((resolve) => {
                  const timeout = setTimeout(() => resolve(false), 5000);

                  socket.once('pong-response', () => {
                    clearTimeout(timeout);
                    resolve(true);
                  });
                });

                if (!isActive) {
                  this.logger.warn(
                    `Player ${player} is inactive, disconnecting...`,
                  );
                  socket.disconnect();
                  await this.gameService.removeClient(player, socket);
                }
              }
            } catch (err) {
              this.logger.error(
                `Error pinging player ${player}: ${err.message}`,
              );
            }
          }
        }

        const leaderBoard = await this.gameService.getLeaderBoard(roomId);
        this.server.to(roomId).emit('leader-board', leaderBoard);
      }

      this.logger.log('Completed ping check for all rooms');
    } catch (error) {
      this.logger.error(`Error in ping: ${error.message}`);
    }
  }
}
