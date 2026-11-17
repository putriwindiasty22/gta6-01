// Port Meridian — every tuning number, colour and world constant in one place.
// The camera shows a 1280x720 window onto a 3200x2400 city; no rule below depends
// on the browser window size.
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const WORLD = {
  width: 3200,
  height: 2400,
  roadWidth: 96,
  // Vertical road centre lines, west to east.
  roadsX: [300, 700, 1100, 1500, 1900, 2300, 2700],
  // Horizontal road centre lines, north to south.
  roadsY: [300, 700, 1100, 1500, 1900],
  // South of this the beach begins; south of waterY is the sea.
  beachY: 2140,
  waterY: 2300,
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 330,
  punchRange: 48,
  punchDamage: 34,
  punchCooldown: 0.45,
};

export const CAR = {
  // Arcade handling for the player's car.
  accel: 620,
  brake: 900,
  reverseAccel: 320,
  maxSpeed: 760,
  maxReverse: 260,
  steer: 2.6,
  grip: 3.2,
  drag: 0.55,
  length: 52,
  width: 26,
  // Traffic cars are slower and calmer.
  trafficSpeed: 190,
  trafficMax: 14,
};

export const WANTED = {
  maxStars: 5,
  // Seconds without a crime and out of police sight before a star fades.
  decayQuietSeconds: 14,
  decayInterval: 10,
  // Police cars on the street per star level.
  policePerStar: [0, 1, 2, 3, 4, 5],
  // How long police must hold the player on foot before the bust lands.
  bustHoldSeconds: 2.2,
  // How far away police give up and despawn when the heat is off.
  despawnDistance: 1500,
  // A patrol further than this from the player has lost the trail and leaves.
  loseTrailDistance: 1300,
  // Seconds after a crime during which patrols still answer it; after that a
  // cold trail brings no fresh cars.
  freshCrimeSeconds: 12,
  // Patrols only answer a fresh crime or a player they can still reach.
  spawnReach: 900,
};

export const HEALTH = {
  max: 100,
  // Health trickles back only while the player is clean.
  regenPerSecond: 3,
  crashDamageSpeed: 420,
  ramDamage: 12,
};

export const MONEY = { start: 250, pickup: 25 };

export const SAVE_KEY = 'port-meridian-save-v1';

/** In-game clock: one game minute per real second, starting at 09:12. */
export const CLOCK = { startMinutes: 9 * 60 + 12, minutesPerSecond: 1 };

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  sand: '#e8d39a',
  water: '#2f7fb8',
  waterDeep: '#256a9e',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#d8c95a',
  sidewalk: '#9aa0a8',
  building: '#b8a88f',
  buildingRoof: '#8f8271',
  glass: '#7fb8d8',
  park: '#5d9440',
  tree: '#3f7a2e',
  treeLight: '#57a03a',
  player: '#ffcf3f',
  playerShirt: '#e84c3d',
  police: '#2b6cb0',
  policeLight: '#ff3b30',
  traffic: '#e8e8e8',
  ped: '#c96a4a',
  marker: '#ffd23f',
  hudPanel: 'rgba(12, 16, 24, 0.78)',
  hudText: '#f2f4f6',
  hudMuted: '#aab4c0',
  star: '#ffd23f',
  starEmpty: '#5a636e',
  health: '#58d364',
  healthLow: '#e5534b',
  money: '#7be495',
};

export const DISTRICTS = [
  { name: 'Harbor District', x: 0, y: 1900, w: 3200, h: 500 },
  { name: 'Old Town', x: 0, y: 0, w: 1000, h: 1000 },
  { name: 'Downtown Meridian', x: 1000, y: 600, w: 1000, h: 900 },
  { name: 'Northside', x: 0, y: 0, w: 3200, h: 600 },
  { name: 'Marina East', x: 2000, y: 0, w: 1200, h: 1900 },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
