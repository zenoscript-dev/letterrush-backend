import * as fs from 'fs';
import { createClient } from 'redis';

async function loadWordsIntoRedis() {
  const redisClient = createClient();
  await redisClient.connect();

  const key = 'words';

  // Ensure 'words' is a set
  const type = await redisClient.type(key);
  if (type !== 'set' && type !== 'none') {
    console.log(`🚨 Existing key '${key}' is not a Set, deleting it...`);
    await redisClient.del(key);
  }

  // Check if words already exist in Redis
  const existingWords = await redisClient.sCard(key);

  if (existingWords === 0) {
    const filePath = 'filtered_data.json';
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const jsonWords = JSON.parse(fileData);
    const words = Object.keys(jsonWords); // Extract words as an array

    for (let i = 0; i < words.length; i++) {
      await redisClient.sAdd(key, words[i]);
    }

    console.log(`📥 Loaded ${words.length} words into Redis`);
  } else {
    console.log('📝 Words already exist in Redis, skipping load');
  }

  await redisClient.disconnect();
}

export default loadWordsIntoRedis;
