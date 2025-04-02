import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class WordService {
  private readonly logger = new Logger(WordService.name);

  constructor(private readonly redisService: RedisService) {}

  async loadWordsIntoRedis() {
    try {
      const key = 'words';

      // Check if words already exist in Redis
      const existingWords = await this.redisService.getSetMembersCount(key);
      this.logger.debug(`Found ${existingWords} existing words`);

      if (existingWords === 0) {
        const filePath = 'filtered_data.json';
        const fileData = require('fs').readFileSync(filePath, 'utf-8');
        const jsonWords = JSON.parse(fileData);
        const words = Object.keys(jsonWords);

        for (const word of words) {
          await this.redisService.addItemToSet(key, word);
        }

        this.logger.log(`Loaded ${words.length} words into Redis`);
      } else {
        this.logger.log('Words already exist in Redis, skipping load');
      }
    } catch (error) {
      this.logger.error('Error loading words into Redis:', error.stack);
      throw error;
    }
  }
}
