// src/lib/tetris.js

export const COLS = 10;
export const ROWS = 20;
export const BLOCK_SIZE = 30;

const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 1, 0], [0, 1, 1]], // S
  [[0, 1, 1], [1, 1, 0]], // Z
  [[1, 0, 0], [1, 1, 1]], // J
  [[0, 0, 1], [1, 1, 1]]  // L
];

const COLORS = [
  "#00f0f0", "#f0f000", "#a000f0",
  "#00f000", "#f00000", "#0000f0", "#f0a000"
];

export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function randomPiece() {
  const id = Math.floor(Math.random() * SHAPES.length);
  return {
    shape: SHAPES[id],
    color: COLORS[id],
    x: Math.floor(COLS / 2) - 1,
    y: 0
  };
}
