<template>
  <div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <select v-model.number="levelIndex" @change="loadLevel">
        <option v-for="(lv, i) in levels" :key="i" :value="i">Level {{ i + 1 }}</option>
      </select>
      <button @click="restart">Restart</button>
    </div>

    <div ref="grid" role="grid" style="touch-action:none; user-select:none;">
      <div v-for="(row, r) in tiles" :key="r" role="row" style="display:flex">
        <div
          v-for="(val, c) in row"
          :key="c"
          class="cell"
          :data-r="r"
          :data-c="c"
          :style="cellStyle(cells[r][c])"
          style="touch-action:none; cursor:pointer;"
        >
          <div
            v-if="val != null"
            class="tile"
            :class="boosterClass(val)"
            :style="tileStyle(val)"
            role="gridcell"
            style="touch-action:none"
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
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { usePointerSwipe } from "@vueuse/core";
import {
  CellType,
  createLevelFromMap,
  applyMove,
  activateBooster,
} from "./matchCore.js";

const COLORS = 5;
const PALETTE = ["#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#c6a7ff"];

const Booster = { Row: -1, Col: -2 };
const isBoosterVal = (v) => v === Booster.Row || v === Booster.Col;

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
]);

const levelIndex = ref(0);
const tiles = ref([]);
const cells = ref([]);

function loadLevel() {
  const map = levels.value[levelIndex.value];
  const { tiles: t, cells: c } = createLevelFromMap(map, {
    colors: COLORS,
    symbols: { "0": "empty", "1": "blocked", "#": "crate" },
  });
  tiles.value = t;
  cells.value = c;
}
function restart() { loadLevel(); }
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
  if (v === Booster.Row) return "booster booster-row";
  if (v === Booster.Col) return "booster booster-col";
  return "";
}

function onTileClick(r, c) {
  const v = tiles.value[r][c];
  if (!isBoosterVal(v)) return;
  activateBooster(tiles.value, cells.value, { r, c }, COLORS);
}

const grid = ref(null);

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

let stopWatch = null;
onMounted(() => {
  const swipe = usePointerSwipe(grid, {
    threshold: 4,
    pointerTypes: ["mouse", "touch", "pen"],
  });

  stopWatch = watch(swipe.isSwiping, (now, was) => {
    if (was && !now) {
      const dir = swipe.direction.value;
      const s = swipe.coordsStart.value;
      if (!dir || !s) return;
      const from = cellFromPageXY(s.x, s.y);
      if (!from) return;
      const delta = deltaMap[dir];
      if (!delta) return;
      const to = { r: from.r + delta.r, c: from.c + delta.c };
      applyMove(tiles.value, cells.value, from, to, COLORS);
    }
  });

  let startCell = null;
  let startXY = null;
  const onDown = (e) => {
    if (e.cancelable) e.preventDefault();
    startCell = cellFromNode(e.target);
    startXY = { x: e.pageX, y: e.pageY };
  };
  const onUp = (e) => {
    if (!startCell || !startXY) return;
    const dx = e.pageX - startXY.x;
    const dy = e.pageY - startXY.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX < 4 && absY < 4) { startCell = null; startXY = null; return; }
    const dir = absX > absY ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const delta = deltaMap[dir];
    if (!delta) { startCell = null; startXY = null; return; }
    const from = startCell;
    const to = { r: from.r + delta.r, c: from.c + delta.c };
    applyMove(tiles.value, cells.value, from, to, COLORS);
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
.cell, .tile { pointer-events: auto; }
.booster .g { width: 22px; height: 22px; }
.booster-row .g rect { fill: #333; }
.booster-col .g rect { fill: #333; }
</style>
