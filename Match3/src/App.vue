<template>
  <div class="page">
    <div class="topbar">
      <div>Moves: {{ movesLeft }}</div>
      <div>Score: {{ score }}</div>
      <select v-model.number="levelIndex" @change="loadLevel">
        <option v-for="(lv, i) in levels" :key="i" :value="i">Level {{ i + 1 }}</option>
      </select>
    </div>

    <div v-if="showGameOver" class="modal">
      <div class="modal-card">
        <h3>Игра окончена</h3>
        <p>Очки: {{ score }}</p>
        <button @click="restart">Начать сначала</button>
      </div>
    </div>

    <div class="board" :style="boardStyle">
      <div ref="grid" role="grid" class="grid">
        <div v-for="(row, r) in tiles" :key="r" role="row" class="row" :style="rowStyle">
          <div
            v-for="(val, c) in row"
            :key="c"
            class="cell"
            :class="{ 'crate-breaking': cratesBreaking.has(key(r,c)) }"
            :data-r="r"
            :data-c="c"
            :style="cellStyle(cells[r][c])"
            @pointerdown.prevent
            style="cursor:pointer"
          >

            <div
              v-if="val != null"
              class="tile"
              :class="[
                boosterClass(val),
                clearing.has(key(r, c)) ? 'tile-clearing' : '',
                appearKeys.has(key(r, c)) ? 'tile-appear' : ''
              ]"
              :style="tileStyle(val)"
              role="gridcell"
              @click="onTileClick(r, c)"
            />
          </div>
        </div>

        <div v-if="sweep.active" class="sweep" :style="sweepStyle"></div>
        <div v-if="bombFlash.active" class="bomb-flash" :style="bombStyle"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from "vue";
import { usePointerSwipe } from "@vueuse/core";
import {
  CellType,
  createLevelFromMap,
  canSwap,
  swap,
  findMatchesWithCells,
  clearMatches,
  breakAdjacentCrates,
  collapseWithCells,
  refillWithCells,
  wouldSwapCreateMatch,
  getBoosterClears,
} from "./matchCore.js";

import backPlate from "../assets/background/backPlate.png";

import crateBlock from "../assets/blocks/crateBlock.png";
import blockedBlock from "../assets/blocks/blockedBlock.png";

import crossBoosterPng from "../assets/boosters/crossBooster.png";
import bombBoosterPng  from "../assets/boosters/bombBooster.png";

import redTilePng    from "../assets/tiles/redTile.png";
import blueTilePng   from "../assets/tiles/blueTile.png";
import greenTilePng  from "../assets/tiles/greenTile.png";
import yellowTilePng from "../assets/tiles/yellowTile.png";

const TILE_IMG = [redTilePng, greenTilePng, blueTilePng, yellowTilePng];
const BOOSTER_IMG = { [-1]: crossBoosterPng, [-2]: bombBoosterPng };

const COLORS = 4;
const Booster = { Cross: -1, Bomb: -2 };
const isBoosterVal = (v) => v === Booster.Cross || v === Booster.Bomb;

const levels = ref([
  ["111000000",
  "110000000",
  "1000#0000",
  "000##0000",
  "000000000",
  "000000000",
  "00000#001",
  "000000011",
  "000000111"],
  ["111100000",
  "100000000",
  "1000##000","1000##000",
  "000000000",
  "00000#000",
  "00000#000",
  "000000001",
  "111111111"],
  ["111110000",
  "100000000",
  "10000##00",
  "10000##00",
  "000000000",
  "000000000",
  "0000000#0",
  "0000000#0",
  "000000011"],
  ["111110000",
  "111000000",
  "11000##00",
  "100####00",
  "000000000",
  "000000000",
  "0000000#0",
  "00######0",
  "000000011"],
]);

const levelIndex = ref(0);
const tiles = ref([]);
const cells = ref([]);
const animating = ref(false);

const clearing = ref(new Set());
const appearKeys = ref(new Set());
const bombFlash = ref({ active: false, r: null, c: null });

const sweep = ref({ active: false, row: null, col: null, type: null });

const cratesBreaking = ref(new Set());

function setCratesBreaking(keysSet, on = true) {
  const s = new Set(cratesBreaking.value);
  for (const k of keysSet) on ? s.add(k) : s.delete(k);
  cratesBreaking.value = s;
}

function onlyCrates(keysSet) {
  const out = new Set();
  for (const k of keysSet) {
    const [r, c] = k.split(',').map(Number);
    if (cells.value[r]?.[c] === CellType.Crate) out.add(k);
  }
  return out;
}

