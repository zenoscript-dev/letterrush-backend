import * as fs from 'fs';

// Load JSON dictionary from file
const data = JSON.parse(fs.readFileSync('words_dictionary.json', 'utf8'));

// Convert dictionary keys to an array (Preprocessing step, O(N))
const wordList = Object.keys(data);

// Function to get a random word in O(1)
export function getRandomWord(): string {
  return wordList[Math.floor(Math.random() * wordList.length)];
}

// Example usage
console.log(getRandomWord()); // Picks a random word in O(1)
