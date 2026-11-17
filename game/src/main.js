// Boot and the one loop: input is read every frame, the game advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the city. ?shot=start|drive|mission|foot (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createGame, stepGame, respawn, saveData, loadData } from './state.js';
import { attachInput, isHeld, wasPressed, endFrameInput, walkInput, driveInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { nearestPoliceDistance } from './police.js';
import { playerCar } from './vehicles.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

/** No keys held and no actions: the input the title screen's backdrop steps with. */
const IDLE_INPUT = {
  walk: { x: 0, y: 0, moving: false },
  drive: { steer: 0, throttle: 0, brake: false },
  run: false,
  brake: false,
  enter: false,
  punch: false,
};

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveData(game)));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function hasSave() {
  return readSave() !== null;
}

const EVENT_SOUNDS = {
  crash: 'crash',
  punch: 'punch',
  pickup: 'pickup',
  cash: 'cash',
  steal: 'steal',
  enterCar: 'enterCar',
  missionComplete: 'mission',
  missionFailed: 'fail',
  missionStart: 'pickup',
  busted: 'busted',
  wasted: 'busted',
  storyComplete: 'mission',
  hitPed: 'punch',
};

function drainEvents() {
  for (const event of game.events) {
    const sound = EVENT_SOUNDS[event];
    if (sound) audio.sfx(sound);
    if (event === 'missionComplete') {
      game.stats.missionsDone += 1;
      writeSave();
    }
  }
  game.events.length = 0;
}

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, { hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  attachInput();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startFresh() {
    game.mission.index = 0;
    // A fresh run: reset everything, then start playing.
    const fresh = createGame(Math.floor(Math.random() * 4294967296));
    Object.assign(game, fresh);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startMusic();
    announce('Playing. Welcome to Port Meridian.');
  }

  function continueSave() {
    const data = readSave();
    if (data) loadData(game, data);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startMusic();
    announce('Playing. Welcome back to Port Meridian.');
  }

  function pauseGame() {
    screen = SCREEN_PAUSED;
    writeSave();
    audio.setEngine(0, false);
    audio.setSiren(false, 0);
    announce('Paused.');
  }

  function resumeGame() {
    screen = SCREEN_PLAY;
    announce('Playing.');
  }

  function handleActions() {
    if (screen === SCREEN_TITLE) {
      if (wasPressed('confirm')) {
        if (hasSave()) continueSave();
        else startFresh();
      } else if (wasPressed('new')) startFresh();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (wasPressed('confirm')) {
        respawn(game);
        writeSave();
        screen = SCREEN_PLAY;
        announce('Playing. You wake up at Meridian General.');
      }
      return;
    }
    if (wasPressed('pause')) {
      if (screen === SCREEN_PLAY) pauseGame();
      else if (screen === SCREEN_PAUSED) resumeGame();
    }
    if (screen === SCREEN_PAUSED && wasPressed('confirm')) resumeGame();
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const input = {
      walk: walkInput(),
      drive: driveInput(),
      run: isHeld('run'),
      brake: isHeld('brake'),
      enter: wasPressed('enter'),
      punch: wasPressed('punch'),
    };
    stepGame(game, STEP, input);
    if (wasPressed('horn')) audio.sfx('horn');
    drainEvents();
    if (game.over) {
      screen = SCREEN_OVER;
      audio.setEngine(0, false);
      audio.setSiren(false, 0);
      announce(game.over.type === 'wasted' ? 'Wasted. Press Enter to wake up at Meridian General.' : 'Busted. Press Enter to wake up at Meridian General.');
    }
    // Autosave while playing, quietly.
    if (game.autosaveTimer <= 0) {
      game.autosaveTimer = 30;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE) {
      // The city stays alive behind the title: traffic drives, people stroll.
      while (accumulator >= STEP) {
        stepGame(game, STEP, IDLE_INPUT, true);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Sound follows the game, not the menus.
    if (screen === SCREEN_PLAY) {
      const car = playerCar(game);
      const speed01 = car ? Math.min(1, Math.abs(car.speed) / 760) : 0;
      audio.setEngine(speed01, car !== null);
      audio.setSiren(game.wanted.stars > 0 && nearestPoliceDistance(game) < 700, STEP);
    }
    renderer.draw(game, screen, { hasSave: hasSave() });
    endFrameInput();
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) pauseGame();
  });

  announce('Port Meridian. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
