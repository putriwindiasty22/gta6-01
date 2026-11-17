// The story of Port Meridian in three jobs: a courier run, shaking the heat, and
// five drops stashed around town. Missions run in order; walk or drive into the
// glowing marker to start one, and the HUD shows what is left to do.
import { distance } from './random.js';
import { addCrime } from './police.js';

export const MISSION_DEFS = [
  {
    id: 'courier',
    name: 'First Delivery',
    brief: 'Pick up the parcel at Café Lumen, then deliver it to Meridian Tower before the clock runs out.',
    reward: 300,
    marker: { x: 2700, y: 700, label: 'Café Lumen' },
    pickup: { x: 2700, y: 700 },
    dropoff: { x: 1100, y: 1500, label: 'Meridian Tower' },
    timeAfterPickup: 120,
  },
  {
    id: 'heat',
    name: 'Lose the Heat',
    brief: 'Trigger the alarm at Harbor Precinct, then lose every star before the timer ends.',
    reward: 400,
    marker: { x: 500, y: 1500, label: 'Harbor Precinct' },
    time: 150,
  },
  {
    id: 'drops',
    name: 'Five Drops',
    brief: 'Five packages are stashed around Port Meridian. Collect them all.',
    reward: 600,
    marker: { x: 1500, y: 1100, label: 'Marina Steps' },
    time: 180,
    drops: [
      { x: 700, y: 300 },
      { x: 1900, y: 300 },
      { x: 2700, y: 1100 },
      { x: 500, y: 1900 },
      { x: 1500, y: 1900 },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // Which job is next; equal to MISSION_DEFS.length when the story is done.
    stage: 'idle', // 'idle' | 'active' | 'failed'
    phase: '', // What the player is doing inside the job.
    timer: 0,
    dropsLeft: 0,
    target: null, // {x, y, label} the marker the HUD and minimap point at.
    objective: '',
  };
}

export function currentDef(g) {
  return MISSION_DEFS[g.mission.index] ?? null;
}

/** Where the next marker is, and what the HUD should say about it. */
export function missionTarget(g) {
  const def = currentDef(g);
  const m = g.mission;
  if (!def) return null;
  if (m.stage === 'idle') return { x: def.marker.x, y: def.marker.y, label: def.marker.label };
  if (def.id === 'courier') {
    if (m.phase === 'toPickup') return { x: def.pickup.x, y: def.pickup.y, label: 'Pick up the parcel' };
    return { x: def.dropoff.x, y: def.dropoff.y, label: 'Deliver to Meridian Tower' };
  }
  if (def.id === 'heat') {
    if (m.phase === 'toPrecinct') return { x: def.marker.x, y: def.marker.y, label: 'Reach Harbor Precinct' };
    return null; // Losing the heat has no place to go.
  }
  return null; // Drops are drawn as pickups; the nearest one is the target.
}

function setObjective(g, text) {
  g.mission.objective = text;
}

function completeMission(g) {
  const def = currentDef(g);
  g.player.money += def.reward;
  g.events.push('missionComplete');
  g.message = `${def.name} complete — $${def.reward} earned.`;
  g.messageTimer = 4;
  g.mission.index += 1;
  g.mission.stage = 'idle';
  g.mission.phase = '';
  g.mission.timer = 0;
  g.mission.target = null;
  if (g.mission.index >= MISSION_DEFS.length) {
    g.storyComplete = true;
    g.events.push('storyComplete');
  }
  setObjective(g, '');
}

function failMission(g, reason) {
  g.events.push('missionFailed');
  g.message = `${currentDef(g).name} failed — ${reason}. Return to the marker to retry.`;
  g.messageTimer = 4;
  g.mission.stage = 'failed';
  g.mission.phase = '';
  g.mission.timer = 0;
  for (const p of g.pickups) if (p.kind === 'drop') p.taken = true;
}

/** Step into the marker to start the next job. */
export function tryStartMission(g) {
  const def = currentDef(g);
  const m = g.mission;
  if (!def || m.stage === 'active') return false;
  if (distance(g.player.x, g.player.y, def.marker.x, def.marker.y) > 70) return false;
  m.stage = 'active';
  if (def.id === 'courier') {
    m.phase = 'toPickup';
    setObjective(g, 'Pick up the parcel at Café Lumen');
  } else if (def.id === 'heat') {
    m.phase = 'toPrecinct';
    setObjective(g, 'Reach Harbor Precinct and trigger the alarm');
  } else {
    m.phase = 'collect';
    m.dropsLeft = def.drops.length;
    m.timer = def.time;
    for (const d of def.drops) g.pickups.push({ x: d.x, y: d.y, kind: 'drop', taken: false });
    setObjective(g, `Collect the drops — ${m.dropsLeft} left`);
  }
  g.events.push('missionStart');
  g.message = `${def.name}: ${def.brief}`;
  g.messageTimer = 5;
  return true;
}

export function updateMission(g, dt) {
  const def = currentDef(g);
  const m = g.mission;
  if (!def) return;
  if (m.stage === 'failed') {
    // A short beat, then the marker is live again.
    m.timer += dt;
    if (m.timer > 3) { m.stage = 'idle'; m.timer = 0; }
    return;
  }
  if (m.stage !== 'active') return;

  if (def.id === 'courier') {
    if (m.phase === 'toPickup') {
      if (distance(g.player.x, g.player.y, def.pickup.x, def.pickup.y) < 60) {
        m.phase = 'toDropoff';
        m.timer = def.timeAfterPickup;
        setObjective(g, 'Deliver the parcel to Meridian Tower');
        g.events.push('pickup');
        g.message = 'Parcel collected — get it to Meridian Tower!';
        g.messageTimer = 3;
      }
    } else {
      m.timer -= dt;
      if (distance(g.player.x, g.player.y, def.dropoff.x, def.dropoff.y) < 70) {
        completeMission(g);
        return;
      }
      setObjective(g, `Deliver the parcel — ${Math.ceil(m.timer)}s left`);
      if (m.timer <= 0) failMission(g, 'the parcel arrived late');
    }
    return;
  }

  if (def.id === 'heat') {
    if (m.phase === 'toPrecinct') {
      if (distance(g.player.x, g.player.y, def.marker.x, def.marker.y) < 60) {
        m.phase = 'loseHeat';
        m.timer = def.time;
        addCrime(g, 2, 'alarm');
        setObjective(g, 'Lose the heat — get to zero stars');
        g.message = 'The alarm is up! Lose every star.';
        g.messageTimer = 3;
      }
      return;
    }
    m.timer -= dt;
    setObjective(g, `Lose the heat — ${Math.ceil(m.timer)}s left`);
    if (g.wanted.stars === 0) {
      completeMission(g);
      return;
    }
    if (m.timer <= 0) failMission(g, 'the heat never cooled off');
    return;
  }

  // Five drops.
  m.timer -= dt;
  setObjective(g, `Collect the drops — ${m.dropsLeft} left · ${Math.ceil(m.timer)}s`);
  if (m.dropsLeft <= 0) {
    completeMission(g);
    return;
  }
  if (m.timer <= 0) failMission(g, 'time ran out');
}
