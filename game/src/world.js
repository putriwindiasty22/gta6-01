// Port Meridian itself: the road grid, the blocks between the roads, the buildings,
// parks and trees that fill them, the beach and the sea along the south edge, and the
// collision and road helpers the rest of the game uses. The city is built once from a
// seeded random, so the same seed always builds the same streets.
import { WORLD } from './config.js';
import { clamp, pick, range } from './random.js';

const ROOF_COLORS = ['#8f8271', '#7d7468', '#a08b74', '#6e7d8a', '#94806a', '#5d6b7a'];
const WALL_COLORS = ['#c9b797', '#b8a88f', '#d8c9a8', '#a8b8c4', '#c4a88f', '#9fb4a8'];
const PARK_NAMES = ['Coral Park', 'Palm Court', 'Meridian Green'];

function blockRects() {
  // The strips of land between neighbouring roads (and the world edge).
  const xs = [0, ...WORLD.roadsX, WORLD.width];
  const ys = [0, ...WORLD.roadsY, WORLD.height];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + (i === 0 ? 0 : WORLD.roadWidth / 2 + 16);
      const x1 = xs[i + 1] - (i === xs.length - 2 ? 0 : WORLD.roadWidth / 2 + 16);
      const y0 = ys[j] + (j === 0 ? 0 : WORLD.roadWidth / 2 + 16);
      const y1 = ys[j + 1] - (j === ys.length - 2 ? 0 : WORLD.roadWidth / 2 + 16);
      if (x1 - x0 < 40 || y1 - y0 < 40) continue;
      blocks.push({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
  }
  return blocks;
}

/** True when the point is on a road (or the beach promenade, which cars may use). */
export function isOnRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of WORLD.roadsX) if (Math.abs(x - rx) <= half && y >= 0 && y <= WORLD.height) return true;
  for (const ry of WORLD.roadsY) if (Math.abs(y - ry) <= half && x >= 0 && x <= WORLD.width) return true;
  return false;
}

/** The nearest point on any road centre line to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of WORLD.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 0, WORLD.height), vertical: true }; }
  }
  for (const ry of WORLD.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, WORLD.width), y: ry, vertical: false }; }
  }
  return best;
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const blocks = blockRects();

  for (const block of blocks) {
    // The southern strip is beach, not buildings.
    if (block.y0 >= WORLD.beachY - 60) continue;
    const downtown = block.cx > 1000 && block.cx < 2000 && block.cy > 600 && block.cy < 1600;
    const roll = random();
    if (roll < 0.14) {
      // A park: grass, a few trees, a path.
      parks.push({ x: block.x0, y: block.y0, w: block.x1 - block.x0, h: block.y1 - block.y0, name: pick(random, PARK_NAMES) });
      const count = 4 + Math.floor(random() * 5);
      for (let i = 0; i < count; i += 1) {
        trees.push({ x: range(random, block.x0 + 14, block.x1 - 14), y: range(random, block.y0 + 14, block.y1 - 14), r: 9 + random() * 7 });
      }
      continue;
    }
    // One to four buildings per block, kept clear of the block's edges.
    const tall = downtown && random() < 0.6;
    const count = tall ? 1 : 1 + Math.floor(random() * 3);
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellW = (block.x1 - block.x0) / cols;
    const cellH = (block.y1 - block.y0) / rows;
    let made = 0;
    for (let r = 0; r < rows && made < count; r += 1) {
      for (let c = 0; c < cols && made < count; c += 1) {
        const w = tall ? range(random, 90, 130) : range(random, 56, Math.min(120, cellW - 24));
        const h = tall ? range(random, 90, 130) : range(random, 56, Math.min(120, cellH - 24));
        const x = block.x0 + c * cellW + (cellW - w) / 2;
        const y = block.y0 + r * cellH + (cellH - h) / 2;
        buildings.push({
          x, y, w, h,
          height: tall ? 3 + Math.floor(random() * 3) : 1 + Math.floor(random() * 2),
          wall: pick(random, WALL_COLORS),
          roof: pick(random, ROOF_COLORS),
          windows: random() < 0.7,
        });
        made += 1;
      }
    }
    // A street tree or two on ordinary blocks.
    if (random() < 0.5) {
      trees.push({ x: range(random, block.x0 + 10, block.x1 - 10), y: range(random, block.y0 + 10, block.y1 - 10), r: 8 + random() * 5 });
    }
  }

  // Palm trees along the beach promenade.
  for (let x = 120; x < WORLD.width; x += 130) {
    trees.push({ x: x + range(random, -20, 20), y: WORLD.beachY - 26, r: 10 + random() * 4, palm: true });
  }

  function pointInBuilding(x, y, pad) {
    for (const b of buildings) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
    }
    return null;
  }

  function pointBlocked(x, y) {
    if (x < 0 || y < 0 || x > WORLD.width || y >= WORLD.waterY) return true;
    return pointInBuilding(x, y, 0) !== null;
  }

  /**
   * Push a circle out of every building it overlaps. Returns true when it hit one,
   * and writes the corrected centre back into `out`.
   */
  function resolveCircle(x, y, radius, out) {
    let hit = false;
    let nx = x;
    let ny = y;
    for (const b of buildings) {
      const cx = clamp(nx, b.x, b.x + b.w);
      const cy = clamp(ny, b.y, b.y + b.h);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 === 0) {
        // Centre inside the building: push out through the nearest face.
        const left = nx - b.x;
        const right = b.x + b.w - nx;
        const top = ny - b.y;
        const bottom = b.y + b.h - ny;
        const min = Math.min(left, right, top, bottom);
        if (min === left) nx = b.x - radius;
        else if (min === right) nx = b.x + b.w + radius;
        else if (min === top) ny = b.y - radius;
        else ny = b.y + b.h + radius;
      } else {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        ny = cy + (dy / d) * radius;
      }
    }
    out.x = clamp(nx, radius, WORLD.width - radius);
    out.y = clamp(ny, radius, WORLD.waterY - radius);
    return hit;
  }

  /** A random point on a road, for spawning traffic and parked cars. */
  function randomRoadPoint() {
    if (random() < 0.5) {
      const rx = pick(random, WORLD.roadsX);
      return { x: rx, y: range(random, 60, WORLD.beachY - 60), vertical: true };
    }
    const ry = pick(random, WORLD.roadsY);
    return { x: range(random, 60, WORLD.width - 60), y: ry, vertical: false };
  }

  /** A random walkable point (not inside a building, not in the sea). */
  function randomWalkPoint() {
    for (let tries = 0; tries < 40; tries += 1) {
      const x = range(random, 60, WORLD.width - 60);
      const y = range(random, 60, WORLD.waterY - 40);
      if (!pointBlocked(x, y)) return { x, y };
    }
    return { x: WORLD.roadsX[3], y: WORLD.roadsY[2] };
  }

  return { buildings, parks, trees, blocks, pointInBuilding, pointBlocked, resolveCircle, randomRoadPoint, randomWalkPoint };
}