async function animateAndApplyCrateBreaks(crateKeysSet, delayMs = 220) {
  if (!crateKeysSet || crateKeysSet.size === 0) return;
  setCratesBreaking(crateKeysSet, true);
  await nextTick();
  await sleep(delayMs);
  for (const k of crateKeysSet) {
    const [r, c] = k.split(',').map(Number);
    if (cells.value[r][c] === CellType.Crate) cells.value[r][c] = CellType.Empty;
    if (tiles.value[r][c] != null) tiles.value[r][c] = null;
  }
  setCratesBreaking(crateKeysSet, false);
}


function crateAdjacentsOf(matchesSet) {
  const N = tiles.value.length;
  const out = new Set();
  for (const k of matchesSet) {
    const [r, c] = k.split(',').map(Number);
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      if (cells.value[rr][cc] === CellType.Crate) out.add(`${rr},${cc}`);
    }
  }
  return out;
}

const CELL = 56;
const GAP = 2;
const BOARD_PAD = 14;
const STEP = computed(() => CELL + GAP);

const boardStyle = computed(() => {
  const N = tiles.value.length || 0;
  const innerW = N * CELL + (N - 1) * GAP;
  const innerH = innerW; 
  const totalW = innerW + BOARD_PAD * 2;
  const totalH = innerH + BOARD_PAD * 2;
  return {
    width: `${totalW}px`,
    height: `${totalH}px`,
    padding: `${BOARD_PAD}px`,               
    backgroundImage: `url(${backPlate})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    position: 'relative',
    borderRadius: '18px',
    boxSizing: 'content-box',               
    display: 'grid',
    placeItems: 'center'
  };
});

const rowStyle = computed(() => ({ display: 'flex', gap: `${GAP}px` }));

const START_MOVES = 15;
const movesLeft = ref(START_MOVES);
const score = ref(0);
const showGameOver = ref(false);

const bombStyle = computed(() => {
  if (!bombFlash.value.active) return {};
  const top  = BOARD_PAD + bombFlash.value.r * STEP.value;
  const left = BOARD_PAD + bombFlash.value.c * STEP.value;
  const s = CELL;
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${s}px`,
    height: `${s}px`,
    animation: 'bombFlash 260ms ease-out forwards',
    position: 'absolute',
    pointerEvents: 'none'
  };
});

const sweepStyle = computed(() => {
  if (!sweep.value.active) return {};
  const N = tiles.value.length;
  const thickness = CELL;
  if (sweep.value.type === 'row') {
    const top = BOARD_PAD + sweep.value.row * STEP.value;
    const width = N * CELL + (N - 1) * GAP;
    return {
      top: `${top}px`,
      left: `${BOARD_PAD}px`,
      width: `${width}px`,
      height: `${thickness}px`,
      transform: 'scaleX(0)',
      animation: 'sweepX 260ms ease-out forwards',
      position: 'absolute',
      pointerEvents: 'none'
    };
  } else {
    const left = BOARD_PAD + sweep.value.col * STEP.value;
    const height = N * CELL + (N - 1) * GAP;
    return {
      top: `${BOARD_PAD}px`,
      left: `${left}px`,
      width: `${thickness}px`,
      height: `${height}px`,
      transform: 'scaleY(0)',
      animation: 'sweepY 260ms ease-out forwards',
      position: 'absolute',
      pointerEvents: 'none'
    };
  }
});


const grid = ref(null);

function key(r, c) { return `${r},${c}`; }

function loadLevel() {
  const map = levels.value[levelIndex.value];
  const { tiles: t, cells: c } = createLevelFromMap(map, {
    colors: COLORS,
    symbols: { "0": "empty", "1": "blocked", "#": "crate" },
  });

  tiles.value = t;
  cells.value = c;

  clearing.value = new Set();
  appearKeys.value = new Set();
  sweep.value = { active: false, row: null, col: null, type: null };
  bombFlash.value = { active: false, r: null, c: null };
  animating.value = false;

  movesLeft.value = START_MOVES;
  score.value = 0;
  showGameOver.value = false;
}

function restart() {
  if (!animating.value) loadLevel();
}

loadLevel();

