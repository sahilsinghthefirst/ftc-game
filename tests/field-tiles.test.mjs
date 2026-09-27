import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_TEETH,
  insetOutline,
  tileEdges,
  tileOutline,
} from '../app/field-tiles.ts';

const TILES = 6;
const SIZE = 4;
const DEPTH = SIZE * 0.042;
const SEAM = 0.07;

// Every tile's outline, placed on the field grid.
const place = (points, column, row) =>
  points.map(([x, y]) => [
    x + (column + 0.5) * SIZE - (TILES * SIZE) / 2,
    y + (row + 0.5) * SIZE - (TILES * SIZE) / 2,
  ]);
const full = [];
const inset = [];
for (let column = 0; column < TILES; column++)
  for (let row = 0; row < TILES; row++) {
    const outline = tileOutline(SIZE, DEPTH, tileEdges(column, row, TILES));
    full.push({ column, row, points: place(outline, column, row) });
    inset.push({
      column,
      row,
      points: place(insetOutline(outline, SEAM / 2), column, row),
    });
  }

const inside = ([x, y], points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
};

const distanceToOutline = ([x, y], points) => {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
    );
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
};

test('full-size tiles cover the field exactly: no gaps, no overlaps', () => {
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const half = (TILES * SIZE) / 2;
  for (let n = 0; n < 4000; n++) {
    const point = [(random() * 2 - 1) * half, (random() * 2 - 1) * half];
    const owners = full.filter((tile) => inside(point, tile.points));
    // Points exactly on a boundary are measure-zero; random ones never are.
    assert.equal(
      owners.length,
      1,
      `point ${point.join(',')} is in ${owners.length} tiles`,
    );
  }
});

test('neighbouring tiles interlock with teeth on every shared edge', () => {
  const tile = tileOutline(SIZE, DEPTH, tileEdges(2, 2, TILES));
  // Four toothed edges: corners plus (TEETH - 2) teeth of 3 points each, plus
  // the first flat segment's end, per edge.
  assert.equal(tile.length, 4 * (1 + 1 + (TILE_TEETH - 2) * 3));
  // A corner tile has two straight outside edges.
  const corner = tileOutline(SIZE, DEPTH, tileEdges(0, 0, TILES));
  assert.equal(corner.length, 2 + 2 * (1 + 1 + (TILE_TEETH - 2) * 3));
});

test('the seam between neighbours is the same width all the way round', () => {
  const byCell = new Map(
    inset.map((tile) => [`${tile.column},${tile.row}`, tile]),
  );
  let checked = 0;
  for (const tile of inset) {
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
    ]) {
      const neighbour = byCell.get(`${tile.column + dc},${tile.row + dr}`);
      if (!neighbour) continue;
      // Midpoints of this tile's edges that face the neighbour.
      const { points } = tile;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const gap = distanceToOutline(mid, neighbour.points);
        if (gap > SEAM * 3) continue;
        checked += 1;
        // Never touching, never a wide hole: always one seam wide.
        assert.ok(
          Math.abs(gap - SEAM) < SEAM * 0.02,
          `seam ${gap.toFixed(4)} between ${tile.column},${tile.row} and its neighbour`,
        );
        assert.ok(!inside(mid, neighbour.points), 'tiles overlap');
      }
    }
  }
  // Every shared edge was measured along its teeth.
  assert.ok(checked > 60 * (TILE_TEETH - 2) * 2, `only ${checked} checked`);
});
