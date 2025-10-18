<!-- Match3Levels.vue -->
<template>
  <div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <select v-model.number="levelIndex" @change="loadLevel">
        <option v-for="(lv, i) in levels" :key="i" :value="i">Level {{ i + 1 }}</option>
      </select>
      <button @click="restart">Restart</button>
    </div>

    <div role="grid">
      <div v-for="(row, r) in tiles" :key="r" role="row" style="display:flex">
        <!-- подложка клетки -->
        <div
          v-for="(val, c) in row"
          :key="c"
          :style="cellStyle(cells[r][c])"
        >
          <!-- плитка (если есть) -->
          <div
            v-if="val != null"
            draggable="true"
            @dragstart="onDragStart(r, c, $event)"
            @dragover.prevent="onDragOver(r, c, $event)"
            @drop="onDrop(r, c, $event)"
            @dragend="onDragEnd"
            :style="tileStyle(val, r, c)"
            role="gridcell"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { swap, adjacent } from "./matchCore.js";
import {
  CellType, createLevel,
  resolveWithCells, swapLeadsToMatchWithCells, canSwap
} from "./matchCore.js";

const COLORS = 5;
const SIZE = 9;
const PALETTE = ["#ffd166","#06d6a0","#ef476f","#118ab2","#c6a7ff"];

const levels = ref([

  { size: SIZE, colors: COLORS, blocked: [], crates: [] },

  { size: SIZE, colors: COLORS, 
    blocked: [
      {r:0,c:0},
      {r:0,c:1},
      {r:0,c:2},
      {r:1,c:0}, 
      {r:1,c:1}, 
      {r:2,c:0}, 
    ], 
    crates: [] 
  },

  { size: SIZE, colors: COLORS, 
    blocked: [
      {r:1,c:1},
      {r:1,c:2},
      {r:1,c:3},
      {r:2,c:1}
    ], 
    crates: [
      {r:4,c:4},
      {r:4,c:5},
      {r:5,c:4}
    ] 
  },

]);

const levelIndex = ref(0);
const tiles = ref(null);
const cells = ref(null);

const dragFrom = ref(null);
const dragOverCell = ref(null);

function loadLevel() {
  const cfg = levels.value[levelIndex.value];
  const { tiles: t, cells: c } = createLevel(cfg);
  tiles.value = t;
  cells.value = c;
  dragFrom.value = null;
  dragOverCell.value = null;
}
function restart() { loadLevel(); }
loadLevel();

function cellStyle(cellType) {
  const base = {
    width: "40px", height: "40px", margin: "2px", borderRadius: "8px",
    display: "grid", placeItems: "center", boxSizing: "border-box",
  };
  if (cellType === CellType.Block) {
    return { ...base, background: "#2f3545", border: "1px solid #1d2130" };
  }
  if (cellType === CellType.Crate) {
    return { ...base, background: "#b88853", border: "1px solid #8b5e34" };
  }
  return { ...base, background: "#e7ecf5", border: "1px solid #b8c3d6" }; 
}

function isFrom(r,c) { return dragFrom.value && dragFrom.value.r === r && dragFrom.value.c === c; }
function isHover(r,c) { return dragOverCell.value && dragOverCell.value.r === r && dragOverCell.value.c === c; }

function tileStyle(val, r, c) {
  const bg = PALETTE[val % PALETTE.length] ?? "#ddd";
  const from = isFrom(r,c);
  const over = isHover(r,c);
  return {
    width: "34px", height: "34px", borderRadius: "8px",
    background: bg, border: from ? "2px solid #333" : over ? "2px dashed #333" : "1px solid #999",
    cursor: "grab", boxSizing: "border-box",
  };
}

function onDragStart(r, c, e) {
  dragFrom.value = { r, c };
  try {
    const img = new Image(); img.width = img.height = 1;
    e.dataTransfer.setDragImage(img, 0, 0);
  } catch {}
  e.dataTransfer.setData("text/plain", `${r},${c}`);
}
function onDragOver(r, c, e) { dragOverCell.value = { r, c }; }
function onDrop(r, c, e) {
  const [rs, cs] = e.dataTransfer.getData("text/plain").split(",").map(Number);
  const a = { r: rs, c: cs }, b = { r, c };

  if (!adjacent(a, b) || !canSwap(cells.value, a, b)) {
    dragFrom.value = null; dragOverCell.value = null; return;
  }
  if (swapLeadsToMatchWithCells(tiles.value, cells.value, a, b)) {
    swap(tiles.value, a, b);
    resolveWithCells(tiles.value, cells.value, levels.value[levelIndex.value].colors);
  }
  dragFrom.value = null; dragOverCell.value = null;
}
function onDragEnd() { dragFrom.value = null; dragOverCell.value = null; }
</script>
