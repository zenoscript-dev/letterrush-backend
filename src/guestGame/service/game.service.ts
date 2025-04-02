import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { RedisService } from 'src/redis/redis.service';
import { Room } from 'src/types';
import { generateRoomName, generateUUID } from 'src/utils/game.utils';
import {
  getCurrentWordForRoomKey,
  getListOfRoomsKey,
  getPlayerSocketKey,
  getPlayersUnderRoomKey,
  getRoomLeaderBoardKey,
  getUserRoomKey,
} from 'src/utils/rediskeyGenerator.utils';
import { WordService } from './word.service';

/**
 * Interface representing a player in the game
 * @property {string} nickname - Nickname for the player
 * @property {string} socketId - Socket connection ID
 * @property {number} lastActive - Timestamp of last activity
 * @property {boolean} isGuest - Whether this is a guest account
 * @property {string} [currentRoom] - Current room ID the player is in (optional)
 */

/**
 * Service handling game logic and player management.
 * Manages player connections, rooms, and game interactions using Redis for persistence.
 */
@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly wordService: WordService,
  ) {}

  async onModuleInit() {
    // create and store all the rooms in redis hash
    await this.cleanRedisOnStartUp();
    await this.wordService.loadWordsIntoRedis();
    const rooms = await this.redisService.getHashAllFields('rooms');
    if (!Object.keys(rooms).length) {
      this.logger.log('Creating new rooms');
      await this.createRooms();
    } else {
      this.logger.log('Rooms already exist');
    }
  }

  async connectPlayerToRoom(roomId: string, client: Socket, nickName: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(nickName);
      this.logger.debug(
        `Player socket key: ${playerSocketKey}, Socket ID: ${client.id}`,
      );

      // Store player's current socket ID in Redis
      await this.redisService.setKey(playerSocketKey, client.id);

      // Check if the room exists
      const roomExists = await this.checkIfRoomExists(roomId);
      if (!roomExists) {
        this.logger.warn(`Room ${roomId} not found`);
        client.emit('roomNotFound', { message: 'Room not found' });
        return;
      }

      const playerCurrentRoomKey = getUserRoomKey(nickName);
      const previousRoomId =
        await this.redisService.getKey(playerCurrentRoomKey);

      // If the player is already in the correct room, do nothing
      if (previousRoomId === roomId) {
        this.logger.warn(`Player ${nickName} is already in room ${roomId}`);
        return;
      }

      // Handle room switching
      if (previousRoomId) {
        await this.removePlayerFromRoom(previousRoomId, nickName);
        client.leave(previousRoomId);
        this.logger.log(`Player ${nickName} left room ${previousRoomId}`);
      }

      // Add player to new room and store their room ID
      await this.addPlayerToRoom(roomId, nickName);
      await this.redisService.setKey(playerCurrentRoomKey, roomId);
      client.join(roomId);

      this.logger.log(`Player ${nickName} joined room ${roomId}`);
      client.emit('roomJoined', {
        roomId,
        message: 'Successfully joined room',
      });
    } catch (error) {
      this.logger.error('Error connecting player to room:', error.stack);
      throw error;
    }
  }

  async handleChat(client: Socket, nickname: string) {
    try {
      const playerRoomKey = getUserRoomKey(nickname);
      const playerRoom = await this.redisService.getKey(playerRoomKey);
      if (!playerRoom) {
        this.logger.warn(`Player ${nickname} is not in the correct room`);
        client.emit('error', { message: 'Player is not in the correct room' });
        return;
      }

      return playerRoom;
    } catch (error) {
      this.logger.error('Error handling chat:', error.stack);
      throw error;
    }
  }

  async createRooms() {
    try {
      const numberOfRooms = Number(this.configService.get('NUMBER_OF_ROOMS'));
      this.logger.debug(`Creating ${numberOfRooms} rooms`);

      for (let i = 0; i < numberOfRooms; i++) {
        const roomId = await generateUUID();
        const roomName = await generateRoomName();
        const listOfRoomsKey = getListOfRoomsKey();
        this.logger.debug(
          `Creating room with ID: ${roomId}, Name: ${roomName}`,
        );
        await this.redisService.setHash(listOfRoomsKey, roomId, roomName);
      }
      this.logger.log('Created all rooms successfully');
    } catch (error) {
      this.logger.error('Error creating rooms:', error.stack);
      throw error;
    }
  }

  async checkIfRoomExists(roomId: string) {
    try {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        this.logger.error('Valid room ID is required');
        throw new Error('Valid room ID is required');
      }

      const listOfRoomsKey = getListOfRoomsKey();
      const room = await this.redisService.getHash(listOfRoomsKey, roomId);
      if (!room) {
        this.logger.warn(`Room ${roomId} not found`);
        throw new Error('Room not found');
      }
      return room;
    } catch (error) {
      this.logger.error('Error checking if room exists:', error.stack);
      throw error;
    }
  }

  async getRoomList(): Promise<Room[]> {
    try {
      const listOfRoomsKey = getListOfRoomsKey();
      this.logger.debug('Fetching room list');

      const rooms = await this.redisService.getHashAllFields(listOfRoomsKey);
      if (!Object.keys(rooms).length) {
        this.logger.warn('No rooms found');
        throw new Error('No rooms found');
      }

      const roomList = [];
      for (const roomId in rooms) {
        const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
        const roomSize =
          await this.redisService.getSetMembersCount(playersUnderRoomKey);
        this.logger.debug(`Room ${roomId} has ${roomSize} players`);

        roomList.push({
          roomId,
          roomName: rooms[roomId],
          roomSize,
        });
      }
      return roomList;
    } catch (error) {
      this.logger.error('Error getting room list:', error.stack);
      throw error;
    }
  }

  async removeClient(nickName: string, client?: Socket) {
    try {
      this.logger.log(`Removing client: ${nickName}`);

      const playerSocketKey = getPlayerSocketKey(nickName);
      const playerCurrentRoomKey = getUserRoomKey(nickName);

      // Get the user's room ID
      const roomId = await this.redisService.getKey(playerCurrentRoomKey);

      // Remove player from room if they are in one
      if (roomId) {
        await this.removePlayerFromRoom(roomId, nickName);
        this.logger.log(`Player ${nickName} removed from room ${roomId}`);

        // Notify other players in the room
        if (client) {
          client.leave(roomId);
          // this.server.to(roomId).emit('player-left', { nickName });
        }
      }

      // Remove stored player data
      await this.redisService.deleteKey(playerSocketKey);
      await this.redisService.deleteKey(playerCurrentRoomKey);
      await this.redisService.deleteplayerScore(roomId, nickName);

      this.logger.log(`Successfully removed client: ${nickName}`);
      return {
        removed: true,
        roomId,
      };
    } catch (error) {
      this.logger.error('Error removing client:', error.stack);
      throw error;
    }
  }

  async addPlayerToRoom(roomId: string, nickName: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      await this.redisService.addItemToSet(playersUnderRoomKey, nickName);
      await this.redisService.addplayerScore(roomId, nickName, 0);
      this.logger.debug(`Added player ${nickName} to room ${roomId}`);
    } catch (error) {
      this.logger.error('Error adding player to room:', error.stack);
      throw error;
    }
  }

  async removePlayerFromRoom(roomId: string, nickName: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      await this.redisService.removeItemFromSet(playersUnderRoomKey, nickName);
      await this.redisService.deleteplayerScore(roomId, nickName);
      this.logger.debug(`Removed player ${nickName} from room ${roomId}`);
    } catch (error) {
      this.logger.error('Error removing player from room:', error.stack);
      throw error;
    }
  }

  async getRandomWord() {
    try {
      const wordsKey = 'words';
      const wordCount = await this.redisService.getSetMembersCount(wordsKey);
      console.log('wordCount', wordCount);
      if (wordCount === 0) {
        this.logger.warn('No words available in Redis');
        throw new Error('No words available in Redis');
      }

      const randomWord = await this.redisService.setRamdonmMember(
        wordsKey,
        '1',
      );
      this.logger.debug(`Retrieved random word`);
      return randomWord;
    } catch (error) {
      this.logger.error('Error getting random word:', error.stack);
      throw error;
    }
  }

  async sendRandomWordToRoom(roomId: string) {
    try {
      if (!roomId) {
        this.logger.error('Room ID is required');
        throw new Error('Room ID is required');
      }
      const roomExists = await this.checkIfRoomExists(roomId);
      if (!roomExists) {
        this.logger.warn(`Room ${roomId} not found`);
        throw new Error('Room not found');
      }

      const word = await this.getRandomWord();
      if (!word.length) {
        this.logger.warn('No word available in Redis');
        throw new Error('No word available in Redis');
      }
      const currentWordForRoomKey = getCurrentWordForRoomKey(roomId);
      await this.redisService.setKey(currentWordForRoomKey, word[0]);
      this.logger.debug(`Set word for room ${roomId}`);
      return word[0];
    } catch (error) {
      this.logger.error('Error setting current word for room:', error.stack);
      throw error;
    }
  }

  async cleanRedisOnStartUp() {
    try {
      this.logger.log('Starting Redis cleanup on startup...');

      // Get all keys except the room list and words
      const allKeys = await this.redisService.getAllSets();
      const roomListKey = getListOfRoomsKey();
      const wordsKey = 'words';

      // Delete each key that isn't the room list or words
      for (const key of allKeys) {
        if (key !== roomListKey && key !== wordsKey) {
          await this.redisService.deleteKey(key);
          this.logger.debug(`Deleted key: ${key}`);
        }
      }

      this.logger.log('Redis cleanup completed');
    } catch (error) {
      this.logger.error('Error cleaning Redis on startup:', error.stack);
      throw error;
    }
  }

  async getNumberOfPlayersInRoom(roomId: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      const numberOfPlayers =
        await this.redisService.getSetMembersCount(playersUnderRoomKey);
      this.logger.debug(`Room ${roomId} has ${numberOfPlayers} players`);
      return numberOfPlayers;
    } catch (error) {
      this.logger.error(
        'Error getting number of players in room:',
        error.stack,
      );
      throw error;
    }
  }

  async handleSubmitWord(client: Socket, word: string, nickName: string) {
    try {
      this.logger.debug(
        `handleSubmitWord called with word: ${word}, nickname: ${nickName}`,
      );

      if (!word) {
        this.logger.warn('Word is missing');
        throw new Error('Word is required');
      }
      if (!nickName) {
        this.logger.warn('Nickname is missing');
        throw new Error('Nickname is required');
      }

      const playerExists = await this.checkIfPlayerExists(nickName);
      this.logger.debug(`Player ${nickName} exists: ${playerExists}`);
      if (!playerExists) {
        throw new Error('Player not found or not connected');
      }

      const playerCurrentRoom = await this.getPlayerRoom(nickName);
      this.logger.debug(`Player ${nickName} is in room: ${playerCurrentRoom}`);
      if (!playerCurrentRoom) {
        throw new Error('Player is not in a room');
      }
      const roomExists = await this.checkIfRoomExists(playerCurrentRoom);
      if (!roomExists) {
        this.logger.warn(`Room ${playerCurrentRoom} not found`);
        throw new Error('Room not found');
      }

      const currentWordForRoomKey = getCurrentWordForRoomKey(playerCurrentRoom);
      const currentWord = await this.redisService.getKey(currentWordForRoomKey);
      this.logger.debug(
        `Current word: ${currentWord}, Submitted word: ${word}`,
      );
      if (!currentWord) {
        throw new Error('No word assigned to the room');
      }

      if (currentWord !== word) {
        this.logger.debug(
          `Word mismatch - Expected: ${currentWord}, Received: ${word}`,
        );
        return {
          success: false,
          message: 'Word does not match',
          roomId: playerCurrentRoom,
          winner: null,
          nickName: nickName,
        };
      } else {
        await this.incremenetPlayerScore(playerCurrentRoom, nickName);
        this.logger.debug(
          `Word matches! Deleting word from room ${playerCurrentRoom}`,
        );
        client.emit('wordMatch', { message: 'Word matches' });
        await this.redisService.deleteKey(currentWordForRoomKey);
        return {
          success: true,
          message: 'Word submitted successfully',
          roomId: playerCurrentRoom,
          winner: nickName,
        };
      }
    } catch (error) {
      this.logger.error('Error handling submit word:', error.stack);
      throw error;
    }
  }

  async checkIfPlayerExists(nickName: string) {
    try {
      const playerExists = await this.redisService.getKey(
        getPlayerSocketKey(nickName),
      );
      this.logger.debug(
        `Checking if player ${nickName} exists: ${!!playerExists}`,
      );
      return playerExists;
    } catch (error) {
      this.logger.error('Error checking if player exists:', error.stack);
      throw error;
    }
  }

  async getPlayerRoom(nickName: string) {
    try {
      const playerRoomKey = getUserRoomKey(nickName);
      const playerRoom = await this.redisService.getKey(playerRoomKey);
      if (!playerRoom) {
        this.logger.warn(`Player ${nickName} is not in a room`);
        throw new Error('Player is not in a room');
      }
      return playerRoom;
    } catch (error) {
      this.logger.error('Error getting player room:', error.stack);
      throw error;
    }
  }

  async addPlayerScore(roomId: string, nickName: string, score: number) {
    try {
      await this.redisService.addplayerScore(roomId, nickName, score);
      this.logger.debug(
        `Added score ${score} for player ${nickName} in room ${roomId}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Error adding player score:', error.stack);
      throw error;
    }
  }

  async incremenetPlayerScore(roomId: string, nickName: string) {
    try {
      const playerScore = await this.getPlayerScore(roomId, nickName);
      await this.addPlayerScore(roomId, nickName, Number(playerScore) + 1);
      this.logger.debug(
        `Incremented score for player ${nickName} in room ${roomId}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Error incrementing player score:', error.stack);
      throw error;
    }
  }

  async getPlayerScore(roomId: string, nickName: string): Promise<number> {
    try {
      const playerScore = await this.redisService.getPlayerScore(
        roomId,
        nickName,
      );
      this.logger.debug(
        `Retrieved score ${playerScore} for player ${nickName} in room ${roomId}`,
      );
      return Number(playerScore);
    } catch (error) {
      this.logger.error('Error getting player score:', error.stack);
      throw error;
    }
  }

  async getLeaderBoard(roomId: string) {
    try {
      const leaderBoard = await this.redisService.getLeaderBoard(roomId);
      this.logger.debug(`Retrieved leaderboard for room ${roomId}`);
      return leaderBoard;
    } catch (error) {
      this.logger.error('Error getting leader board:', error.stack);
      throw error;
    }
  }

  async fetchNickNameByClientId(clientId: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(clientId);
      const nickName = await this.redisService.getKey(playerSocketKey);
      this.logger.debug(`Fetched nickname ${nickName} for client ${clientId}`);
      return nickName;
    } catch (error) {
      this.logger.error('Error fetching nick name by client id:', error.stack);
      throw error;
    }
  }

  async fetchRoomCurrentWord(roomId: string) {
    try {
      const currentWordForRoomKey = getCurrentWordForRoomKey(roomId);
      const currentWord = await this.redisService.getKey(currentWordForRoomKey);
      this.logger.debug(`Fetched current word for room ${roomId}`);
      return currentWord;
    } catch (error) {
      this.logger.error('Error fetching room current word:', error.stack);
      throw error;
    }
  }

  async sendWordToNewlyConnectedPlayer(client: Socket, roomId: string) {
    try {
      const currentWord = await this.fetchRoomCurrentWord(roomId);
      await client.emit('random-word', currentWord);
      await client.emit('leader-board', await this.getLeaderBoard(roomId));
      this.logger.debug(
        `Sent word and leaderboard to new player in room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending word to newly connected player:',
        error.stack,
      );
    }
  }

  async getPlayerRank(
    roomId: string,
    playerName: string,
  ): Promise<number | null> {
    try {
      const leaderBoardKey = getRoomLeaderBoardKey(roomId);
      const rank = await this.redisService.getPlayerRank(
        leaderBoardKey,
        playerName,
      );
      this.logger.debug(
        `Retrieved rank ${rank} for player ${playerName} in room ${roomId}`,
      );
      return rank;
    } catch (error) {
      this.logger.error('Error getting player rank:', error.stack);
      throw error;
    }
  }

  async getPlayersInRoom(roomId: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      const players =
        await this.redisService.getSetMembers(playersUnderRoomKey);
      this.logger.debug(
        `Retrieved ${players.length} players in room ${roomId}`,
      );
      return players;
    } catch (error) {
      this.logger.error('Error getting players in room:', error.stack);
      throw error;
    }
  }

  async getPlayerSocket(nickName: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(nickName);
      const playerSocket = await this.redisService.getKey(playerSocketKey);
      this.logger.debug(`Retrieved socket for player ${nickName}`);
      return playerSocket;
    } catch (error) {
      this.logger.error('Error getting player socket:', error.stack);
      throw error;
    }
  }
}
