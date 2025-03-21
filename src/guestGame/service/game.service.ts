import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { RedisService } from 'src/redis/redis.service';
import { generateRoomName, generateUUID } from 'src/utils/game.utils';
import {
  getListOfRoomsKey,
  getPlayerSocketKey,
  getPlayersUnderRoomKey,
  getUserRoomKey,
} from 'src/utils/rediskeyGenerator.utils';
import loadWordsIntoRedis from 'src/utils/words.utils';

/**
 * Interface representing a player in the game
 * @property {string} nickname - Nickname for the player
 * @property {string} socketId - Socket connection ID
 * @property {number} lastActive - Timestamp of last activity
 * @property {boolean} isGuest - Whether this is a guest account
 * @property {string} [currentRoom] - Current room ID the player is in (optional)
 */
interface Player {
  nickname: string;
  socketId: string;
  lastActive: number;
  isGuest: boolean;
  currentRoom?: string;
}

/**
 * Service handling game logic and player management.
 * Manages player connections, rooms, and game interactions using Redis for persistence.
 */
@Injectable()
export class GameService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // create and store all the rooms in redis hash
    await this.cleanRedisOnStartUp();
    await loadWordsIntoRedis();
    const rooms = await this.redisService.getHashAllFields('rooms');
    if (!Object.keys(rooms).length) {
      console.log('🎮 Creating new rooms');
      await this.createRooms();
    } else {
      console.log('🎮 Rooms already exist');
    }
  }

  async connectPlayerToRoom(roomId: string, client: Socket, nickName: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(nickName);
      console.log(playerSocketKey, client.id, 'playerSocketKey');

      // Store player's current socket ID in Redis
      await this.redisService.setKey(playerSocketKey, client.id);

      // Check if the room exists
      const roomExists = await this.checkIfRoomExists(roomId);
      if (!roomExists) {
        client.emit('roomNotFound', { message: 'Room not found' });
        return;
      }

      const playerCurrentRoomKey = getUserRoomKey(nickName);
      const previousRoomId =
        await this.redisService.getKey(playerCurrentRoomKey);

      // If the player is already in the correct room, do nothing
      if (previousRoomId === roomId) {
        console.log(`⚠️ ${nickName} is already in room ${roomId}`);
        return;
      }

      // Handle room switching
      if (previousRoomId) {
        await this.removePlayerFromRoom(previousRoomId, nickName);
        client.leave(previousRoomId);
        console.log(`🚪 ${nickName} left room ${previousRoomId}`);
      }

      // Add player to new room and store their room ID
      await this.addPlayerToRoom(roomId, nickName);
      await this.redisService.setKey(playerCurrentRoomKey, roomId);
      client.join(roomId);

      console.log(`🎮 ${nickName} joined room ${roomId}`);
      client.emit('roomJoined', {
        roomId,
        message: 'Successfully joined room',
      });
    } catch (error) {
      console.error('🎮 Error connecting player to room:', error);
      throw error;
    }
  }

  async handleChat(client: Socket, nickname: string) {
    try {
      const playerRoomKey = getUserRoomKey(nickname);
      const playerRoom = await this.redisService.getKey(playerRoomKey);
      if (!playerRoom) {
        console.log('❌ Player is not in the correct room');
        client.emit('error', { message: 'Player is not in the correct room' });
        return;
      }

      return playerRoom;
    } catch (error) {
      console.error('🎮 Error handling chat:', error);
      throw error;
    }
  }

  async createRooms() {
    try {
      const numberOfRooms = Number(this.configService.get('NUMBER_OF_ROOMS'));
      console.log(numberOfRooms);
      for (let i = 0; i < numberOfRooms; i++) {
        const roomId = await generateUUID();
        const roomName = await generateRoomName();
        const listOfRoomsKey = getListOfRoomsKey();
        console.log(listOfRoomsKey, 'asdasdaasdasasdasasd');
        await this.redisService.setHash(listOfRoomsKey, roomId, roomName);
      }
      console.log('🎮 Created all rooms');
    } catch (error) {
      console.error('🎮 Error creating rooms:', error);
      throw error;
    }
  }

  async checkIfRoomExists(roomId: string) {
    try {
      const listOfRoomsKey = getListOfRoomsKey();
      const room = await this.redisService.getHash(listOfRoomsKey, roomId);
      if (!room) {
        throw new Error('Room not found');
      }
      return room;
    } catch (error) {
      console.error('🎮 Error checking if room exists:', error);
      throw error;
    }
  }

  async getRoomList() {
    try {
      const listOfRoomsKey = getListOfRoomsKey();
      const rooms = await this.redisService.getHashAllFields(listOfRoomsKey);
      if (!Object.keys(rooms).length) {
        throw new Error('No rooms found');
      }
      //    get each room size
      const roomList = [];
      for (const roomId in rooms) {
        const roomSize = await this.redisService.getSetMembersCount(
          `players:${roomId}`,
        );
        roomList.push({
          roomId,
          roomName: rooms[roomId],
          roomSize,
        });
      }
      return roomList;
    } catch (error) {
      console.error('🎮 Error getting room list:', error);
      throw error;
    }
  }

  async removeClient(nickName: string, client?: Socket) {
    try {
      console.log(`🎮 Removing client: ${nickName}`);

      const playerSocketKey = getPlayerSocketKey(nickName);
      const playerCurrentRoomKey = getUserRoomKey(nickName);

      // Get the user's room ID
      const roomId = await this.redisService.getKey(playerCurrentRoomKey);

      // Remove player from room if they are in one
      if (roomId) {
        await this.removePlayerFromRoom(roomId, nickName);
        console.log(`🚪 ${nickName} removed from room ${roomId}`);

        // Notify other players in the room
        if (client) {
          client.leave(roomId);
          // this.server.to(roomId).emit('player-left', { nickName });
        }
      }

      // Remove stored player data
      await this.redisService.deleteKey(playerSocketKey);
      await this.redisService.deleteKey(playerCurrentRoomKey);

      console.log(`✅ Successfully removed client: ${nickName}`);
      return {
        removed: true,
        roomId,
      };
    } catch (error) {
      console.error('❌ Error removing client:', error);
      throw error;
    }
  }

  async addPlayerToRoom(roomId: string, nickName: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      await this.redisService.addItemToSet(playersUnderRoomKey, nickName);
    } catch (error) {
      console.error('🎮 Error adding player to room:', error);
      throw error;
    }
  }

  async removePlayerFromRoom(roomId: string, nickName: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      await this.redisService.removeItemFromSet(playersUnderRoomKey, nickName);
    } catch (error) {
      console.error('🎮 Error removing player from room:', error);
      throw error;
    }
  }

  async getRandomWord() {
    try {
      const wordsKey = 'words';
      const wordCount = await this.redisService.getSetMembersCount(wordsKey);
      if (wordCount === 0) {
        throw new Error('No words available in Redis');
      }

      const randomWord = await this.redisService.setRamdonmMember(
        wordsKey,
        '1',
      );
      return randomWord;
    } catch (error) {
      console.error('🎮 Error getting random word:', error);
      throw error;
    }
  }

  async cleanRedisOnStartUp() {
    try {
      console.log('🧹 Starting Redis cleanup on startup...');

      // Get all keys except the room list
      const allKeys = await this.redisService.getAllSets();
      const roomListKey = getListOfRoomsKey();
      const wordsKey = 'words';

      // Delete each key that isn't the room list
      for (const key of allKeys) {
        if (key !== roomListKey && key !== wordsKey) {
          await this.redisService.deleteKey(key);
          console.log(`🗑️ Deleted key: ${key}`);
        }
      }

      console.log('✨ Redis cleanup completed');
    } catch (error) {
      console.error('🎮 Error cleaning Redis on startup:', error);
      throw error;
    }
  }

  async getNumberOfPlayersInRoom(roomId: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      const numberOfPlayers =
        await this.redisService.getSetMembersCount(playersUnderRoomKey);
      return numberOfPlayers;
    } catch (error) {
      console.error('🎮 Error getting number of players in room:', error);
      throw error;
    }
  }
}
