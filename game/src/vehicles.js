// Cars: the player's arcade driving, the traffic that follows the road grid, parked
// cars waiting to be borrowed, and the entering/exiting that turns a pedestrian into
// a driver. One circle per car is enough for collisions at this scale.
import { CAR, WORLD } from './config.js';
import { angleDifference, clamp, distance, pick, range } from './random.js';

const TRAFFIC_COLORS = ['#d94f3d', '#3d7bd9', '#e8e8e8', '#3aa655', '#e8a13d', '#8a5fd9', '#2e2e33', '#c9c9c9'];
const MODELS = ['sedan', 'hatch', 'van', 'sport'];

let nextCarId = 1;

export function makeCar(random, kind, x, y, angle, opts = {}) {
  return {
    id: nextCarId,
    kind, // 'traffic' | 'parked' | 'police' | 'player'
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    color: opts.color ?? pick(random, TRAFFIC_COLORS),
    model: opts.model ?? pick(random, MODELS),
    driver: opts.driver ?? 'ai', // 'player' | 'ai' | 'none'
    vertical: opts.vertical ?? false,
    lane: opts.lane ?? 0,
    targetSpeed: CAR.trafficSpeed,
    stuckTimer: 0,
    sirenPhase: random() * Math.PI * 2,
  };
}

/** Parked cars along the road edges and the first traffic, around the spawn. */
export function populateCars(g) {
  g.cars.length = 0;
  const random = g.random;
  // Parked cars: just off the road edge, facing along the road.
  for (let i = 0; i < 12; i += 1) {
    const p = g.city.randomRoadPoint();
    const off = WORLD.roadWidth / 2 - 16;
    const angle = p.vertical ? Math.PI / 2 : 0;
    const x = p.vertical ? p.x + (random() < 0.5 ? off : -off) : p.x;
    const y = p.vertical ? p.y : p.y + (random() < 0.5 ? off : -off);
    if (g.city.pointInBuilding(x, y, 4)) continue;
    g.cars.push(makeCar(random, 'parked', x, y, angle, { driver: 'none' }));
  }
  for (let i = 0; i < CAR.trafficMax; i += 1) spawnTrafficCar(g, true);
}

function spawnTrafficCar(g, anywhere) {
  const random = g.random;
  const p = g.city.randomRoadPoint();
  if (!anywhere) {
    // Spawn off-screen but near the player, so the streets stay alive around them.
    const d = distance(p.x, p.y, g.player.x, g.player.y);
    if (d < 500 || d > 1300) return;
  }
  const angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
  const car = makeCar(random, 'traffic', p.x, p.y, angle, { vertical: p.vertical });
  car.lane = angle === Math.PI / 2 || angle === Math.PI ? 22 : -22;
  car.speed = CAR.trafficSpeed * range(random, 0.8, 1.1);
  g.cars.push(car);
}

export function playerCar(g) {
  if (g.player.inCar === null) return null;
  return g.cars.find((c) => c.id === g.player.inCar) ?? null;
}

