// The screenshot scenes behind ?shot=start|drive|mission|foot. Each one plays the
// real rules forward from a fresh game for a fixed number of steps, steered by a
// simple driving autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { clamp, angleDifference, distance } from './random.js';
import { resetGame, stepGame } from './state.js';
import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/**
 * Steer a car along a list of waypoints, like a player would: look ahead to the
 * next waypoint before a corner, ease off the throttle for a sharp turn, and
 * cruise at a fraction of full speed so the shot stays readable.
 */
function driveToward(g, waypoints, wp, cruise) {
  const car = g.cars.find((c) => c.id === g.player.inCar);
  if (!car) return { steer: 0, throttle: 0, brake: false };
  // Switch early to the next waypoint so corners are cut on the road, not through a block.
  if (wp < waypoints.length - 1 && Math.hypot(waypoints[wp].x - car.x, waypoints[wp].y - car.y) < 190) wp += 1;
  const target = waypoints[Math.min(wp, waypoints.length - 1)];
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDifference(car.angle, want);
  const sharp = Math.abs(diff);
  return {
    steer: clamp(diff * 2.2, -1, 1),
    throttle: sharp > 1.5 ? 0.3 : sharp > 0.9 ? 0.55 : cruise,
    brake: sharp > 2.3,
    wp,
  };
}

function idleInput() {
  return {
    walk: { x: 0, y: 0, moving: false },
    drive: { steer: 0, throttle: 0, brake: false },
    run: false, brake: false, enter: false, punch: false,
  };
}

function putPlayerInCar(g, x, y, angle) {
  const car = g.cars.find((c) => c.kind === 'parked' || c.kind === 'traffic');
  car.kind = 'player';
  car.driver = 'player';
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.vx = Math.cos(angle) * 200;
  car.vy = Math.sin(angle) * 200;
  car.speed = 200;
  g.player.inCar = car.id;
  g.player.x = x;
  g.player.y = y;
}

function stepFor(g, seconds, inputFn, stopWhen, ambient = false) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    if (stopWhen && stopWhen(g)) break;
    stepGame(g, SAMPLE, inputFn(i * SAMPLE), ambient);
  }
}

function stageStart(g) {
  resetGame(g);
  g.player.x = 1500;
  g.player.y = 2090;
  g.player.angle = Math.PI / 2;
  // The same living backdrop the player sees: traffic and pedestrians move,
  // but nothing scores and no crime counts.
  stepFor(g, 5, idleInput, null, true);
  return { screen: SCREEN_TITLE };
}

function stageDrive(g) {
  resetGame(g);
  // Clear the route so the chase, not a traffic jam, is what the frame shows.
  for (let i = g.cars.length - 1; i >= 0; i -= 1) {
    const car = g.cars[i];
    if (car.x > 300 && car.x < 3000 && Math.abs(car.y - 1100) < 140) g.cars.splice(i, 1);
  }
  putPlayerInCar(g, 400, 1078, 0);
  g.wanted.stars = 3;
  g.wanted.sinceCrime = 0;
  // Two patrol cars already on the player's tail, trailing rather than ramming,
  // one in each lane so they read as two cars, not one.
  const chase = [[150, 1056, 480, 560, 0], [60, 1122, 380, 640, 70]];
  for (const [x, y, speed, top, offset] of chase) {
    const car = makeCar(g.random, 'police', x, y, 0, { color: '#e8e8e8', vertical: false, driver: 'ai' });
    car.speed = speed;
    car.vx = speed;
    car.targetSpeed = top;
    car.trailOffset = offset;
    g.cars.push(car);
  }
  const waypoints = [{ x: 2900, y: 1078 }];
  let wp = 0;
  stepFor(g, 2.4, () => {
    const out = driveToward(g, waypoints, wp, 0.6);
    wp = out.wp;
    return { ...idleInput(), drive: { steer: out.steer, throttle: out.throttle, brake: out.brake } };
  });
  g.messageTimer = 0;
  return { screen: SCREEN_PLAY };
}

function stageMission(g) {
  resetGame(g);
  // Job 1, parcel already in hand, racing the clock to Meridian Tower.
  g.mission.index = 0;
  g.mission.stage = 'active';
  g.mission.phase = 'toDropoff';
  g.mission.timer = 100;
  putPlayerInCar(g, 2500, 678, Math.PI);
  // West along Café Row, then south down Meridian Avenue to the tower.
  const waypoints = [{ x: 1122, y: 678 }, { x: 1122, y: 1500 }];
  let wp = 0;
  // Stop as the tower comes into view, while the delivery is still in progress.
  const stopWhen = (gg) => gg.mission.index > 0 || distance(gg.player.x, gg.player.y, 1122, 1500) < 170;
  stepFor(g, 4.5, () => {
    const out = driveToward(g, waypoints, wp, 0.85);
    wp = out.wp;
    return { ...idleInput(), drive: { steer: out.steer, throttle: out.throttle, brake: out.brake } };
  }, stopWhen);
  g.messageTimer = 0;
  return { screen: SCREEN_PLAY };
}

function stageFoot(g) {
  resetGame(g);
  g.player.x = 1500;
  g.player.y = 2090;
  g.player.angle = Math.PI / 2;
  // A busy promenade: extra strollers around the player.
  for (let i = 0; i < 8; i += 1) {
    const p = { x: 1500 + (g.random() - 0.5) * 500, y: 2050 + (g.random() - 0.5) * 120 };
    g.peds.push(makePed(g.random, p.x, p.y));
  }
  stepFor(g, 4, idleInput);
  g.messageTimer = 0;
  return { screen: SCREEN_PLAY };
}

/**
 * Set the game to the named scene (start, drive, mission or foot; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, g) {
  if (name === 'drive') return stageDrive(g);
  if (name === 'mission') return stageMission(g);
  if (name === 'foot') return stageFoot(g);
  return stageStart(g);
}
