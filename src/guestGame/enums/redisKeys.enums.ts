export enum RedisKeys {
  // Player
  PLAYER_SOCKET = 'socket:', // Append socketId
  PLAYER_CURRENT_ROOM = 'currentRoom:', // Append userId

  // Room
  SET_OF_ROOMS = 'room:',
}

// Helper function to generate Redis keys dynamically
export const getRedisKey = {
  playerSocket: (nickName: string) => `${RedisKeys.PLAYER_SOCKET}${nickName}`,
  playerCurrentRoom: (nickName: string) =>
    `${RedisKeys.PLAYER_CURRENT_ROOM}${nickName}`,
  roomPlayerSet: (roomId: string) => `room:${roomId}:players`, // Alternative dynamic key
  setOfRooms: () => RedisKeys.SET_OF_ROOMS,
  room: (roomId: string) => `room:${roomId}`,
  roomPlayerScores: (roomId: string) => `room:${roomId}:scores`,
};