export function nearestCar(g, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of g.cars) {
    if (car.kind === 'police') continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** The player gets into the nearest car: a parked one is free, an occupied one is a theft. */
export function tryEnterCar(g) {
  const car = nearestCar(g, g.player.x, g.player.y, 78);
  if (!car) return 'none';
  if (car.kind === 'traffic') {
    // The driver bails out on foot and runs.
    g.peds.push({
      x: car.x + 40, y: car.y, angle: 0, speed: 0, state: 'flee', timer: 2.5,
      target: null, fleeAngle: 0, color: '#7a4a8a', skin: '#e8b98a', down: 0,
      walkPhase: Math.random() * 6, walkSpeed: 70,
    });
    car.kind = 'player';
    car.driver = 'player';
    g.player.inCar = car.id;
    g.player.x = car.x;
    g.player.y = car.y;
    return 'stolen';
  }
  car.kind = 'player';
  car.driver = 'player';
  g.player.inCar = car.id;
  g.player.x = car.x;
  g.player.y = car.y;
  return 'entered';
}

/** The player steps out beside the car; it stays where it is, parked. */
export function exitCar(g) {
  const car = playerCar(g);
  if (!car) return;
  car.driver = 'none';
  car.kind = 'parked';
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  g.player.inCar = null;
  g.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
  g.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
  g.player.angle = car.angle;
}

function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

function stepPlayerCar(g, dt, input) {
  const car = playerCar(g);
  if (!car) return;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let forward = car.vx * fx + car.vy * fy;
  let latX = car.vx - forward * fx;
  let latY = car.vy - forward * fy;

  if (input.throttle > 0) forward += CAR.accel * input.throttle * dt;
  else if (input.throttle < 0) forward += CAR.reverseAccel * input.throttle * dt;
  if (input.brake) {
    const stop = CAR.brake * dt;
    forward = Math.abs(forward) <= stop ? 0 : forward - Math.sign(forward) * stop;
  }
  // Rolling drag, stronger when coasting.
  forward -= forward * CAR.drag * dt * (input.throttle === 0 ? 1 : 0.35);
  forward = clamp(forward, -CAR.maxReverse, CAR.maxSpeed);

  // Steering bites harder the faster the car goes, and reverses in reverse.
  const steerAuthority = clamp(forward / 280, -1, 1);
  car.angle += input.steer * CAR.steer * steerAuthority * dt;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const latKeep = Math.exp(-CAR.grip * dt);
  car.vx = nfx * forward + latX * latKeep;
  car.vy = nfy * forward + latY * latKeep;
  car.speed = forward;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // The driver rides with the car: the camera, the minimap and the mission
  // distances all read the player's position.
  g.player.x = car.x;
  g.player.y = car.y;

  // Buildings: bounce off with a thud and lose speed; hard hits hurt.
  const out = { x: car.x, y: car.y };
  const impact = Math.abs(forward);
  if (g.city.resolveCircle(car.x, car.y, 24, out)) {
    car.x = out.x;
    car.y = out.y;
    car.vx *= -0.3;
    car.vy *= -0.3;
    car.speed = 0;
    if (impact > 300) {
      g.events.push('crash');
      g.particles.push({ x: car.x, y: car.y, life: 0.5, max: 0.5, color: '#ffd23f', size: 5 });
      if (impact > 430) {
        g.player.health -= Math.min(30, (impact - 430) / 18);
        g.events.push('hurt');
      }
    }
  }
}

function carAhead(g, car, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of g.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along > 0 && along < dist && Math.abs(dx * -fy + dy * fx) < 40) return true;
  }
  return false;
}

