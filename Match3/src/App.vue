<template>
  <div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <select v-model.number="levelIndex" @change="loadLevel">
        <option v-for="(lv, i) in levels" :key="i" :value="i">Level {{ i + 1 }}</option>
      </select>
      <button @click="restart" :disabled="animating">Restart</button>
    </div>

    <div ref="grid" role="grid" class="grid">
      <div v-for="(row, r) in tiles" :key="r" role="row" class="row">
        <div
          v-for="(val, c) in row"
          :key="c"
          class="cell"
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
              clearing.has(key(r,c)) ? 'tile-clearing' : '',
              appearKeys.has(key(r,c)) ? 'tile-appear' : ''
            ]"
            :style="tileStyle(val)"
            role="gridcell"
            @click="onTileClick(r, c)"
          >
            <svg v-if="val === Booster.Row" viewBox="0 0 100 100" class="g">
              <rect x="10" y="45" width="80" height="10" rx="5" />
            </svg>
            <svg v-else-if="val === Booster.Col" viewBox="0 0 100 100" class="g">
              <rect x="45" y="10" width="10" height="80" rx="5" />
            </svg>
          </div>
        </div>
      </div>

      <div v-if="sweep.active" class="sweep" :style="sweepStyle"></div>
      <div v-if="bombFlash.active" class="bomb-flash" :style="bombStyle"></div>
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

const COLORS = 5;
const PALETTE = ["#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#c6a7ff"];
const Booster = { Cross: -1, Bomb: -2 };
const isBoosterVal = (v) => v === Booster.Cross || v === Booster.Bomb;

const levels = ref([
  [
    "111000000",
    "110000000",
    "1000#0000",
    "000##0000",
    "000000000",
    "000000000",
    "00000#001",
    "000000011",
    "000000111",
  ],
  [
    "111100000",
    "100000000",
    "1000##000",
    "1000##000",
    "000000000",
    "00000#000",
    "00000#000",
    "000000001",
    "111111111",
  ],
  [
    "111110000",
    "100000000",
    "10000##00",
    "10000##00",
    "000000000",
    "000000000",
    "0000000#0",
    "0000000#0",
    "000000011",
  ],
  [
    "111110000",
    "111000000",
    "11000##00",
    "100####00",
    "000000000",
    "000000000",
    "0000000#0",
    "00######0",
    "000000011",
  ],
]);

const levelIndex = ref(0);
const tiles = ref([]);
const cells = ref([]);
const animating = ref(false);

const clearing = ref(new Set());
const appearKeys = ref(new Set());
const bombFlash = ref({ active: false, r: null, c: null });
const bombStyle = computed(() => {
  if (!bombFlash.value.active) return {};
  const cell = 44;
  const top = bombFlash.value.r * cell + 2;
  const left = bombFlash.value.c * cell + 2;
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `36px`,
    height: `36px`,
    animation: 'bombFlash 260ms ease-out forwards',
  };
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
  clearing.value.clear();
  appearKeys.value.clear();
}
function restart() { if (!animating.value) loadLevel(); }
loadLevel();

