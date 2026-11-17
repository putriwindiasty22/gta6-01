// Port Meridian, handed in: a Node 22 program, standard library only, that copies
// this repository's game/ and screenshots/ into the output directory and writes
// /output/dossier.json with the vendored make.fun library. The game itself is plain
// static files — game/index.html and its ES modules, no library and no network
// request — so any static server can host it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from the kit's reference/gate.json): only text_max_bytes
// shapes the dossier's bytes; the others refuse an entry the scorer would refuse —
// more than 4 screenshots or one over 256 KiB, more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/**
 * Refuse to hand in a broken output: the game entrypoint must be there, the
 * screenshots must be 3 or 4 in range, and the dossier must fit its own cap.
 * A failed build should fail here, loudly, not at the grader.
 */
function verifyOutput(outDir) {
  const gameIndex = join(outDir, 'game', 'index.html');
  if (!existsSync(gameIndex)) throw new Error(`missing ${gameIndex}`);
  const shots = readdirSync(join(outDir, 'screenshots')).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > DOSSIER_LIMITS.screenshots.max) {
    throw new Error(`expected 3-4 screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(outDir, 'screenshots', name)).size;
    if (size > DOSSIER_LIMITS.screenshots.max_bytes) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  const dossierSize = statSync(join(outDir, 'dossier.json')).size;
  if (dossierSize > 1572864) throw new Error(`dossier.json is ${dossierSize} bytes, over the 1.5 MiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_LIMITS));
verifyOutput(out);
