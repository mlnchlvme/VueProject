<template>
  <div>

    <div role="grid">
      <div v-for="(row, r) in board" :key="r" role="row" style="display:flex">
        <div
          v-for="(val, c) in row"
          :key="c"
          role="gridcell"
          draggable="true"
          @dragstart="onDragStart(r, c, $event)"
          @dragover.prevent="onDragOver(r, c, $event)"
          @drop="onDrop(r, c, $event)"
          @dragend="onDragEnd"
          :style="tileStyle(val, r, c)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import {
  createBoard, swap, resolve, swapLeadsToMatch, adjacent
} from "./main.js";

const SIZE = 8;
const COLORS = 5;

const PALETTE = ["#ffd166","#06d6a0","#ef476f","#118ab2","#c6a7ff"];

const board = ref(createBoard(SIZE, COLORS));
const dragFrom = ref(null);
const dragOverCell = ref(null);


function isHover(r, c) {
  return dragOverCell.value && dragOverCell.value.r === r && dragOverCell.value.c === c;
}

function isFrom(r, c) {
  return dragFrom.value && dragFrom.value.r === r && dragFrom.value.c === c;
}

function tileStyle(val, r, c) {
  const bg = PALETTE[val % PALETTE.length] ?? "#ddd";
  const from = isFrom(r, c);
  const over = isHover(r, c);
  return {
    width: "36px",
    height: "36px",
    margin: "2px",
    borderRadius: "8px",
    border: from ? "2px solid #333" : over ? "2px dashed #333" : "1px solid #999",
    background: bg,
    boxSizing: "border-box",
    cursor: "grab"
  };
}

function onDragStart(r, c, e) {
  dragFrom.value = { r, c };

  try {
    const img = new Image();
    img.width = img.height = 1;
    e.dataTransfer.setDragImage(img, 0, 0);
  } catch {}
  e.dataTransfer.setData("text/plain", `${r},${c}`);
}

function onDragOver(r, c, e) {
  dragOverCell.value = { r, c };
}

function onDrop(r, c, e) {
  const data = e.dataTransfer.getData("text/plain");
  const [rs, cs] = data.split(",").map(Number);
  const a = { r: rs, c: cs };
  const b = { r, c };

  if (adjacent(a, b) && swapLeadsToMatch(board.value, a, b)) {
    swap(board.value, a, b);
    resolve(board.value, COLORS);
  }
  dragFrom.value = null;
  dragOverCell.value = null;
}

function onDragEnd() {
  dragFrom.value = null;
  dragOverCell.value = null;
}
</script>
