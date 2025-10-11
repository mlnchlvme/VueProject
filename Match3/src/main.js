import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

export function createBoard(size = 8, colors = 5) {
  const board = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      board[r][c] = safeRandom(board, r, c, colors);
    }
  }
  resolve(board, colors);
  return board;
}

export function inBounds(board, r, c) {
  return r >= 0 && r < board.length && c >= 0 && c < board.length;
}
export function adjacent(a, b) {
  return a && b && (
    (a.r === b.r && Math.abs(a.c - b.c) === 1) ||
    (a.c === b.c && Math.abs(a.r - b.r) === 1)
  );
}

export function swap(board, a, b) {
  const t = board[a.r][a.c];
  board[a.r][a.c] = board[b.r][b.c];
  board[b.r][b.c] = t;
}

export function findMatches(board) {
  const size = board.length;
  const matched = new Set();

  for (let r = 0; r < size; r++) {
    let runStart = 0, runLen = 1;
    for (let c = 1; c <= size; c++) {
      const cur = c < size ? board[r][c] : Symbol('sentinel');
      const prev = board[r][c - 1];
      if (cur === prev && prev != null) {
        runLen++;
      } else {
        if (runLen >= 3 && prev != null) {
          for (let x = runStart; x < runStart + runLen; x++) {
            matched.add(`${r},${x}`);
          }
        }
        runStart = c;
        runLen = 1;
      }
    }
  }

  for (let c = 0; c < size; c++) {
    let runStart = 0, runLen = 1;
    for (let r = 1; r <= size; r++) {
      const cur = r < size ? board[r][c] : Symbol('sentinel');
      const prev = board[r - 1][c];
      if (cur === prev && prev != null) {
        runLen++;
      } else {
        if (runLen >= 3 && prev != null) {
          for (let y = runStart; y < runStart + runLen; y++) {
            matched.add(`${y},${c}`);
          }
        }
        runStart = r;
        runLen = 1;
      }
    }
  }
  return matched;
}

export function clearMatches(board, matchedSet) {
  let cleared = 0;
  for (const key of matchedSet) {
    const [r, c] = key.split(',').map(Number);
    if (board[r][c] != null) {
      board[r][c] = null;
      cleared++;
    }
  }
  return cleared;
}

export function collapse(board) {
  const size = board.length;
  for (let c = 0; c < size; c++) {
    let write = size - 1;
    for (let r = size - 1; r >= 0; r--) {
      if (board[r][c] != null) {
        board[write][c] = board[r][c];
        if (write !== r) board[r][c] = null;
        write--;
      }
    }
  }
}

export function refill(board, colors) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] == null) {
        board[r][c] = Math.floor(Math.random() * colors);
      }
    }
  }
}

export function resolve(board, colors) {
  let changed = false;
  while (true) {
    const matches = findMatches(board);
    if (matches.size === 0) break;
    clearMatches(board, matches);
    collapse(board);
    refill(board, colors);
    changed = true;
  }
  return changed;
}

export function swapLeadsToMatch(board, a, b) {
  swap(board, a, b);
  const ok = findMatches(board).size > 0;
  swap(board, a, b); // откат
  return ok;
}

function safeRandom(board, r, c, colors) {
  let tries = 0;
  while (true) {
    const color = Math.floor(Math.random() * colors);
    const left1 = c >= 1 ? board[r][c - 1] : -1;
    const left2 = c >= 2 ? board[r][c - 2] : -1;
    const up1   = r >= 1 ? board[r - 1][c] : -1;
    const up2   = r >= 2 ? board[r - 2][c] : -1;
    const makesRow = (color === left1 && color === left2);
    const makesCol = (color === up1 && color === up2);
    if (!makesRow && !makesCol) return color;
    if (++tries > 20) return color;
  }
}