function cellStyle(cellType) {
  const base = {
    width: "40px",
    height: "40px",
    margin: "2px",
    borderRadius: "8px",
    display: "grid",
    placeItems: "center",
    boxSizing: "border-box",
  };
  if (cellType === CellType.Block) return { ...base, background: "#2f3545", border: "1px solid #1d2130" };
  if (cellType === CellType.Crate) return { ...base, background: "#b88853", border: "1px solid #8b5e34" };
  return { ...base, background: "#e7ecf5", border: "1px solid #b8c3d6" };
}
function tileStyle(val) {
  if (!isBoosterVal(val)) {
    const bg = PALETTE[val % PALETTE.length] ?? "#ddd";
    return {
      width: "34px",
      height: "34px",
      borderRadius: "8px",
      background: bg,
      border: "1px solid #999",
      boxSizing: "border-box",
      display: "grid",
      placeItems: "center",
    };
  }
  return {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    background: "#ffffff",
    border: "2px solid #333",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
  };
}
function boosterClass(v) {
  if (v === Booster.Cross) return "booster booster-cross";
  if (v === Booster.Bomb)  return "booster booster-bomb";
  return "";
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    await nextTick();
    await sleep(220);

    clearMatches(tiles.value, matches);
    breakAdjacentCrates(cells.value, matches);
    clearing.value.clear();
    await nextTick();

    collapseWithCells(tiles.value, cells.value);
    await nextTick();
    await sleep(120);

    const newSpawns = [];
    const N = tiles.value.length;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (cells.value[r][c] === CellType.Empty && tiles.value[r][c] == null) {
          newSpawns.push(key(r, c));
        }
      }
    }
    refillWithCells(tiles.value, cells.value, COLORS);
    appearKeys.value = new Set(newSpawns);
    await nextTick();
    await sleep(180);
    appearKeys.value.clear();
  }
}

const sweep = ref({ active: false, row: null, col: null, type: null });
const sweepStyle = computed(() => {
  if (!sweep.value.active) return {};
  const N = tiles.value.length;
  const cellW = 44, cellH = 44;
  if (sweep.value.type === 'row') {
    const top = sweep.value.row * cellH;
    return {
      top: `${top + 2}px`,
      left: `2px`,
      width: `${N * cellW - 4}px`,
      height: `36px`,
      transform: 'scaleX(0)',
      animation: 'sweepX 260ms ease-out forwards',
    };
  } else {
    const left = sweep.value.col * cellW;
    return {
      top: `2px`,
      left: `${left + 2}px`,
      width: `36px`,
      height: `${N * cellH - 4}px`,
      transform: 'scaleY(0)',
      animation: 'sweepY 260ms ease-out forwards',
    };
  }
});

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
    steps.push({ pos: cur, type: t, cleared: affected });
  }
  return steps;
  function inRange(p){ return p.r>=0 && p.c>=0 && p.r<size && p.c<size; }
}

