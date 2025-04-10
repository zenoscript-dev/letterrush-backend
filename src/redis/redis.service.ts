import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { getRoomLeaderBoardKey } from 'src/utils/rediskeyGenerator.utils';

@Injectable()
export class RedisService implements OnModuleInit {
  private redisClient: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }

  // create a set to store unique users in the room.
  async addItemToSet(key: string, value: string) {
    return await this.redisClient.sadd(key, value);
  }

  async removeItemFromSet(key: string, value: string) {
    return await this.redisClient.srem(key, value);
  }

  async getSetMembers(key: string) {
    return await this.redisClient.smembers(key);
  }

  async getSetMembersCount(key: string) {
    return await this.redisClient.scard(key);
  }

  async setRamdonmMember(key: string, value: string) {
    return await this.redisClient.srandmember(key, value);
  }

  async checkIfItemExistsInSet(key: string, value: string) {
    return await this.redisClient.sismember(key, value);
  }

  async getAllSets() {
    return await this.redisClient.keys('*');
  }

  // create a hash to store user details
  async setHash(key: string, field: string, value: any) {
    return await this.redisClient.hset(key, field, value);
  }

  async getHash(key: string, field: string) {
    return await this.redisClient.hget(key, field);
  }

  async getHashAllFields(key: string) {
    return await this.redisClient.hgetall(key);
  }

  async deleteHash(key: string) {
    return await this.redisClient.del(key);
  }

  async setKey(key: string, value: string) {
    return await this.redisClient.set(key, value);
  }

  async getKey(key: string) {
    return await this.redisClient.get(key);
  }

  async deleteKey(key: string) {
    return await this.redisClient.del(key);
  }

  async del(key: string) {
    return await this.redisClient.del(key);
  }

  async rPush(key: string, ...values: string[]) {
    return await this.redisClient.rpush(key, ...values);
  }

  async addplayerScore(roomId: string, nickName: string, score: number) {
    const leaderBoardKey = getRoomLeaderBoardKey(roomId);
    return await this.redisClient.zadd(leaderBoardKey, score, nickName);
  }

  async deleteplayerScore(roomId: string, nickName: string) {
    const leaderBoardKey = getRoomLeaderBoardKey(roomId);
    return await this.redisClient.zrem(leaderBoardKey, nickName);
  }

  async getPlayerScore(roomId: string, nickName: string) {
    const leaderBoardKey = getRoomLeaderBoardKey(roomId);
    return await this.redisClient.zscore(leaderBoardKey, nickName);
  }

  async getLeaderBoard(roomId: string) {
    const leaderBoardKey = getRoomLeaderBoardKey(roomId);
    const scores = await this.redisClient.zrevrange(
      leaderBoardKey,
      0,
      -1,
      'WITHSCORES',
    );
    const formattedScores = [];
    for (let i = 0; i < scores.length; i += 2) {
      formattedScores.push({
        nickname: scores[i],
        score: parseInt(scores[i + 1]),
        rank: i / 2 + 1,
      });
    }
    return formattedScores;
  }

  async getPlayerRank(
    leaderBoardKey: string,
    playerName: string,
  ): Promise<number | null> {
    const rank = await this.redisClient.zrevrank(leaderBoardKey, playerName);
    return rank !== null ? rank + 1 : null; // Convert 0-based index to 1-based rank
  }
}
