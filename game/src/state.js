// The game itself: one state object, built once from a seed, and one step that moves
// it forward. Rendering, sound and screens read this state; they never own it.
import { CAR, CLOCK, HEALTH, MONEY, PLAYER, WORLD } from './config.js';
import { createRandom, clamp, distance } from './random.js';
import { createCity } from './world.js';
import { populateCars, stepVehicles, tryEnterCar, exitCar, playerCar } from './vehicles.js';
import { populatePeds, stepPeds, punchNearest } from './pedestrians.js';
import { addCrime, updateWanted, updatePolice } from './police.js';
import { createMissionState, tryStartMission, updateMission } from './missions.js';

export const SPAWN = { x: 1500, y: 1180 };

export function createGame(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const g = {
    seed,
    random,
    city,
    elapsed: 0,
    clockMinutes: CLOCK.startMinutes,
    player: {
      x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2,
      health: HEALTH.max, money: MONEY.start,
      inCar: null, punchTimer: 0, punchAnim: 0, invuln: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    wanted: { stars: 0, sinceCrime: 99, quietTimer: 0, decayTimer: 0 },
    mission: createMissionState(),
    bustTimer: 0,
    storyComplete: false,
    over: null, // {type: 'wasted' | 'busted'} when the player is down.
    events: [],
    message: '',
    messageTimer: 0,
    camera: { x: 0, y: 0 },
    stats: { carsStolen: 0, pedsHit: 0, missionsDone: 0 },
    autosaveTimer: 30,
  };
  resetGame(g);
  return g;
}

export function resetGame(g) {
  g.player.x = SPAWN.x;
  g.player.y = SPAWN.y;
  g.player.angle = -Math.PI / 2;
  g.player.health = HEALTH.max;
  g.player.money = MONEY.start;
  g.player.inCar = null;
  g.player.punchTimer = 0;
  g.player.punchAnim = 0;
  g.player.invuln = 0;
  g.wanted.stars = 0;
  g.wanted.sinceCrime = 99;
  g.wanted.quietTimer = 0;
  g.bustTimer = 0;
  g.mission = createMissionState();
  g.storyComplete = false;
  g.over = null;
  g.elapsed = 0;
  g.clockMinutes = CLOCK.startMinutes;
  g.pickups = [];
  g.particles = [];
  g.events = [];
  g.message = 'Welcome to Port Meridian.';
  g.messageTimer = 4;
  g.stats = { carsStolen: 0, pedsHit: 0, missionsDone: 0 };
  populateCars(g);
  populatePeds(g, 26);
  // A little street cash to find.
  for (let i = 0; i < 6; i += 1) {
    const p = g.city.randomWalkPoint();
    g.pickups.push({ x: p.x, y: p.y, kind: 'cash', taken: false });
  }
  updateCamera(g);
}

function updateCamera(g) {
  const cx = g.player.x - 640;
  const cy = g.player.y - 360;
  g.camera.x = clamp(cx, 0, WORLD.width - 1280);
  g.camera.y = clamp(cy, 0, WORLD.height - 720);
}

function stepPlayerOnFoot(g, dt, input) {
  const p = g.player;
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.x += input.walk.x * speed * dt;
  p.y += input.walk.y * speed * dt;
  if (input.walk.moving) p.angle = Math.atan2(input.walk.y, input.walk.x);
  const out = { x: p.x, y: p.y };
  g.city.resolveCircle(p.x, p.y, PLAYER.radius, out);
  p.x = out.x;
  p.y = out.y;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.punchAnim > 0) p.punchAnim -= dt;
  if (p.invuln > 0) p.invuln -= dt;
}

function stepPickups(g) {
  for (const pickup of g.pickups) {
    if (pickup.taken) continue;
    if (distance(g.player.x, g.player.y, pickup.x, pickup.y) < 44) {
      pickup.taken = true;
      if (pickup.kind === 'cash') {
        g.player.money += MONEY.pickup;
        g.events.push('cash');
      } else if (pickup.kind === 'drop') {
        g.mission.dropsLeft -= 1;
        g.events.push('pickup');
      }
    }
  }
}

function drainCrimeEvents(g) {
  // Crime events are raised as 'crime:<kind>' so the audio and the wanted level
  // both see them; turn them into stars here, once.
  for (let i = g.events.length - 1; i >= 0; i -= 1) {
    const e = g.events[i];
    if (e === 'crime:hitPed') {
      g.stats.pedsHit += 1;
      addCrime(g, 2, 'hitPed');
      g.events.splice(i, 1);
    } else if (e === 'crime:punch') {
      addCrime(g, 1, 'punch');
      g.events.splice(i, 1);
    }
  }
}

