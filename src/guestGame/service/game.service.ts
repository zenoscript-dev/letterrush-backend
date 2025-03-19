import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { generateRoomName, generateUUID } from 'src/utils/game.utils';
import { getRedisKey } from '../enums/redisKeys.enums';

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
  ) {
    console.log('🎮 GameService initialized');
  }

  async onModuleInit() {
    // create and store all the rooms in redis hash
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

        const playerSocketKey = getRedisKey.playerSocket(nickName);

        // store clients socket id in redis
        await this.redisService.setKey(playerSocketKey, client.id);

      // Step 1: Check if the room exists
      const roomExists = await this.checkIfRoomExists(roomId);
      if (!roomExists) {
        throw new Error('Room not found');
      }
  
      // Step 2: Check if the user is already in a room
      const roomPlayerSet = getRedisKey.roomPlayerSet(roomId);
      const previousRoomId = await this.redisService.getKey(roomPlayerSet);
  
      if (previousRoomId) {
        // Step 3: Remove the user from the previous room
        const playerRoomKey = getRedisKey.playerCurrentRoom(nickName);
        console.log(`🎮 Removing user ${nickName} from room ${previousRoomId}`);
        await this.redisService.removeItemFromSet(playerRoomKey, nickName);
      }
  
      // Step 4: Add user to the new room
      const playerSocketId = client.id;
      const playerRoomKey = getRedisKey.playerCurrentRoom(nickName);
      await this.redisService.addItemToSet(playerRoomKey, nickName);
      await this.redisService.addItemToSet(roomPlayerSet, playerSocketId);

  
    //   // Step 5: Update the user's current room
    //   await this.redisService.setKey(`currentRoom:${userId}`, roomId);
  
    //   console.log(`🎮 User ${userId} connected to room ${roomId}`);
    } catch (error) {
      console.error('🎮 Error connecting player to room:', error);
      throw error;
    }
  }
  

  async createRooms() {
    try {
      const numberOfRooms = Number(this.configService.get('NUMBER_OF_ROOMS'));
      for (let i = 0; i < numberOfRooms; i++) {
        const roomId = await generateUUID();
        const roomName = await generateRoomName();
        await this.redisService.setHash('rooms', roomId, roomName);
      }
      console.log('🎮 Created all rooms');
    } catch (error) {
      console.error('🎮 Error creating rooms:', error);
      throw error;
    }
  }

  async checkIfRoomExists(roomId: string) {
    try {
      const room = await this.redisService.getHash('rooms', roomId);
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
      const rooms = await this.redisService.getHashAllFields('rooms');
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

  async removeClient(clientId: string) {
    try {
      console.log(`🎮 Removing client: ${clientId}`);
  
      // Step 1: Identify the user associated with the socket
      const userId = await this.redisService.getKey(`socket:${clientId}`);
      if (!userId) {
        console.log(`🎮 No user found for client ${clientId}`);
        return;
      }
  
      // Step 2: Find all rooms the user is in
      const userRooms = await this.redisService.getSetMembers(`player:${userId}`);
      
      for (const roomId of userRooms) {
        // Step 3: Remove the user from room player set
        await this.redisService.removeItemFromSet(`players:${roomId}`, clientId);
      }
  
      // Step 4: Remove user-specific keys
      await this.redisService.deleteKey(`player:${userId}`);
      await this.redisService.deleteKey(`socket:${clientId}`);
  
      console.log(`🎮 Successfully removed client: ${clientId}`);
  
    } catch (error) {
      console.error('🎮 Error removing client:', error);
      throw error;
    }
  }
  
}
