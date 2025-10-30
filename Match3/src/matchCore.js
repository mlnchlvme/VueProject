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

export const CellType = {
  Empty:  "empty",
  Block:  "blocked",
  Crate:  "crate",
};

const Booster = {
  Cross:  -1,
  Bomb:  -2,
};

function isNormal(val){ return typeof val === "number" && val >= 0; }
function isBooster(val){ return val === Booster.Cross || val === Booster.Bomb; }

export function createLevel({
  size = 8,
  colors = 5,
  blocked = [],
  crates  = [],
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

      const curOK  = c < size && cells[r][c]     === CellType.Empty && curVal  != null && isNormal(curVal);
      const prevOK =            cells[r][c - 1]   === CellType.Empty && prevVal != null && isNormal(prevVal);

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

  for (let c = 0; c < size; c++) {
    let runStart = 0, runLen = 1;
    for (let r = 1; r <= size; r++) {
      const curVal  = r < size ? tiles[r][c] : Symbol("s");
      const prevVal = tiles[r - 1][c];

      const curOK  = r < size && cells[r][c]     === CellType.Empty && curVal  != null && isNormal(curVal);
      const prevOK =           cells[r - 1][c]   === CellType.Empty && prevVal != null && isNormal(prevVal);

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
    for (const [deltaRow, deltaColumn] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const rr = r + deltaRow, cc = c + deltaColumn;
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

function virtualAt(tiles, a, b, r, c) {
  if (r === a.r && c === a.c) return tiles[b.r][b.c];
  if (r === b.r && c === b.c) return tiles[a.r][a.c];
  return tiles[r][c];
}

function lineHasMatchVirtual(tiles, cells, a, b, r, c, dr, dc) {
  const size = tiles.length;
  const base = virtualAt(tiles, a, b, r, c);
  if (!(base != null && base >= 0) || cells[r][c] !== CellType.Empty) return false;

  let len = 1;
  let rr = r + dr, cc = c + dc;
  while (rr >= 0 && cc >= 0 && rr < size && cc < size) {
    const v = virtualAt(tiles, a, b, rr, cc);
    if (!(cells[rr][cc] === CellType.Empty && v != null && v >= 0 && v === base)) break;
    len++; rr += dr; cc += dc;
  }
  rr = r - dr; cc = c - dc;
  while (rr >= 0 && cc >= 0 && rr < size && cc < size) {
    const v = virtualAt(tiles, a, b, rr, cc);
    if (!(cells[rr][cc] === CellType.Empty && v != null && v >= 0 && v === base)) break;
    len++; rr -= dr; cc -= dc;
  }
  return len >= 3;
}

export function wouldSwapCreateMatch(tiles, cells, a, b) {
  if (!canSwap(cells, a, b)) return false;
  if (a.r === b.r && a.c === b.c) return false;

  if (lineHasMatchVirtual(tiles, cells, a, b, a.r, a.c, 0, 1)) return true;
  if (lineHasMatchVirtual(tiles, cells, a, b, a.r, a.c, 1, 0)) return true;
  if (lineHasMatchVirtual(tiles, cells, a, b, b.r, b.c, 0, 1)) return true;
  if (lineHasMatchVirtual(tiles, cells, a, b, b.r, b.c, 1, 0)) return true;

  return false;
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
    const makesRow = color === left1 && color === left2 && isNormal(left1) && isNormal(left2);
    const makesCol = color === up1   && color === up2   && isNormal(up1)   && isNormal(up2);
    if (!makesRow && !makesCol) return color;
    if (++tries > 20) return color;
  }
}

function inBoundsRC(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }

export function levelFromMap(rows, { colors = 5, symbols } = {}) {
  const N = rows.length;
  const map = Object.assign({
    "0": "empty",
    "1": "blocked",
    "#": "crate",
  }, symbols || {});
  const blocked = [];
  const crates  = [];
  for (let r = 0; r < N; r++) {
    const line = rows[r];
    for (let c = 0; c < N; c++) {
      const ch = line[c];
      const type = map[ch] ?? "empty";
      if (type === "blocked") blocked.push({ r, c });
      else if (type === "crate") crates.push({ r, c });
    }
  }
  return { size: N, colors, blocked, crates };
}

export function createLevelFromMap(rows, opts = {}) {
  const cfg = levelFromMap(rows, opts);
  return createLevel(cfg);
}

function countRun(tiles, cells, r, c, deltaRow, deltaColumn) {
  const size = tiles.length;
  const base = tiles[r][c];
  if (!isNormal(base) || cells[r][c] !== CellType.Empty) return 0;
  let len = 1;
  let rr = r + deltaRow, cc = c + deltaColumn;
  while (inBoundsRC(size, rr, cc) && cells[rr][cc] === CellType.Empty && tiles[rr][cc] === base && isNormal(tiles[rr][cc])) {
    len++; rr += deltaRow; cc += deltaColumn;
  }
  rr = r - deltaRow; cc = c - deltaColumn;
  while (inBoundsRC(size, rr, cc) && cells[rr][cc] === CellType.Empty && tiles[rr][cc] === base && isNormal(tiles[rr][cc])) {
    len++; rr -= deltaRow; cc -= deltaColumn;
  }
  return len;
}

function placeBoosterAt(tiles, pos, horizonthalCombo, verticalCombo) {
  if (horizonthalCombo === 3 && verticalCombo === 3) {
    tiles[pos.r][pos.c] = Booster.Bomb;
    return true;
  }
  if (verticalCombo >= 4 || horizonthalCombo >= 4) {
    tiles[pos.r][pos.c] = Booster.Cross;
    return true;
  }
  return false;
}

function clearLineByBooster(tiles, cells, pos, type) {
  const size = tiles.length;
  const cleared = new Set();
  if (type === Booster.Cross) {
    const r = pos.r;
    const c = pos.c;

    for (let r = 0; r < size; r++) {
      if (cells[r][c] !== CellType.Block) {
        if (cells[r][c] === CellType.Crate) cells[r][c] = CellType.Empty;
        if (tiles[r][c] != null) {
          tiles[r][c] = null;
          cleared.add(`${r},${c}`);
        }
      }
    }
    for (let c = 0; c < size; c++) {
      if (cells[r][c] !== CellType.Block) {
        if (cells[r][c] === CellType.Crate) cells[r][c] = CellType.Empty;
        if (tiles[r][c] != null) {
          tiles[r][c] = null;
          cleared.add(`${r},${c}`);
        }
      }
    }
  }
  if (type === Booster.Bomb) {
    const r0 = pos.r, c0 = pos.c;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        if (cells[rr][cc] === CellType.Block) continue;
        if (cells[rr][cc] === CellType.Crate) cells[rr][cc] = CellType.Empty;
        if (tiles[rr][cc] != null) {
          tiles[rr][cc] = null;
          cleared.add(`${rr},${cc}`);
        }
      }
    }
  }
  return cleared;
}

export function activateBooster(tiles, cells, pos, colors) {
  if (!inBoundsRC(tiles.length, pos.r, pos.c)) return false;
  const v = tiles[pos.r][pos.c];
  if (!isBooster(v)) return false;
  const cleared = clearLineByBooster(tiles, cells, pos, v);
  tiles[pos.r][pos.c] = null;
  if (cleared.size > 0) breakAdjacentCrates(cells, cleared);
  collapseWithCells(tiles, cells);
  refillWithCells(tiles, cells, colors);
  resolveWithCells(tiles, cells, colors);
  return true;
}

export function applyMove(tiles, cells, a, b, colors) {
  if (!inBoundsRC(tiles.length, a.r, a.c) || !inBoundsRC(tiles.length, b.r, b.c)) return false;
  if (!adjacent(a, b)) return false;

  const aBooster = isBooster(tiles[a.r][a.c]);
  const bBooster = isBooster(tiles[b.r][b.c]);

  if (aBooster || bBooster) {
    swap(tiles, a, b);
    const boosterPos = isBooster(tiles[a.r][a.c]) ? a : b;
    const ok = activateBooster(tiles, cells, boosterPos, colors);
    return ok;
  }

  if (!canSwap(cells, a, b)) return false;

  swap(tiles, a, b);

  const matches = findMatchesWithCells(tiles, cells);
  if (matches.size === 0) {
    swap(tiles, a, b);
    return false;
  }

  const horLen = countRun(tiles, cells, b.r, b.c, 0, 1);
  const verLen = countRun(tiles, cells, b.r, b.c, 1, 0);
  const placed = placeBoosterAt(tiles, b, horLen, verLen);
  if (placed) matches.delete(`${b.r},${b.c}`);

  clearMatchesWithCells(tiles, matches);
  breakAdjacentCrates(cells, matches);
  collapseWithCells(tiles, cells);
  refillWithCells(tiles, cells, colors);
  resolveWithCells(tiles, cells, colors);
  return true;
}

export function getBoosterClears(tiles, cells, pos) {
  if (!inBoundsRC(tiles.length, pos.r, pos.c)) return new Set();
  const v = tiles[pos.r][pos.c];
  if (!isBooster(v)) return new Set();

  const size = tiles.length;
  const cleared = new Set();

  if (v === Booster.Cross) {
    const r = pos.r, c = pos.c;
    for (let cc = 0; cc < size; cc++) {
      if (cells[r][cc] === CellType.Block) continue;
      if (tiles[r][cc] != null) cleared.add(`${r},${cc}`);
    }
    for (let rr = 0; rr < size; rr++) {
      if (cells[rr][c] === CellType.Block) continue;
      if (tiles[rr][c] != null) cleared.add(`${rr},${c}`);
    }
  }

  if (v === Booster.Bomb) {
    const r0 = pos.r, c0 = pos.c;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        if (cells[rr][cc] === CellType.Block) continue;
        if (tiles[rr][cc] != null) cleared.add(`${rr},${cc}`);
      }
    }
  }

  return cleared;
}
