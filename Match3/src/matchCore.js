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
        runStart = c; runLen = 1;
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
        runStart = r; runLen = 1;
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
    const makesCol = (color === up1   && color === up2);
    if (!makesRow && !makesCol) return color;
    if (++tries > 20) return color; // аварийный выход
  }
}

export const CellType = {
  Empty:  "empty",
  Block:  "blocked", 
  Crate:  "crate",
};

export function createLevel({
  size = 8,
  colors = 5,
  blocked = [], // [{r,c}]
  crates  = [], // [{r,c}]
} = {}) {
  const cells = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => CellType.Empty)
  );
  for (const { r, c } of blocked) if (inBoundsRC(size, r, c)) cells[r][c] = CellType.Block;
  for (const { r, c } of crates)  if (inBoundsRC(size, r, c)) cells[r][c] = CellType.Crate;

  const tiles = Array.from({ length: size }, () => Array(size).fill(null));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] !== CellType.Empty) continue;
      tiles[r][c] = safeRandom2(tiles, cells, r, c, colors);
    }
  }
  resolveWithCells(tiles, cells, colors);
  return { size, colors, tiles, cells };
}

export function canSwap(cells, a, b) {
  return (
    inBoundsRC(cells.length, a.r, a.c) &&
    inBoundsRC(cells.length, b.r, b.c) &&
    cells[a.r][a.c] === CellType.Empty &&
    cells[b.r][b.c] === CellType.Empty
  );
}

export function findMatchesWithCells(tiles, cells) {
  const size = tiles.length;
  const matched = new Set();

  for (let r = 0; r < size; r++) {
    let runStart = 0, runLen = 1;
    for (let c = 1; c <= size; c++) {
      const curVal  = c < size ? tiles[r][c] : Symbol("s");
      const prevVal = tiles[r][c - 1];

      const curOK  = c < size && cells[r][c]     === CellType.Empty && curVal  != null;
      const prevOK =            cells[r][c - 1]   === CellType.Empty && prevVal != null;

      if (curOK && prevOK && curVal === prevVal) {
        runLen++;
      } else {
        if (runLen >= 3 && prevOK) {
          for (let x = runStart; x < runStart + runLen; x++) matched.add(`${r},${x}`);
        }
        runStart = c; runLen = 1;
      }
    }
  }

  // столбцы
  for (let c = 0; c < size; c++) {
    let runStart = 0, runLen = 1;
    for (let r = 1; r <= size; r++) {
      const curVal  = r < size ? tiles[r][c] : Symbol("s");
      const prevVal = tiles[r - 1][c];

      const curOK  = r < size && cells[r][c]     === CellType.Empty && curVal  != null;
      const prevOK =           cells[r - 1][c]   === CellType.Empty && prevVal != null;

      if (curOK && prevOK && curVal === prevVal) {
        runLen++;
      } else {
        if (runLen >= 3 && prevOK) {
          for (let y = runStart; y < runStart + runLen; y++) matched.add(`${y},${c}`);
        }
        runStart = r; runLen = 1;
      }
    }
  }
  return matched;
}

export function clearMatchesWithCells(tiles, matchedSet) {
  return clearMatches(tiles, matchedSet);
}

export function breakAdjacentCrates(cells, tilesClearedThisStep) {
  for (const key of tilesClearedThisStep) {
    const [r, c] = key.split(",").map(Number);

    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= cells.length || cc >= cells.length) continue;

      if (cells[rr][cc] === CellType.Crate) {
        cells[rr][cc] = CellType.Empty;
      }
    }
  }
}


export function collapseWithCells(tiles, cells) {
  const size = tiles.length;
  for (let c = 0; c < size; c++) {
    let write = size - 1;
    for (let r = size - 1; r >= 0; r--) {
      const cell = cells[r][c];
      if (cell !== CellType.Empty) {
        // встретили преграду — новый сегмент выше неё
        write = r - 1;
      } else if (tiles[r][c] != null) {
        if (write !== r) {
          tiles[write][c] = tiles[r][c];
          tiles[r][c] = null;
        }
        write--;
      }
    }
  }
}

export function refillWithCells(tiles, cells, colors) {
  const size = tiles.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] === CellType.Empty && tiles[r][c] == null) {
        tiles[r][c] = Math.floor(Math.random() * colors);
      }
    }
  }
}

export function resolveWithCells(tiles, cells, colors) {
  let changed = false;

  while (true) {
    const matches = findMatchesWithCells(tiles, cells);
    if (matches.size === 0) break;

    clearMatchesWithCells(tiles, matches);

    breakAdjacentCrates(cells, matches);

    collapseWithCells(tiles, cells);
    refillWithCells(tiles, cells, colors);

    changed = true;
  }

  return changed;
}


export function swapLeadsToMatchWithCells(tiles, cells, a, b) {
  if (!canSwap(cells, a, b)) return false;
  swap(tiles, a, b);
  const ok = findMatchesWithCells(tiles, cells).size > 0;
  swap(tiles, a, b); // откат
  return ok;
}

function safeRandom2(tiles, cells, r, c, colors) {
  if (cells[r][c] !== CellType.Empty) return null;
  let tries = 0;
  while (true) {
    const color = Math.floor(Math.random() * colors);
    const left1 = c >= 1 ? tiles[r][c - 1] : -1;
    const left2 = c >= 2 ? tiles[r][c - 2] : -1;
    const up1   = r >= 1 ? tiles[r - 1][c] : -1;
    const up2   = r >= 2 ? tiles[r - 2][c] : -1;
    const makesRow = color === left1 && color === left2;
    const makesCol = color === up1   && color === up2;
    if (!makesRow && !makesCol) return color;
    if (++tries > 20) return color;
  }
}

function inBoundsRC(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }

export function levelFromAscii(rows, { colors = 5, mapping } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("levelFromAscii: rows должен быть непустым массивом строк");
  }
  const N = rows.length;
  const width = rows[0].length;
  if (rows.some(r => r.length !== width)) {
    throw new Error("levelFromAscii: все строки должны быть одинаковой длины");
  }
  if (width !== N) {
    throw new Error(`levelFromAscii: ожидается квадрат ${N}×${N}, а получено ${N}×${width}`);
  }

  const norm = s => s.replace(/\r?\n?$/,"");

  const map = Object.assign({
    ".": "empty",
    "#": "blocked",
    "X": "crate",
  }, mapping || {});

  const blocked = [];
  const crates  = [];

  for (let r = 0; r < N; r++) {
    const line = norm(rows[r]);
    for (let c = 0; c < N; c++) {
      const ch = line[c];
      const type = map[ch] ?? "empty";
      if (type === "blocked") blocked.push({ r, c });
      else if (type === "crate") crates.push({ r, c });
    }
  }

  return { size: N, colors, blocked, crates };
}
