// Keyboard input: held keys for movement, edge-triggered presses for actions.
// Arrow keys and WASD both drive; the page never scrolls while playing.
const HELD = new Set();
const PRESSED = new Set();

const CODE_ALIASES = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'enter',
  KeyF: 'punch',
  Space: 'brake',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  KeyM: 'mission',
  KeyN: 'new',
  KeyH: 'horn',
};

export function attachInput() {
  window.addEventListener('keydown', (event) => {
    const action = CODE_ALIASES[event.code];
    if (!action) return;
    if (['up', 'down', 'left', 'right', 'brake'].includes(action)) event.preventDefault();
    if (!event.repeat) PRESSED.add(action);
    HELD.add(action);
  });
  window.addEventListener('keyup', (event) => {
    const action = CODE_ALIASES[event.code];
    if (action) HELD.delete(action);
  });
  window.addEventListener('blur', () => {
    HELD.clear();
  });
}

export function isHeld(action) {
  return HELD.has(action);
}

/** True once per key press; consumed at the end of each frame by the game loop. */
export function wasPressed(action) {
  return PRESSED.has(action);
}

export function endFrameInput() {
  PRESSED.clear();
}

/** A simple steering/throttle pair in [-1, 1] for the current frame. */
export function driveInput() {
  const steer = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
  const throttle = (isHeld('up') ? 1 : 0) - (isHeld('down') ? 1 : 0);
  return { steer, throttle };
}

export function walkInput() {
  const x = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
  const y = (isHeld('down') ? 1 : 0) - (isHeld('up') ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0, moving: false };
  return { x: x / length, y: y / length, moving: true };
}
