export const TILE = 48;

// Room grid includes the wall ring: 13x7 playable tiles, like Isaac.
export const ROOM_COLS = 15;
export const ROOM_ROWS = 9;
export const ROOM_W = ROOM_COLS * TILE;
export const ROOM_H = ROOM_ROWS * TILE;

export const GAME_W = 960;
export const GAME_H = 540;

// Top-left of the room on screen; HUD lives above it.
export const ROOM_X = (GAME_W - ROOM_W) / 2;
export const ROOM_Y = GAME_H - ROOM_H - 18;

export const DOOR_COL = Math.floor(ROOM_COLS / 2);
export const DOOR_ROW = Math.floor(ROOM_ROWS / 2);

export const FLOOR_GRID_W = 9;
export const FLOOR_GRID_H = 8;

export const COLORS = {
  background: 0x07060d,
  floor: 0x1b1830,
  floorAlt: 0x201c38,
  wall: 0x3a3358,
  wallEdge: 0x544a7d,
  door: 0x8a6d2f,
  bolt: 0x7fe8ff,
  boltCore: 0xffffff,
  shadow: 0x120f1f,
  shadowEye: 0xffd23f,
  heart: 0xe8435a,
  heartEmpty: 0x3b2530,
  text: '#e9e4ff',
} as const;

// Pixel <-> tile helpers for the current room.
export const tileX = (col: number) => ROOM_X + col * TILE + TILE / 2;
export const tileY = (row: number) => ROOM_Y + row * TILE + TILE / 2;
