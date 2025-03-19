import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

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


}