/**
 * One fixed step. `input` carries the held keys for this frame plus the one-shot
 * actions the player just pressed: {walk, drive, run, brake, enter, punch}.
 * With `ambient` set (the title screen's backdrop) the city moves — traffic
 * drives, pedestrians stroll — but nothing scores, no crime counts and no
 * mission starts, so the game behind the menu stays a fresh start.
 */
export function stepGame(g, dt, input, ambient = false) {
  g.elapsed += dt;
  g.clockMinutes = (CLOCK.startMinutes + g.elapsed * CLOCK.minutesPerSecond) % (24 * 60);
  if (g.messageTimer > 0) g.messageTimer -= dt;

  if (g.over) return;

  // Only events raised during this step can end the run: an old 'busted' left
  // over from before a respawn must never fire twice.
  const eventMark = g.events.length;

  // Actions first: entering or leaving a car, punching, starting a job.
  if (!ambient && input.enter) {
    if (g.player.inCar !== null) exitCar(g);
    else {
      const result = tryEnterCar(g);
      if (result === 'stolen') {
        g.stats.carsStolen += 1;
        addCrime(g, 1, 'steal');
        g.events.push('steal');
        g.message = 'You stole the car! The street saw it.';
        g.messageTimer = 3;
      } else if (result === 'entered') {
        g.events.push('enterCar');
      }
    }
  }
  if (input.punch && !ambient && g.player.inCar === null && g.player.punchTimer <= 0) {
    g.player.punchTimer = PLAYER.punchCooldown;
    g.player.punchAnim = 0.25;
    punchNearest(g);
  }

  if (g.player.inCar !== null) stepVehicles(g, dt, input.drive);
  else stepPlayerOnFoot(g, dt, input);
  stepPeds(g, dt);
  if (!ambient) {
    updateWanted(g, dt);
    updatePolice(g, dt);
    updateMission(g, dt);
    stepPickups(g);
    tryStartMission(g);
    drainCrimeEvents(g);
  }

  // Health comes back slowly while the player is clean.
  if (!ambient && g.wanted.stars === 0 && g.player.health < HEALTH.max) {
    g.player.health = Math.min(HEALTH.max, g.player.health + HEALTH.regenPerSecond * dt);
  }

  // Particles fade.
  for (let i = g.particles.length - 1; i >= 0; i -= 1) {
    const p = g.particles[i];
    p.life -= dt;
    if (p.life <= 0) g.particles.splice(i, 1);
  }

  // Wasted or busted ends the run until the player respawns.
  const freshEvents = g.events.slice(eventMark);
  if (freshEvents.includes('busted')) {
    g.over = { type: 'busted' };
  } else if (g.player.health <= 0) {
    g.player.health = 0;
    g.events.push('wasted');
    g.over = { type: 'wasted' };
  }

  updateCamera(g);
  if (ambient) {
    // The backdrop's bumps and scares are nobody's: drop them, keep the city clean.
    g.events.length = 0;
  } else {
    g.autosaveTimer -= dt;
  }
}

/** What respawning costs, and where the player wakes up: Meridian General. */
export function respawn(g) {
  const fine = g.over?.type === 'busted' ? 150 : 100;
  g.player.money = Math.max(0, g.player.money - fine);
  g.player.health = HEALTH.max;
  g.player.x = 1150;
  g.player.y = 760;
  g.player.angle = Math.PI / 2;
  if (g.player.inCar !== null) {
    const car = playerCar(g);
    if (car) { car.driver = 'none'; car.kind = 'parked'; car.vx = 0; car.vy = 0; }
    g.player.inCar = null;
  }
  g.wanted.stars = 0;
  g.wanted.sinceCrime = 99;
  g.bustTimer = 0;
  g.over = null;
  g.message = 'You wake up at Meridian General.';
  g.messageTimer = 4;
  updateCamera(g);
}

/** A plain object for localStorage: money, health, progress and position. */
export function saveData(g) {
  return {
    version: 1,
    money: g.player.money,
    health: g.player.health,
    missionIndex: g.mission.index,
    storyComplete: g.storyComplete,
    x: g.player.x,
    y: g.player.y,
    clockMinutes: g.clockMinutes,
    elapsed: g.elapsed,
    stats: g.stats,
  };
}

export function loadData(g, data) {
  if (!data || data.version !== 1) return false;
  g.player.money = data.money ?? MONEY.start;
  g.player.health = data.health ?? HEALTH.max;
  g.mission.index = data.missionIndex ?? 0;
  g.mission.stage = 'idle';
  g.mission.phase = '';
  g.mission.timer = 0;
  g.storyComplete = !!data.storyComplete;
  g.player.x = data.x ?? SPAWN.x;
  g.player.y = data.y ?? SPAWN.y;
  g.player.inCar = null;
  g.clockMinutes = data.clockMinutes ?? CLOCK.startMinutes;
  g.elapsed = data.elapsed ?? 0;
  g.stats = data.stats ?? g.stats;
  g.over = null;
  updateCamera(g);
  return true;
}