function cellStyle(cellType) {
  const base = {
    width: `${CELL}px`,
    height: `${CELL}px`,
    borderRadius: `${Math.round(CELL * 0.18)}px`,
    display: "grid",
    placeItems: "center",
    boxSizing: "border-box",
    background: "transparent"
  };
  if (cellType === CellType.Block) {
    return { ...base,
      backgroundImage: `url(${blockedBlock})`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "108% 108%"
    };
  }
  if (cellType === CellType.Crate) {
    return { ...base,
      backgroundImage: `url(${crateBlock})`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "108% 108%"
    };
  }
  return base;
}

function tileStyle(val) {
  const inner = CELL;                  
  const rad = Math.round(CELL * 0.18);
  const img = isBoosterVal(val) ? BOOSTER_IMG[val]
                                : TILE_IMG[(val ?? 0) % TILE_IMG.length];
  return {
    width: `${inner}px`,
    height: `${inner}px`,
    borderRadius: `${rad}px`,
    backgroundImage: `url(${img})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "110% 110%", 
    display: "grid",
    placeItems: "center",
    boxSizing: "border-box",
  };
}

function boosterClass(v) {
  if (v === Booster.Cross) return "booster booster-cross";
  if (v === Booster.Bomb)  return "booster booster-bomb";
  return "";
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

function buildBoosterSpawnsFromMatches(matchesSet) {

  const N = tiles.value.length;
  const Key = (r, c) => `${r},${c}`;
  const inMatchesSet = (r, c) => matchesSet.has(Key(r, c));
  const mark = Array.from({ length: N }, () => new Uint8Array(N));
  const spawns = new Map();

  for (let r = 0; r < N; r++) {

    let c = 0;

    while (c < N) {
      if (!inMatchesSet(r, c)) { c++; continue; }
      const start = c;
      while (c < N && inMatchesSet(r, c)) c++;
      const len = c - start;
      if (len >= 3) for (let x = start; x < c; x++) mark[r][x] += 1;
      if (len >= 4) {
        const mid = start + Math.floor(len / 2);
        const k = Key(r, mid);
        if (!spawns.has(k)) spawns.set(k, { r, c: mid, type: "Cross" });
      }
    }
  }

  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      if (!inMatchesSet(r, c)) { r++; continue; }
      const start = r;
      while (r < N && inMatchesSet(r, c)) r++;
      const len = r - start;
      if (len >= 3) {
        for (let y = start; y < r; y++) {
          mark[y][c] += 1;
          if (mark[y][c] >= 2) {
            const k = Key(y, c);
            spawns.set(k, { r: y, c, type: "Bomb" });
          }
        }
      }
      if (len >= 4) {
        const mid = start + Math.floor(len / 2);
        const k = Key(mid, c);
        if (!spawns.has(k)) spawns.set(k, { r: mid, c, type: "Cross" });
      }
    }
  }

  return [...spawns.values()];
}

async function animateResolveCascade() {
  while (true) {
    const matches = findMatchesWithCells(tiles.value, cells.value);
    if (matches.size === 0) break;

    const spawns = buildBoosterSpawnsFromMatches(matches);
    for (const { r, c, type } of spawns) {
      if (cells.value[r][c] !== CellType.Empty) continue;
      const v = tiles.value[r][c];
      if (v == null || v < 0) continue;
      tiles.value[r][c] = (type === "Bomb") ? Booster.Bomb : Booster.Cross;
      matches.delete(key(r, c));
    }

    clearing.value = new Set(matches);
    const cratesNear = crateAdjacentsOf(matches);
    setCratesBreaking(cratesNear, true);
    await nextTick();
    await sleep(220);

    const gain = matches.size;
    if (gain > 0) score.value += gain;

    clearMatches(tiles.value, matches);
    await animateAndApplyCrateBreaks(cratesNear, 0);
    clearing.value.clear();
    await nextTick();

    collapseWithCells(tiles.value, cells.value);
    await nextTick(); await sleep(120);

    const newSpawns = [];
    const N = tiles.value.length;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
      if (cells.value[r][c] === CellType.Empty && tiles.value[r][c] == null) newSpawns.push(key(r, c));
    refillWithCells(tiles.value, cells.value, COLORS);
    appearKeys.value = new Set(newSpawns);
    await nextTick(); await sleep(180);
    appearKeys.value.clear();
  }
}

function boosterTypeOf(v) { return v === Booster.Cross ? "Cross" : v === Booster.Bomb ? "Bomb" : null; }

async function previewForType(pos, type) {
  if (type === "Cross") {
    sweep.value = { active: true, row: pos.r, col: null, type: 'row' };
    await nextTick(); await sleep(220);
    sweep.value = { active: true, row: null, col: pos.c, type: 'col' };
    await nextTick(); await sleep(220);
    sweep.value = { active: false, row: null, col: null, type: null };
  } else if (type === "Bomb") {
    bombFlash.value = { active: true, r: pos.r, c: pos.c };
    await nextTick(); await sleep(260);
    bombFlash.value = { active: false, r: null, c: null };
  }
}

function expandWithCrates(pos, type, cleared) {
  const N = tiles.value.length;
  const out = new Set(cleared);
  if (type === "Cross") {
    for (let c = 0; c < N; c++) if (cells.value[pos.r][c] === CellType.Crate) out.add(`${pos.r},${c}`);
    for (let r = 0; r < N; r++) if (cells.value[r][pos.c] === CellType.Crate) out.add(`${r},${pos.c}`);
  } else if (type === "Bomb") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = pos.r + dr, cc = pos.c + dc;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        if (cells.value[rr][cc] === CellType.Crate) out.add(`${rr},${cc}`);
      }
    }
  }
  return out;
}

function filterNonBoostersExcept(set, except) {
  const out = new Set();
  for (const k of set) {
    const [r, c] = k.split(",").map(Number);
    if (r === except.r && c === except.c) continue;
    const v = tiles.value[r]?.[c];
    if (!isBoosterVal(v)) out.add(k);
  }
  return out;
}

function applyClears(cleared) {
  for (const k of cleared) {
    const [r, c] = k.split(',').map(Number);
    if (cells.value[r][c] === CellType.Block) continue;
    if (cells.value[r][c] === CellType.Crate) cells.value[r][c] = CellType.Empty;
    if (tiles.value[r][c] != null) tiles.value[r][c] = null;
  }
}

function collectBoosterChain(startPos) {
  const size = tiles.value.length;
  const K = (r,c) => `${r},${c}`;
  const visited = new Set();
  const q = [];
  const steps = [];
  if (!inRange(startPos)) return steps;
  const v0 = tiles.value[startPos.r][startPos.c];
  if (!isBoosterVal(v0)) return steps;
  q.push(startPos);
  while (q.length) {
    const cur = q.shift();
    const kk = K(cur.r, cur.c);
    if (visited.has(kk)) continue;
    visited.add(kk);
    const v = tiles.value[cur.r]?.[cur.c];
    const t = boosterTypeOf(v);
    if (!t) continue;
    const affected = getBoosterClears(tiles.value, cells.value, cur);
    for (const k of affected) {
      const [r, c] = k.split(',').map(Number);
      const tv = tiles.value[r]?.[c];
      if (isBoosterVal(tv) && k !== kk && !visited.has(k)) q.push({ r, c });
    }
    steps.push({ pos: cur, type: t });
  }
  return steps;
  function inRange(p){ return p.r>=0 && p.c>=0 && p.r<size && p.c<size; }
}

async function runBoosterChainCore(startPos) {
  if (animating.value) return;
  animating.value = true;
  try {
    const chain = collectBoosterChain(startPos);
    if (!chain.length) { animating.value = false; return; }
    for (const step of chain) {
      const { pos, type } = step;

      const baseCleared = getBoosterClears(tiles.value, cells.value, pos);
      const withCrates = expandWithCrates(pos, type, baseCleared);
      const toRemove = filterNonBoostersExcept(withCrates, pos);
      const cratesHit  = onlyCrates(toRemove);
      const nonCrates  = new Set([...toRemove].filter(k => !cratesHit.has(k)));

      clearing.value = new Set(withCrates);
      await nextTick();
      await previewForType(pos, type);

      score.value += nonCrates.size;

      applyClears(nonCrates);
      if (tiles.value[pos.r]?.[pos.c] != null) tiles.value[pos.r][pos.c] = null;
      await animateAndApplyCrateBreaks(cratesHit, 220);

      await nextTick();
      await sleep(80);
      clearing.value.clear();
    }
    collapseWithCells(tiles.value, cells.value);
    await nextTick(); await sleep(120);
    const newSpawns = [];
    const N = tiles.value.length;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
      if (cells.value[r][c] === CellType.Empty && tiles.value[r][c] == null) newSpawns.push(`${r},${c}`);
    refillWithCells(tiles.value, cells.value, COLORS);
    appearKeys.value = new Set(newSpawns);
    await nextTick(); await sleep(180);
    appearKeys.value.clear();
    await animateResolveCascade();
  } finally {
    animating.value = false;
  }
}

function onTileClick(r, c) {
  if (animating.value || movesLeft.value <= 0 || showGameOver.value) return;
  const v = tiles.value[r][c];
  if (!isBoosterVal(v)) return;
  movesLeft.value -= 1;
  if (movesLeft.value < 0) movesLeft.value = 0;
  runBoosterChainCore({ r, c }).then(() => {
    if (movesLeft.value === 0) showGameOver.value = true;
  });
}

function cellFromNode(node) {
  const el = node instanceof Element ? node.closest(".cell") : null;
  if (!el) return null;
  const r = Number(el.getAttribute("data-r"));
  const c = Number(el.getAttribute("data-c"));
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  return { r, c };
}
function cellFromPageXY(pageX, pageY) {
  const clientX = pageX - window.scrollX;
  const clientY = pageY - window.scrollY;
  const node = document.elementFromPoint(clientX, clientY);
  return cellFromNode(node);
}
const deltaMap = {
  left:  { r: 0,  c: -1 },
  right: { r: 0,  c:  1 },
  up:    { r: -1, c:  0 },
  down:  { r: 1,  c:  0 },
};

function inBounds(p) {
  const N = tiles.value.length;
  return p.r >= 0 && p.c >= 0 && p.r < N && p.c < N;
}

async function swapThenActivateBoosters(from, to) {
  if (movesLeft.value <= 0 || showGameOver.value) return;
  if (!inBounds(from) || !inBounds(to)) return;

  const preA = tiles.value[from.r][from.c];
  const preB = tiles.value[to.r][to.c];

  movesLeft.value -= 1;
  if (movesLeft.value < 0) movesLeft.value = 0;

  animating.value = true;
  swap(tiles.value, from, to);
  await nextTick();
  await sleep(120);
  animating.value = false;

  const targets = [];
  if (isBoosterVal(preA)) targets.push({ r: to.r, c: to.c });
  if (isBoosterVal(preB)) targets.push({ r: from.r, c: from.c });

  if (targets.length) {
    for (const pos of targets) await runBoosterChainCore(pos);
  } else {
    animating.value = true;
    await animateResolveCascade();
    animating.value = false;
  }

  if (movesLeft.value === 0) showGameOver.value = true;
}

let stopWatch = null;
onMounted(() => {
  const swipe = usePointerSwipe(grid, { threshold: 4, pointerTypes: ["mouse", "touch", "pen"] });

  stopWatch = watch(swipe.isSwiping, async (now, was) => {
    if (was && !now) {
      if (animating.value || movesLeft.value <= 0 || showGameOver.value) return;
      const dir = swipe.direction.value;
      const s = swipe.coordsStart.value;
      if (!dir || !s) return;
      const from = cellFromPageXY(s.x, s.y);
      if (!from) return;
      const delta = deltaMap[dir];
      if (!delta) return;
      const to = { r: from.r + delta.r, c: from.c + delta.c };
      if (!inBounds(to)) return;

      const a = tiles.value[from.r]?.[from.c];
      const b = tiles.value[to.r]?.[to.c];
      if (isBoosterVal(a) || isBoosterVal(b)) {
        await swapThenActivateBoosters(from, to);
        return;
      }
      if (!canSwap(cells.value, from, to)) return;
      if (!wouldSwapCreateMatch(tiles.value, cells.value, from, to)) return;
      movesLeft.value -= 1;
      if (movesLeft.value < 0) movesLeft.value = 0;
      animating.value = true;
      swap(tiles.value, from, to);
      await nextTick(); await sleep(120);
      await animateResolveCascade();
      animating.value = false;
      if (movesLeft.value === 0) showGameOver.value = true;
    }
  });

  let startCell = null;
  let startXY = null;
  const onDown = (e) => {
    if (e.cancelable) e.preventDefault();
    startCell = cellFromNode(e.target);
    startXY = { x: e.pageX, y: e.pageY };
  };
  const onUp = async (e) => {
    if (!startCell || !startXY) return;
    if (animating.value || movesLeft.value <= 0 || showGameOver.value) { startCell = null; startXY = null; return; }
    const dx = e.pageX - startXY.x;
    const dy = e.pageY - startXY.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX < 4 && absY < 4) { startCell = null; startXY = null; return; }
    const dir = absX > absY ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const delta = deltaMap[dir];
    if (!delta) { startCell = null; startXY = null; return; }
    const from = startCell;
    const to = { r: from.r + delta.r, c: from.c + delta.c };
    if (!inBounds(to)) { startCell = null; startXY = null; return; }

    const a = tiles.value[from.r]?.[from.c];
    const b = tiles.value[to.r]?.[to.c];
    if (isBoosterVal(a) || isBoosterVal(b)) {
      await swapThenActivateBoosters(from, to);
      startCell = null; startXY = null; return;
    }
    if (!canSwap(cells.value, from, to)) { startCell = null; startXY = null; return; }
    if (!wouldSwapCreateMatch(tiles.value, cells.value, from, to)) { startCell = null; startXY = null; return; }
    movesLeft.value -= 1;
    if (movesLeft.value < 0) movesLeft.value = 0;
    animating.value = true;
    swap(tiles.value, from, to);
    await nextTick(); await sleep(120);
    await animateResolveCascade();
    animating.value = false;
    if (movesLeft.value === 0) showGameOver.value = true;

    startCell = null; startXY = null;
  };
  const el = grid.value;
  el.addEventListener("pointerdown", onDown, { passive: false });
  el.addEventListener("pointerup", onUp, { passive: false });

  onBeforeUnmount(() => {
    if (stopWatch) stopWatch();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointerup", onUp);
  });
});
</script>

<style scoped>
.page {
  min-height:100vh;
  display:grid;
  place-items:center;
  gap:12px;background:#1e2230
}
.topbar {
  position:absolute;
  top:12px;left:50%;
  transform:translateX(-50%);
  display:flex;
  gap:16px;
  align-items:center;
  color:#fff;
  font-weight:600
}

.board {
  position:relative
}
.grid {
  position:relative;
  touch-action:none;
  user-select:none
}
.row {
  display:flex
}

.cell {
  display:grid;
  place-items:center;
  box-sizing:border-box
}
.tile {
  box-sizing:border-box;
  display:grid;
  place-items:center;
  transition:transform 120ms ease, opacity 220ms ease;
  background-size:cover!important;
  background-repeat:no-repeat!important
}
.tile-clearing {
  opacity:0;
  transform:scale(0.85)
}
.tile-appear {
  opacity:0;
  transform:translateY(-12px) scale(0.9);
  animation:appear 180ms ease-out forwards
}
.sweep {
  position:absolute;
  pointer-events:none;
  background: radial-gradient(
    closest-side,
    rgba(255,255,255,.8),
    rgba(255,255,255,.18),
    rgba(255,255,255,0));
  border-radius:8px
}
.bomb-flash {
  position:absolute;
  border-radius:50%;
  background:radial-gradient(
    circle,
    rgba(255,230,120,.9) 0%,
    rgba(255,180,0,.65) 50%,
    rgba(255,140,0,0) 70%);
  pointer-events:none;
  }

.modal {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.5);
  display:grid;
  place-items:center;
  z-index:50
}
.modal-card {
  background:#fff;
  padding:16px 20px;
  border-radius:12px;
  min-width:260px;
  box-shadow:0 10px 30px rgba(0,0,0,.25)
}

@keyframes appear {
  to  { opacity:1;transform:translateY(0) scale(1) }
}
@keyframes bombFlash {
  0%    { transform:scale(.6);opacity:.9  }
  70%   { transform:scale(1.2);opacity:.6 }
  100%  { transform:scale(1.6);opacity:0  }
}
@keyframes sweepX {
  to  { transform:scaleX(1) }
}
@keyframes sweepY {
  to  { transform:scaleY(1) }
}
@keyframes crateHitShake {
  0%   { transform: scale(1)   rotate(0deg);   filter: brightness(1);   }
  20%  { transform: scale(1.05) rotate(-2deg); filter: brightness(1.1); }
  40%  { transform: scale(1.03) rotate(2deg);  filter: brightness(1.05);}
  60%  { transform: scale(1.06) rotate(-1deg); filter: brightness(1.12);}
  80%  { transform: scale(1.02) rotate(1deg);  filter: brightness(1.0); }
  100% { transform: scale(1)   rotate(0deg);   filter: brightness(1);   }
}

.cell.crate-breaking {
  animation: crateHitShake 220ms ease-out;
  position: relative;
}
.cell.crate-breaking::after {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 10px;
  pointer-events: none;
  background: radial-gradient(
    circle,
    rgba(255,240,170,0.9) 0%,
    rgba(255,200,80,0.35) 40%,
    rgba(255,160,0,0.0) 65%);
  opacity: 0;
  animation: crateFlash 220ms ease-out forwards;
}

@keyframes crateFlash {
  0%   { opacity: .9; transform: scale(.85); }
  70%  { opacity: .5; transform: scale(1.1); }
  100% { opacity: 0;  transform: scale(1.2); }
}
</style>