// The wanted level and the Meridian police: stars rise on crime, fade when the
// player lies low, and the black-and-whites that answer them chase, ram, and —
// when the player is on foot and cornered — make the bust.
import { WANTED, WORLD } from './config.js';
import { angleDifference, clamp, distance, pick, range } from './random.js';
import { makeCar } from './vehicles.js';
import { isOnRoad, nearestRoadPoint } from './world.js';

const POLICE_COLOR = '#e8e8e8';

/** A crime the street just saw: add stars, reset the quiet clock. */
export function addCrime(g, stars, reason) {
  const before = g.wanted.stars;
  g.wanted.stars = clamp(g.wanted.stars + stars, 0, WANTED.maxStars);
  g.wanted.sinceCrime = 0;
  g.wanted.quietTimer = 0;
  g.wanted.decayTimer = 0;
  if (g.wanted.stars > before) g.events.push('wantedUp');
  void reason;
}

/** Stars fade one at a time while the player stays quiet and out of sight. */
export function updateWanted(g, dt) {
  const w = g.wanted;
  w.sinceCrime += dt;
  if (w.stars === 0) return;
  const nearest = nearestPoliceDistance(g);
  if (w.sinceCrime > WANTED.decayQuietSeconds && nearest > 500) {
    w.quietTimer += dt;
    if (w.quietTimer >= WANTED.decayInterval) {
      w.quietTimer = 0;
      w.stars -= 1;
      g.events.push('wantedDown');
    }
  } else {
    w.quietTimer = 0;
  }
}

export function nearestPoliceDistance(g) {
  let best = Infinity;
  for (const car of g.cars) {
    if (car.kind !== 'police') continue;
    best = Math.min(best, distance(car.x, car.y, g.player.x, g.player.y));
  }
  return best;
}

function spawnPoliceCar(g) {
  const random = g.random;
  // Appear on a road a little way off, so they arrive rather than pop in.
  for (let tries = 0; tries < 12; tries += 1) {
    const p = g.city.randomRoadPoint();
    const d = distance(p.x, p.y, g.player.x, g.player.y);
    if (d < 650 || d > 1100) continue;
    const angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    const car = makeCar(random, 'police', p.x, p.y, angle, { color: POLICE_COLOR, vertical: p.vertical, driver: 'ai' });
    car.targetSpeed = 700;
    car.trailOffset = range(random, -55, 55);
    g.cars.push(car);
    return;
  }
}

function stepPoliceCar(g, car, dt) {
  const px = g.player.x;
  const py = g.player.y;
  // Each patrol holds its own line in the chase (a lateral offset from the
  // player's position), so they fan out instead of stacking on one another.
  const dx = px - car.x;
  const dy = py - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const off = car.trailOffset ?? 0;
  const tx = px + (-dy / dist) * off;
  const ty = py + (dx / dist) * off;
  // Stay on the roads: a patrol that has been pushed off the street steers back
  // to the nearest road before it resumes the chase.
  let targetX = tx;
  let targetY = ty;
  if (!isOnRoad(car.x, car.y)) {
    const road = nearestRoadPoint(car.x, car.y);
    targetX = road.x;
    targetY = road.y;
  }
  const wantAngle = Math.atan2(targetY - car.y, targetX - car.x);
  // Steer toward the player, faster when close.
  const turn = clamp(angleDifference(car.angle, wantAngle), -2.4 * dt, 2.4 * dt);
  car.angle += turn;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const d = distance(car.x, car.y, px, py);
  // On foot, a patrol that reaches the player pulls up and stops on them — that
  // hold is what makes the bust. In a car, it just keeps ramming.
  let wantSpeed = 700;
  if (g.player.inCar === null) {
    if (d < 70) wantSpeed = 0;
    else if (d < 120) wantSpeed = 170;
  }
  car.speed += clamp(wantSpeed - car.speed, -640 * dt, 420 * dt);
  car.vx = fx * car.speed;
  car.vy = fy * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.sirenPhase += dt * 6;

  const out = { x: car.x, y: car.y };
  if (g.city.resolveCircle(car.x, car.y, 24, out)) {
    car.x = out.x;
    car.y = out.y;
    // Stuck against a building: back up and try a new line.
    car.speed *= -0.4;
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2) {
      car.angle += Math.PI / 2;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
  car.x = clamp(car.x, 40, WORLD.width - 40);
  car.y = clamp(car.y, 40, WORLD.beachY - 20);
}

/** Keep the right number of police on the street, drive them, and handle the bust. */
export function updatePolice(g, dt) {
  const wanted = g.wanted.stars;
  let count = 0;
  for (const car of g.cars) if (car.kind === 'police') count += 1;
  const desired = WANTED.policePerStar[wanted] ?? 0;
  const nearest = nearestPoliceDistance(g);

  // A patrol that has fallen too far behind has lost the trail and leaves.
  for (let i = g.cars.length - 1; i >= 0; i -= 1) {
    const car = g.cars[i];
    if (car.kind === 'police' && distance(car.x, car.y, g.player.x, g.player.y) > WANTED.loseTrailDistance) {
      g.cars.splice(i, 1);
      count -= 1;
    }
  }

  // Fresh crimes bring patrols in; a cold trail brings no fresh cars, so a
  // player who has truly shaken the police stays shaken free.
  const fresh = g.wanted.sinceCrime < WANTED.freshCrimeSeconds;
  if (count < desired && (fresh || nearest < WANTED.spawnReach) && g.random() < dt * 1.5) spawnPoliceCar(g);

  for (let i = g.cars.length - 1; i >= 0; i -= 1) {
    const car = g.cars[i];
    if (car.kind !== 'police') continue;
    if (wanted === 0) {
      // Heat off: the patrol drives away and leaves.
      car.speed = 300;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (distance(car.x, car.y, g.player.x, g.player.y) > WANTED.despawnDistance) g.cars.splice(i, 1);
      continue;
    }
    stepPoliceCar(g, car, dt);
  }

  // The bust: on foot, with a patrol car holding on the player.
  if (wanted > 0 && g.player.inCar === null) {
    let held = false;
    for (const car of g.cars) {
      if (car.kind !== 'police') continue;
      const d = distance(car.x, car.y, g.player.x, g.player.y);
      if (d < 60 && Math.hypot(car.vx, car.vy) < 220) { held = true; break; }
    }
    if (held) {
      g.bustTimer += dt;
      if (g.bustTimer >= WANTED.bustHoldSeconds) {
        g.bustTimer = 0;
        g.events.push('busted');
      }
    } else {
      g.bustTimer = 0;
    }
  } else {
    g.bustTimer = 0;
  }
}
