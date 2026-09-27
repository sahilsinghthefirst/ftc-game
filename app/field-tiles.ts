// Outlines of the interlocking foam tiles that make up the field, as plain
// 2D points so they can be checked without a renderer.
//
// Each tile's outline is first drawn at full size, where two neighbours share
// exactly the same toothed boundary. It is then pulled in evenly all round,
// which leaves the same thin seam between neighbours everywhere - along the
// sides of each tooth as well as across its tip - so tiles never touch,
// overlap or flicker against each other.

export type Point = [number, number];

// Teeth per shared edge (odd, see below).
export const TILE_TEETH = 11;

// `edges` runs [back, right, front, left]; +1 and -1 give opposite tooth
// patterns, and 0 a straight outside edge. Corners wind counter-clockwise.
export function tileOutline(
  size: number,
  depth: number,
  edges: number[],
): Point[] {
  const half = size / 2;
  const corners: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const points: Point[] = [];
  for (let edge = 0; edge < 4; edge++) {
    const [fromX, fromY] = corners[edge];
    const [toX, toY] = corners[(edge + 1) % 4];
    points.push([fromX, fromY]);
    const direction = edges[edge];
    if (!direction) continue;
    // Along the edge, and straight out of the tile.
    const ux = Math.sign(toX - fromX);
    const uy = Math.sign(toY - fromY);
    const nx = uy;
    const ny = -ux;
    const step = size / TILE_TEETH;
    // Dovetailed like real EVA tile tabs: each tab is wider at its tip than
    // at its root, which is what keeps the tiles locked together.
    const bevel = -step * 0.12;
    // The first and last segments stay flat so corners never collide. The
    // count is odd, so a neighbour walking the same edge the other way sees
    // the same pattern flipped: its notches take these teeth exactly.
    for (let i = 1; i < TILE_TEETH - 1; i++) {
      const out = (i % 2 ? 1 : -1) * direction * depth;
      const sx = fromX + ux * step * i;
      const sy = fromY + uy * step * i;
      const ex = sx + ux * step;
      const ey = sy + uy * step;
      if (i === 1) points.push([sx, sy]);
      points.push([sx + nx * out + ux * bevel, sy + ny * out + uy * bevel]);
      points.push([ex + nx * out - ux * bevel, ey + ny * out - uy * bevel]);
      points.push([ex, ey]);
    }
  }
  return points;
}

// Pull a counter-clockwise outline in by `distance` everywhere: each corner
// moves along its bisector just far enough that both of its edges end up
// exactly `distance` inside where they were.
export function insetOutline(points: Point[], distance: number): Point[] {
  const count = points.length;
  const inward = (from: Point, to: Point): Point => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    return [-dy / length, dx / length];
  };
  return points.map((point, i) => {
    const before = inward(points[(i - 1 + count) % count], point);
    const after = inward(point, points[(i + 1) % count]);
    const bx = before[0] + after[0];
    const by = before[1] + after[1];
    const length = Math.hypot(bx, by);
    const mx = bx / length;
    const my = by / length;
    const reach = distance / (mx * before[0] + my * before[1]);
    return [point[0] + mx * reach, point[1] + my * reach];
  });
}

// Which way the teeth run on each seam of the grid, chosen so every shared
// edge gets opposite patterns on its two sides.
export function tileEdges(column: number, row: number, tiles: number) {
  const vertical = (c: number, r: number) => ((c + r) % 2 === 0 ? 1 : -1);
  const horizontal = (c: number, r: number) => ((c + r) % 2 === 0 ? -1 : 1);
  return [
    row === 0 ? 0 : -horizontal(column, row - 1),
    column === tiles - 1 ? 0 : vertical(column, row),
    row === tiles - 1 ? 0 : horizontal(column, row),
    column === 0 ? 0 : -vertical(column - 1, row),
  ];
}
