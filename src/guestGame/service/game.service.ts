import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { RedisService } from 'src/redis/redis.service';
import { generateRoomName, generateUUID } from 'src/utils/game.utils';
import {
  getCurrentWordForRoomKey,
  getListOfRoomsKey,
  getPlayerSocketKey,
  getPlayersUnderRoomKey,
  getRoomLeaderBoardKey,
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
        const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);

        roomList.push({
          roomId,
          roomName: rooms[roomId],
          roomSize:
            await this.redisService.getSetMembersCount(playersUnderRoomKey),
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
      await this.redisService.deleteplayerScore(roomId, nickName);

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
      await this.redisService.addplayerScore(roomId, nickName, 0);
    } catch (error) {
      console.error('🎮 Error adding player to room:', error);
      throw error;
    }
  }

  async removePlayerFromRoom(roomId: string, nickName: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      await this.redisService.removeItemFromSet(playersUnderRoomKey, nickName);
      await this.redisService.deleteplayerScore(roomId, nickName);
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

  async sendRandomWordToRoom(roomId: string) {
    try {
      if (!roomId) {
        throw new Error('Room ID is required');
      }
      const roomExists = await this.checkIfRoomExists(roomId);
      if (!roomExists) {
        throw new Error('Room not found');
      }

      const word = await this.getRandomWord();
      if (!word.length) {
        throw new Error('No word available in Redis');
      }
      const currentWordForRoomKey = getCurrentWordForRoomKey(roomId);
      await this.redisService.setKey(currentWordForRoomKey, word[0]);
      return word[0];
    } catch (error) {
      console.error('🎮 Error setting current word for room:', error);
      throw error;
    }
  }

  async cleanRedisOnStartUp() {
    try {
      console.log('🧹 Starting Redis cleanup on startup...');

      // Get all keys except the room list and words
      const allKeys = await this.redisService.getAllSets();
      const roomListKey = getListOfRoomsKey();
      const wordsKey = 'words';

      // Delete each key that isn't the room list or words
      for (const key of allKeys) {
        if (key !== roomListKey && key !== wordsKey) {
          // Check if key is a players under room key
          // if (key.includes('room:') && key.includes(':players')) {
          await this.redisService.deleteKey(key);
          console.log(`🗑️ Deleted players under room key: ${key}`);
          // Delete other keys like socket IDs, current rooms etc
          // else {
          //   await this.redisService.deleteKey(key);
          //   console.log(`🗑️ Deleted key: ${key}`);
          // }
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

  async handleSubmitWord(client: Socket, word: string, nickName: string) {
    try {
      console.log('🎮 handleSubmitWord called with:', { word, nickName });

      if (!word) {
        console.log('❌ Word is missing');
        throw new Error('Word is required');
      }
      if (!nickName) {
        console.log('❌ Nickname is missing');
        throw new Error('Nickname is required');
      }

      const playerExists = await this.checkIfPlayerExists(nickName);
      console.log('👤 Player exists check:', {
        nickName,
        exists: playerExists,
      });
      if (!playerExists) {
        throw new Error('Player not found or not connected');
      }

      const playerCurrentRoom = await this.getPlayerRoom(nickName);
      console.log('🏠 Player current room:', {
        nickName,
        room: playerCurrentRoom,
      });
      if (!playerCurrentRoom) {
        throw new Error('Player is not in a room');
      }
      const roomExists = await this.checkIfRoomExists(playerCurrentRoom);
      console.log('🏠 Room exists check:', {
        room: playerCurrentRoom,
        exists: roomExists,
      });
      if (!roomExists) {
        throw new Error('Room not found');
      }

      const currentWordForRoomKey = getCurrentWordForRoomKey(playerCurrentRoom);
      const currentWord = await this.redisService.getKey(currentWordForRoomKey);
      console.log('📝 Current word check:', {
        roomWord: currentWord,
        submittedWord: word,
      });
      if (!currentWord) {
        throw new Error('No word assigned to the room');
      }

      if (currentWord !== word) {
        console.log('❌ Word does not match:', {
          expected: currentWord,
          received: word,
        });

        return {
          success: false,
          message: 'Word does not match',
          roomId: playerCurrentRoom,
          winner: null,
          nickName: nickName,
        };
      } else {
        await this.incremenetPlayerScore(playerCurrentRoom, nickName);
        console.log('✅ Word matches! Deleting word from room');
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
      console.error('🎮 Error handling submit word:', error);
      throw error;
    }
  }

  async checkIfPlayerExists(nickName: string) {
    try {
      const playerExists = await this.redisService.getKey(
        getPlayerSocketKey(nickName),
      );
      return playerExists;
    } catch (error) {
      console.error('🎮 Error checking if player exists:', error);
      throw error;
    }
  }

  async getPlayerRoom(nickName: string) {
    try {
      const playerRoomKey = getUserRoomKey(nickName);
      const playerRoom = await this.redisService.getKey(playerRoomKey);
      if (!playerRoom) {
        throw new Error('Player is not in a room');
      }
      return playerRoom;
    } catch (error) {
      console.error('🎮 Error getting player room:', error);
      throw error;
    }
  }

  async addPlayerScore(roomId: string, nickName: string, score: number) {
    try {
      await this.redisService.addplayerScore(roomId, nickName, score);
      return true;
    } catch (error) {
      console.error('🎮 Error adding player score:', error);
      throw error;
    }
  }

  async incremenetPlayerScore(roomId: string, nickName: string) {
    try {
      const playerScore = await this.getPlayerScore(roomId, nickName);
      await this.addPlayerScore(roomId, nickName, Number(playerScore) + 1);
      return true;
    } catch (error) {
      console.error('🎮 Error incrementing player score:', error);
      throw error;
    }
  }

  async getPlayerScore(roomId: string, nickName: string): Promise<number> {
    try {
      const playerScore = await this.redisService.getPlayerScore(
        roomId,
        nickName,
      );
      return Number(playerScore);
    } catch (error) {
      console.error('🎮 Error getting player score:', error);
      throw error;
    }
  }

  async getLeaderBoard(roomId: string) {
    try {
      const leaderBoard = await this.redisService.getLeaderBoard(roomId);
      return leaderBoard;
    } catch (error) {
      console.error('🎮 Error getting leader board:', error);
      throw error;
    }
  }

  async fetchNickNameByClientId(clientId: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(clientId);
      const nickName = await this.redisService.getKey(playerSocketKey);
      return nickName;
    } catch (error) {
      console.error('🎮 Error fetching nick name by client id:', error);
      throw error;
    }
  }

  async fetchRoomCurrentWord(roomId: string) {
    try {
      const currentWordForRoomKey = getCurrentWordForRoomKey(roomId);
      const currentWord = await this.redisService.getKey(currentWordForRoomKey);
      return currentWord;
    } catch (error) {
      console.error('🎮 Error fetching room current word:', error);
      throw error;
    }
  }

  async sendWordToNewlyConnectedPlayer(client: Socket, roomId: string) {
    try {
      const currentWord = await this.fetchRoomCurrentWord(roomId);
      await client.emit('random-word', currentWord);
      await client.emit('leader-board', await this.getLeaderBoard(roomId));
    } catch (error) {
      console.error('🎮 Error sending word to newly connected player:', error);
    }
  }

  // async getPlayerRank(roomId: string, nickName: string) {
  //   try {
  //     const leaderBoard = await this.getLeaderBoard(roomId);
  //     const playerRank = leaderBoard.findIndex(
  //       (player) => player.nickname === nickName,
  //     );
  //     return playerRank;
  //   } catch (error) {
  //     console.error('🎮 Error getting player rank:', error);
  //     throw error;
  //   }
  // }

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

      return rank; // Convert 0-based index to 1-based rank
    } catch (error) {
      console.error('🎮 Error getting player rank:', error);
      throw error;
    }
  }

  async getPlayersInRoom(roomId: string) {
    try {
      const playersUnderRoomKey = getPlayersUnderRoomKey(roomId);
      const players =
        await this.redisService.getSetMembers(playersUnderRoomKey);
      return players;
    } catch (error) {
      console.error('🎮 Error getting players in room:', error);
      throw error;
    }
  }

  async getPlayerSocket(nickName: string) {
    try {
      const playerSocketKey = getPlayerSocketKey(nickName);
      const playerSocket = await this.redisService.getKey(playerSocketKey);
      return playerSocket;
    } catch (error) {
      console.error('🎮 Error getting player socket:', error);
      throw error;
    }
  }
}
