export function getPlayerSocketKey(nickName: string) {
  return `socket:${nickName}`;
}

export function getPlayerCurrentRoomKey(nickName: string) {
  return `currentRoom:${nickName}`;
}

export function getRoomPlayerSetKey(roomId: string) {
  return `room:${roomId}:players`;
}

export function getListOfRoomsKey() {
  return `rooms`;
}

export function getUserRoomKey(nickName: string) {
  return `currentRoom:${nickName}`;
}

export function getPlayersUnderRoomKey(roomId: string) {
  return `room:${roomId}:players`;
}
