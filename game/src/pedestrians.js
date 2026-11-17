// Pedestrians: the people of Port Meridian. They stroll the sidewalks, run from a
// speeding car, and go down when one hits them — which the whole street notices.
import { PLAYER, WORLD } from './config.js';
import { angleDifference, clamp, distance, pick, range } from './random.js';

const SHIRT_COLORS = ['#c96a4a', '#4a7ac9', '#5a9e4b', '#c9a13d', '#8a5fd9', '#d94f7a', '#3d9e9e', '#e8e8e8'];
const SKIN_COLORS = ['#e8b98a', '#c98a5a', '#8a5a3a', '#f0cba0'];

/** A person on foot: walk, flee, or down on the pavement. */
export function makePed(random, x, y) {
  return {
    x, y,
    angle: range(random, 0, Math.PI * 2),
    speed: 0,
    state: 'walk', // 'walk' | 'flee' | 'down'
    timer: 0,
    target: null,
    fleeAngle: 0, // The direction it runs in while fleeing.
    color: pick(random, SHIRT_COLORS),
    skin: pick(random, SKIN_COLORS),
    walkPhase: random() * Math.PI * 2,
    walkSpeed: range(random, 52, 84),
  };
}

export function populatePeds(g, count) {
  g.peds.length = 0;
  for (let i = 0; i < count; i += 1) {
    const p = g.city.randomWalkPoint();
    g.peds.push(makePed(g.random, p.x, p.y));
  }
}

function nearestThreat(g, ped) {
  // A fast car nearby, or the player on foot swinging.
  for (const car of g.cars) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 140 && distance(ped.x, ped.y, car.x, car.y) < 170) return car;
  }
  return null;
}

function pickTarget(g, ped) {
  ped.target = g.city.randomWalkPoint();
}

export function stepPeds(g, dt) {
  for (const ped of g.peds) {
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        ped.state = 'flee';
        ped.timer = 2.5;
        pickTarget(g, ped);
      }
      continue;
    }

    const threat = nearestThreat(g, ped);
    if (threat) {
      // Keep running away from the nearest danger, even after it passes.
      ped.fleeAngle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      if (ped.state !== 'flee') {
        ped.state = 'flee';
        ped.timer = 2.5;
      }
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      ped.angle = ped.fleeAngle;
      ped.speed = 210;
      if (ped.timer <= 0) ped.state = 'walk';
    } else {
      if (!ped.target || distance(ped.x, ped.y, ped.target.x, ped.target.y) < 24) pickTarget(g, ped);
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle += clamp(angleDifference(ped.angle, want), -2.4 * dt, 2.4 * dt);
      ped.speed = ped.walkSpeed;
    }

    ped.walkPhase += dt * (ped.state === 'flee' ? 11 : 7);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    const out = { x: ped.x, y: ped.y };
    g.city.resolveCircle(ped.x, ped.y, 10, out);
    ped.x = out.x;
    ped.y = out.y;

    // A car that touches a pedestrian knocks them down.
    for (const car of g.cars) {
      if (car.kind === 'parked') continue;
      const speed = Math.hypot(car.vx, car.vy);
      if (distance(ped.x, ped.y, car.x, car.y) < 34 && speed > 60) {
        ped.state = 'down';
        ped.timer = 3;
        ped.speed = 0;
        if (car.driver === 'player' || car.kind === 'police') {
          g.events.push('hitPed');
          if (car.driver === 'player') g.events.push('crime:hitPed');
        }
        // Sometimes the fall shakes loose a little cash.
        if (g.random() < 0.35) {
          g.pickups.push({ x: ped.x + range(g.random, -30, 30), y: ped.y + range(g.random, -30, 30), kind: 'cash', taken: false });
        }
        break;
      }
    }
  }
}

/** The player's punch: the nearest person in reach goes down. Returns true on a hit. */
export function punchNearest(g) {
  let best = null;
  let bestD = PLAYER.punchRange;
  for (const ped of g.peds) {
    if (ped.state === 'down') continue;
    const d = distance(g.player.x, g.player.y, ped.x, ped.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (!best) return false;
  best.state = 'down';
  best.timer = 2.5;
  best.speed = 0;
  g.events.push('punch');
  g.events.push('crime:punch');
  g.particles.push({ x: best.x, y: best.y, life: 0.4, max: 0.4, color: '#ffffff', size: 6 });
  return true;
}
