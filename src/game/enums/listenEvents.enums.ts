export enum SocketListenerEventsEnum {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  ROOM_JOINED = 'room-joined',
  STARTING_GAME = 'starting-game',
  TOTAL_ACTIVE_USERS_FOR_ROOM = 'total-active-users-in-room',
  ROOM_LIST = 'room-list',
}

export enum SocketEmitterEventsEnum {
  DISCONNECT = 'disconnect',
  RECONNECT = 'reconnect',
  LEAVE_ROOM = 'leave-room',
  JOIN_ROOM = 'join-room',
  GET_TOTAL_ACTIVE_USERS_FOR_ROOM = 'get-total-active-users-in-room',
  GET_ROOM_LIST = 'get-room-list',
}