async function runBoosterChain(startPos, force = false) {
  if (animating.value && !force) return;
  animating.value = true;
  try {
    const chain = collectBoosterChain(startPos);
    if (!chain.length) { animating.value = false; return; }
    for (const step of chain) {
      const { pos, type, cleared } = step;
      clearing.value = new Set(cleared);
      await nextTick();
      await previewForType(pos, type);
      applyClears(cleared);
      if (tiles.value[pos.r]?.[pos.c] != null) tiles.value[pos.r][pos.c] = null;
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
  if (animating.value) return;
  const v = tiles.value[r][c];
  if (!isBoosterVal(v)) return;
  runBoosterChain({ r, c });
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

async function swapThenActivateBoosters(from, to) {
  const preA = tiles.value[from.r][from.c];
  const preB = tiles.value[to.r][to.c];

  const targets = [];
  if (isBoosterVal(preA)) targets.push({ r: to.r, c: to.c });
  if (isBoosterVal(preB)) targets.push({ r: from.r, c: from.c });

  animating.value = true;
  try {
    swap(tiles.value, from, to);
    await nextTick();
    await sleep(120);

    if (targets.length) {
      for (const pos of targets) {
        await runBoosterChain(pos, true);
      }
    } else {
      const vA = tiles.value[from.r][from.c];
      const vB = tiles.value[to.r][to.c];
      if (isBoosterVal(vA)) await runBoosterChain({ r: from.r, c: from.c }, true);
      if (isBoosterVal(vB)) await runBoosterChain({ r: to.r, c: to.c }, true);
    }
  } finally {
    animating.value = false;
  }
}

let stopWatch = null;
onMounted(() => {
  const swipe = usePointerSwipe(grid, {
    threshold: 4,
    pointerTypes: ["mouse", "touch", "pen"],
  });

  stopWatch = watch(swipe.isSwiping, async (now, was) => {
    if (was && !now) {
      if (animating.value) return;
      const dir = swipe.direction.value;
      const s = swipe.coordsStart.value;
      if (!dir || !s) return;
      const from = cellFromPageXY(s.x, s.y);
      if (!from) return;
      const delta = deltaMap[dir];
      if (!delta) return;
      const to = { r: from.r + delta.r, c: from.c + delta.c };
      const a = tiles.value[from.r]?.[from.c];
      const b = tiles.value[to.r]?.[to.c];
      if (isBoosterVal(a) || isBoosterVal(b)) {
        try { await swapThenActivateBoosters(from, to); }
        finally { animating.value = false; }
        return;
      }
      if (!canSwap(cells.value, from, to)) return;
      if (!wouldSwapCreateMatch(tiles.value, cells.value, from, to)) return;
      animating.value = true;
      try {
        swap(tiles.value, from, to);
        await nextTick();
        await sleep(120);
        await animateResolveCascade();
      } finally {
        animating.value = false;
      }
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
    if (animating.value) { startCell = null; startXY = null; return; }
    const dx = e.pageX - startXY.x;
    const dy = e.pageY - startXY.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX < 4 && absY < 4) { startCell = null; startXY = null; return; }
    const dir = absX > absY ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const delta = deltaMap[dir];
    if (!delta) { startCell = null; startXY = null; return; }
    const from = startCell;
    const to = { r: from.r + delta.r, c: from.c + delta.c };
    const a = tiles.value[from.r]?.[from.c];
    const b = tiles.value[to.r]?.[to.c];
    if (isBoosterVal(a) || isBoosterVal(b)) {
      try { await swapThenActivateBoosters(from, to); }
      finally { animating.value = false; }
      startCell = null; startXY = null; return;
    }
    if (!canSwap(cells.value, from, to)) { startCell = null; startXY = null; return; }
    if (!wouldSwapCreateMatch(tiles.value, cells.value, from, to)) { startCell = null; startXY = null; return; }
    animating.value = true;
    try {
      swap(tiles.value, from, to);
      await nextTick();
      await sleep(120);
      await animateResolveCascade();
    } finally {
      animating.value = false;
    }
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
.grid { position: relative; touch-action:none; user-select:none; }
.row { display:flex; }
.cell {
  width: 40px; height: 40px; margin: 2px; border-radius: 8px;
  display: grid; place-items: center; box-sizing: border-box;
}
.tile {
  width: 34px; height: 34px; border-radius: 8px; box-sizing: border-box;
  display: grid; place-items: center;
  transition: transform 120ms ease, opacity 220ms ease, background 120ms ease, border 120ms ease;
}
.tile-clearing { opacity: 0; transform: scale(0.85); }
.tile-appear {
  opacity: 0; transform: translateY(-12px) scale(0.9);
  animation: appear 180ms ease-out forwards;
}
.booster {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #fff;
  border: 2px solid #333;
  font-weight: 800;
  font-size: 20px;
  line-height: 1;
  color: #333;
}
.booster-cross::after { content: "+"; }
.booster-bomb::after  { content: "*"; }
@keyframes appear { to { opacity: 1; transform: translateY(0) scale(1); } }
.booster { background:#fff !important; border:2px solid #333 !important; }
.g { width: 22px; height: 22px; }
.booster-row .g rect { fill:#333; }
.booster-col .g rect { fill:#333; }
.sweep {
  position: absolute;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(255,255,255,0.8), rgba(255,255,255,0.2), rgba(255,255,255,0));
  mix-blend-mode: screen;
  border-radius: 8px;
}
.bomb-flash {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,230,120,0.9) 0%, rgba(255,180,0,0.65) 50%, rgba(255,140,0,0.0) 70%);
  pointer-events: none;
}
@keyframes bombFlash {
  0%   { transform: scale(0.6); opacity: 0.9; }
  70%  { transform: scale(1.2); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes sweepX { to { transform: scaleX(1); } }
@keyframes sweepY { to { transform: scaleY(1); } }
</style>