function stepTrafficCar(g, car, dt) {
  // Follow the road grid: keep to the right-hand lane, pick a new direction at
  // intersections, and stop for the car in front.
  const want = carAhead(g, car, 90) ? 0 : car.targetSpeed;
  car.speed += clamp(want - car.speed, -500 * dt, 260 * dt);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;
  car.vx = fx * car.speed;
  car.vy = fy * car.speed;

  // Ease toward the correct lane of the current road.
  if (car.vertical) {
    let rx = WORLD.roadsX[0];
    for (const v of WORLD.roadsX) if (Math.abs(car.x - v) < Math.abs(car.x - rx)) rx = v;
    const laneX = rx + car.lane;
    car.x += clamp(laneX - car.x, -60 * dt, 60 * dt);
  } else {
    let ry = WORLD.roadsY[0];
    for (const v of WORLD.roadsY) if (Math.abs(car.y - v) < Math.abs(car.y - ry)) ry = v;
    const laneY = ry + car.lane;
    car.y += clamp(laneY - car.y, -60 * dt, 60 * dt);
  }

  // At an intersection, sometimes turn.
  const nearCross = car.vertical
    ? WORLD.roadsY.some((ry) => Math.abs(car.y - ry) < 26)
    : WORLD.roadsX.some((rx) => Math.abs(car.x - rx) < 26);
  if (nearCross && g.random() < dt * 0.9) {
    const turn = g.random();
    const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const current = dirs.indexOf(car.angle);
    if (current !== -1) {
      let next = current;
      if (turn < 0.22) next = (current + 1) % 4; // left
      else if (turn < 0.44) next = (current + 3) % 4; // right
      if (next !== current) {
        car.angle = dirs[next];
        car.vertical = next % 2 === 1;
        car.lane = (car.angle === Math.PI / 2 || car.angle === Math.PI) ? 22 : -22;
      }
    }
  }

  // Buildings and the world edge: traffic never drives through a block.
  const out = { x: car.x, y: car.y };
  if (g.city.resolveCircle(car.x, car.y, 24, out)) {
    car.x = out.x;
    car.y = out.y;
    car.speed *= 0.4;
  }
  if (car.x < 40 || car.x > WORLD.width - 40 || car.y < 40 || car.y > WORLD.beachY - 20) {
    // Turned around at the edge of town: send it back the way it came.
    car.angle += Math.PI;
    car.vertical = !car.vertical;
    car.x = clamp(car.x, 60, WORLD.width - 60);
    car.y = clamp(car.y, 60, WORLD.beachY - 40);
  }
}

function collideCars(g) {
  const cars = g.cars;
  // The player's car is the heaviest thing on the road: a tap from a patrol car
  // nudges it, it never spins it around.
  const massOf = (car) => (car.driver === 'player' ? 2.2 : car.kind === 'police' ? 1.2 : 1);
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 46;
      if (d === 0 || d >= min) continue;
      const push = min - d;
      const nx = dx / d;
      const ny = dy / d;
      const invA = 1 / massOf(a);
      const invB = 1 / massOf(b);
      const total = invA + invB;
      a.x -= nx * push * (invA / total);
      a.y -= ny * push * (invA / total);
      b.x += nx * push * (invB / total);
      b.y += ny * push * (invB / total);
      const relSpeed = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
      // Exchange a little momentum along the impact line, weighted by mass.
      const impulse = relSpeed * 0.4;
      a.vx -= nx * impulse * (invA / total) * 2;
      a.vy -= ny * impulse * (invA / total) * 2;
      b.vx += nx * impulse * (invB / total) * 2;
      b.vy += ny * impulse * (invB / total) * 2;
      const playerInvolved = a.driver === 'player' || b.driver === 'player';
      const policeInvolved = a.kind === 'police' || b.kind === 'police';
      if (playerInvolved && relSpeed > 260) {
        g.events.push('crash');
        if (policeInvolved) {
          g.player.health -= HEALTH_RAM;
          g.events.push('hurt');
        }
      }
      if (a.kind === 'traffic') a.speed *= 0.7;
      if (b.kind === 'traffic') b.speed *= 0.7;
    }
  }
}

const HEALTH_RAM = 12;

/** Advance every car one step: the player's, the traffic's, and their collisions. */
export function stepVehicles(g, dt, input) {
  stepPlayerCar(g, dt, input);
  for (const car of g.cars) {
    if (car.kind === 'traffic' && car.driver === 'ai') stepTrafficCar(g, car, dt);
  }
  collideCars(g);
  // Keep the streets full near the player.
  let traffic = 0;
  for (const car of g.cars) if (car.kind === 'traffic') traffic += 1;
  if (traffic < CAR.trafficMax && g.random() < dt * 0.5) spawnTrafficCar(g, false);
  // Traffic far behind the player is recycled.
  for (let i = g.cars.length - 1; i >= 0; i -= 1) {
    const car = g.cars[i];
    if (car.kind === 'traffic' && distance(car.x, car.y, g.player.x, g.player.y) > 1600) {
      g.cars.splice(i, 1);
    }
  }
}
