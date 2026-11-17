// Drawing only: the game state and the current screen in, pixels out. The 1280x720
// view is scaled to fit the window and centred. The world is drawn first, then the
// HUD — health, money, wanted stars, mission objective, speed, clock and a live
// minimap — then the screen panels. HUD corners are opaque panels, so no car or
// pedestrian ever covers a label.
import { CAR, DISTRICTS, FONT, PALETTE, VIEW, WORLD } from './config.js';
import { clamp } from './random.js';
import { missionTarget } from './missions.js';
import { playerCar } from './vehicles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: 16, y: 534, w: 216, h: 170, mapW: 200, mapH: 148 };
const UMBRELLAS = [
  { x: 420, y: 2220, c: '#e84c3d' }, { x: 900, y: 2240, c: '#ffd23f' },
  { x: 1500, y: 2210, c: '#3d7bd9' }, { x: 2100, y: 2245, c: '#3aa655' },
  { x: 2650, y: 2220, c: '#d94f7a' }, { x: 1150, y: 2255, c: '#e8a13d' },
];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has('p' + size)) fonts.set('p' + size, `${size}px ${FONT}`);
    ctx.font = fonts.get('p' + size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function star(x, y, size, filled) {
    ctx.fillStyle = filled ? PALETTE.star : PALETTE.starEmpty;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? size : size * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function districtName(g) {
    for (let i = DISTRICTS.length - 1; i >= 0; i -= 1) {
      const d = DISTRICTS[i];
      if (g.player.x >= d.x && g.player.x < d.x + d.w && g.player.y >= d.y && g.player.y < d.y + d.h) return d.name;
    }
    return 'Port Meridian';
  }

  function clockText(g) {
    const mins = Math.floor(g.clockMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---- world ----

  function drawWorld(g) {
    const cam = g.camera;
    const x0 = cam.x - 60;
    const y0 = cam.y - 60;
    const x1 = cam.x + VIEW.width + 60;
    const y1 = cam.y + VIEW.height + 60;

    // Ground and mowing stripes.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let y = Math.floor(y0 / 120) * 120; y < y1; y += 240) ctx.fillRect(x0, y, x1 - x0, 120);

    // Beach and sea along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0, Math.max(y0, WORLD.beachY), x1 - x0, WORLD.waterY - Math.max(y0, WORLD.beachY));
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, Math.max(y0, WORLD.waterY), x1 - x0, WORLD.height - Math.max(y0, WORLD.waterY));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const wy = WORLD.waterY + 24 + i * 26;
      if (wy < y0 || wy > y1) continue;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 40) {
        const yy = wy + Math.sin(x / 90 + g.elapsed * 1.4 + i * 2) * 4;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Beach umbrellas.
    for (const u of UMBRELLAS) {
      if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
      ctx.fillStyle = u.c;
      ctx.beginPath();
      ctx.arc(u.x, u.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, 16, -Math.PI / 2, 0);
      ctx.fill();
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(u.x - 1, u.y, 2, 14);
    }

    // City blocks: pavement, then parks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const b of g.city.blocks ?? []) {
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    for (const park of g.city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(park.x + park.w / 2 - 6, park.y, 12, park.h);
      ctx.fillRect(park.x, park.y + park.h / 2 - 6, park.w, 12);
    }

    // Roads: surface, edge lines, dashed centre line.
    ctx.fillStyle = PALETTE.road;
    for (const rx of WORLD.roadsX) ctx.fillRect(rx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.beachY);
    for (const ry of WORLD.roadsY) ctx.fillRect(0, ry - WORLD.roadWidth / 2, WORLD.width, WORLD.roadWidth);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const rx of WORLD.roadsX) { ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD.beachY); }
    for (const ry of WORLD.roadsY) { ctx.moveTo(0, ry); ctx.lineTo(WORLD.width, ry); }
    ctx.stroke();
    ctx.setLineDash([]);
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        if (rx < x0 - 80 || rx > x1 + 80 || ry < y0 - 80 || ry > y1 + 80) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx - 34 + i * 14, ry - WORLD.roadWidth / 2 - 10, 7, 10);
          ctx.fillRect(rx - 34 + i * 14, ry + WORLD.roadWidth / 2, 7, 10);
        }
      }
    }

    // Buildings: shadow, walls, roof, vents.
    for (const b of g.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      const shadow = 4 + b.height * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + shadow, b.y + shadow, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 5);
      if (b.height >= 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 12, 0, Math.PI * 2);
        ctx.stroke();
        text('H', b.x + b.w / 2, b.y + b.h / 2 + 5, 14, 'rgba(255,255,255,0.7)', 'center');
      } else if (b.windows) {
        ctx.fillStyle = PALETTE.glass;
        for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 18) {
          for (let wy = b.y + 14; wy < b.y + b.h - 14; wy += 18) {
            ctx.fillRect(wx, wy, 8, 8);
          }
        }
      }
    }

    // Trees.
    for (const t of g.city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
      ctx.fillStyle = t.palm ? PALETTE.treeLight : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - 4 - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cash and mission drops.
    for (const p of g.pickups) {
      if (p.taken || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const pulse = 1 + Math.sin(g.elapsed * 4) * 0.12;
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2f9e4f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13 * pulse, 0, Math.PI * 2);
        ctx.fill();
        text('$', p.x, p.y + 6, 16, '#ffffff', 'center');
      } else {
        ctx.fillStyle = 'rgba(255,210,63,0.3)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = PALETTE.marker;
        ctx.fillRect(-11, -11, 22, 22);
        ctx.strokeStyle = '#8a6d00';
        ctx.lineWidth = 2;
        ctx.strokeRect(-11, -11, 22, 22);
        ctx.restore();
      }
    }

    // Mission marker: beam and pulsing ring.
    const target = missionTarget(g);
    if (target) {
      const pulse = 1 + Math.sin(g.elapsed * 5) * 0.15;
      ctx.fillStyle = 'rgba(255,210,63,0.18)';
      ctx.fillRect(target.x - 8, target.y - 120, 16, 120);
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
      ctx.fill();
      plainText(target.label, target.x, target.y - 46, 15, '#ffffff', 'center');
    }

    drawCars(g, x0, y0, x1, y1);
    drawPeds(g, x0, y0, x1, y1);
    drawPlayer(g);
    drawParticles(g);
  }

  function drawCars(g, x0, y0, x1, y1) {
    for (const car of g.cars) {
      if (car.x < x0 || car.x > x1 || car.y < y0 || car.y > y1) continue;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width, 7);
      ctx.fill();
      // Body.
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
      ctx.fill();
      if (car.driver === 'player') {
        ctx.strokeStyle = PALETTE.marker;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // Roof and windows.
      ctx.fillStyle = 'rgba(20,26,34,0.85)';
      ctx.beginPath();
      ctx.roundRect(-8, -CAR.width / 2 + 4, 20, CAR.width - 8, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(CAR.length / 2 - 4, -CAR.width / 2 + 5, 3, 5);
      ctx.fillRect(CAR.length / 2 - 4, CAR.width / 2 - 10, 3, 5);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-CAR.length / 2 + 1, -CAR.width / 2 + 4, 3, 5);
      ctx.fillRect(-CAR.length / 2 + 1, CAR.width / 2 - 9, 3, 5);
      if (car.kind === 'police') {
        // Doors stripe and flashing light bar.
        ctx.fillStyle = '#1c2f4a';
        ctx.fillRect(-10, -CAR.width / 2, 18, CAR.width);
        const flash = Math.floor(g.elapsed * 6 + car.sirenPhase) % 2 === 0;
        ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
        ctx.beginPath();
        ctx.roundRect(-4, -CAR.width / 2 - 2, 8, CAR.width + 4, 3);
        ctx.fill();
        ctx.fillStyle = flash ? 'rgba(255,59,48,0.25)' : 'rgba(47,123,255,0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPeds(g, x0, y0, x1, y1) {
    for (const ped of g.peds) {
      if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
      if (ped.state === 'down') {
        ctx.save();
        ctx.translate(ped.x, ped.y);
        ctx.rotate(ped.angle + Math.PI / 2);
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ped.skin;
        ctx.beginPath();
        ctx.arc(15, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      const swing = Math.sin(ped.walkPhase) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y + 8, 8, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(ped.x + Math.cos(ped.angle) * 2, ped.y + Math.sin(ped.angle) * 2 - 2, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // Walking feet.
      ctx.fillStyle = '#2e2e33';
      ctx.fillRect(ped.x - 5 + swing * 0.4, ped.y + 7, 4, 5);
      ctx.fillRect(ped.x + 1 - swing * 0.4, ped.y + 7, 4, 5);
    }
  }

  function drawPlayer(g) {
    const p = g.player;
    if (p.inCar !== null) return;
    // Blink while invulnerable after a hard hit.
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10);
    ctx.lineTo(p.x + Math.cos(p.angle) * 17, p.y + Math.sin(p.angle) * 17);
    ctx.stroke();
    // Punch swoosh.
    if (p.punchAnim > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, p.angle - 0.7, p.angle + 0.7);
      ctx.stroke();
    }
  }

  const PLAYER_RADIUS = 14;

  function drawParticles(g) {
    for (const p of g.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD ----

  function drawHud(g) {
    // Top-left: health and money.
    panel(16, 16, 248, 66);
    plainText('HEALTH', 28, 36, 12, PALETTE.hudMuted);
    ctx.fillStyle = '#20262e';
    ctx.beginPath();
    ctx.roundRect(96, 26, 152, 14, 7);
    ctx.fill();
    const hp = clamp(g.player.health / 100, 0, 1);
    ctx.fillStyle = hp < 0.3 ? PALETTE.healthLow : PALETTE.health;
    ctx.beginPath();
    ctx.roundRect(96, 26, 152 * hp, 14, 7);
    ctx.fill();
    text(`$${g.player.money}`, 28, 68, 22, PALETTE.money);

    // Top-right: wanted stars.
    panel(VIEW.width - 232, 16, 216, 52);
    plainText('WANTED', VIEW.width - 220, 36, 12, PALETTE.hudMuted);
    for (let i = 0; i < 5; i += 1) {
      star(VIEW.width - 156 + i * 26, 42, 11, i < g.wanted.stars);
    }

    // Top-centre: mission objective.
    const def = g.mission.index < 3 ? g : null;
    const objective = g.mission.objective || (g.storyComplete ? 'Story complete — free roam' : 'Reach the yellow marker to start the next job');
    const title = g.storyComplete ? 'PORT MERIDIAN — STORY COMPLETE' : (def && g.mission.index < 3 ? `JOB ${g.mission.index + 1}/3` : 'PORT MERIDIAN');
    const w = 560;
    panel((VIEW.width - w) / 2, 16, w, 52);
    text(title, VIEW.width / 2, 36, 13, PALETTE.marker, 'center');
    plainText(objective, VIEW.width / 2, 58, 15, PALETTE.hudText, 'center');

    // Message banner under the objective.
    if (g.messageTimer > 0 && g.message) {
      panel((VIEW.width - 620) / 2, 78, 620, 34);
      plainText(g.message, VIEW.width / 2, 101, 16, PALETTE.hudText, 'center');
    }

    // Bottom-right: district and clock on the left of the panel, speed on the right.
    const car = playerCar(g);
    panel(VIEW.width - 232, VIEW.height - 118, 216, 102);
    plainText(districtName(g), VIEW.width - 220, VIEW.height - 92, 13, PALETTE.hudMuted);
    plainText(clockText(g), VIEW.width - 220, VIEW.height - 68, 16, PALETTE.hudText);
    if (car) {
      const kmh = Math.round(Math.abs(car.speed) * 0.36);
      text(`${kmh}`, VIEW.width - 30, VIEW.height - 66, 40, PALETTE.hudText, 'right');
      plainText('km/h', VIEW.width - 30, VIEW.height - 44, 13, PALETTE.hudMuted, 'right');
    } else {
      text('ON FOOT', VIEW.width - 30, VIEW.height - 66, 24, PALETTE.hudText, 'right');
    }

    // Bottom-centre hints.
    const hints = [];
    if (car) hints.push('E — step out   SPACE — brake   H — horn');
    else hints.push('E — get in a car   F — punch   SHIFT — run');
    if (g.mission.stage === 'idle') hints.push('Walk into the yellow marker to start the job');
    plainText(hints.join('    ·    '), VIEW.width / 2, VIEW.height - 14, 14, 'rgba(255,255,255,0.75)', 'center');

    drawMinimap(g);
  }

  function drawMinimap(g) {
    const m = MINIMAP;
    panel(m.x, m.y, m.w, m.h);
    const sx = m.mapW / WORLD.width;
    const sy = m.mapH / WORLD.height;
    const ox = m.x + 8;
    const oy = m.y + 6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, m.mapW, m.mapH);
    ctx.clip();
    ctx.fillStyle = '#1d2b1a';
    ctx.fillRect(ox, oy, m.mapW, m.mapH);
    // Sea.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(ox, oy + WORLD.waterY * sy, m.mapW, m.mapH - WORLD.waterY * sy);
    // Roads.
    ctx.strokeStyle = '#6a7078';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const rx of WORLD.roadsX) { ctx.moveTo(ox + rx * sx, oy); ctx.lineTo(ox + rx * sx, oy + WORLD.beachY * sy); }
    for (const ry of WORLD.roadsY) { ctx.moveTo(ox, oy + ry * sy); ctx.lineTo(ox + m.mapW, oy + ry * sy); }
    ctx.stroke();
    // Mission marker.
    const target = missionTarget(g);
    if (target) {
      const pulse = 3 + Math.sin(g.elapsed * 5) * 1.5;
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(ox + target.x * sx, oy + target.y * sy, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic, police, player.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const car of g.cars) {
      if (car.kind === 'traffic') ctx.fillRect(ox + car.x * sx - 1, oy + car.y * sy - 1, 2, 2);
    }
    ctx.fillStyle = '#ff3b30';
    for (const car of g.cars) {
      if (car.kind === 'police') {
        ctx.beginPath();
        ctx.arc(ox + car.x * sx, oy + car.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const px = ox + g.player.x * sx;
    const py = oy + g.player.y * sy;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0c1018';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    plainText('PORT MERIDIAN', m.x + 8, m.y + m.h - 6, 11, PALETTE.hudMuted);
  }

  // ---- screens ----

  function drawBigPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 150 + lines.length * 30 + 64;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    panel(x, y, w, h);
    ctx.strokeStyle = accent ?? PALETTE.marker;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.hudText, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      plainText(lines[i], VIEW.width / 2, y + 108 + i * 30, 17, PALETTE.hudMuted, 'center');
    }
    text(prompt, VIEW.width / 2, y + h - 28, 20, PALETTE.marker, 'center');
  }

  function drawTitle(g, hasSave) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const lines = [
      'A sun-soaked coastal city. Three jobs. One way out.',
      'Drive, steal, run — and stay ahead of the Meridian police.',
      '',
      'WASD / Arrows — move & drive      E — get in / out of a car',
      'F — punch      SPACE — brake      SHIFT — run      P — pause',
      '',
      hasSave ? 'A saved game is waiting for you.' : 'No save yet — a fresh start in Port Meridian.',
    ];
    drawBigPanel('PORT MERIDIAN', lines, hasSave ? 'ENTER — Continue    N — New game' : 'Press ENTER to start', PALETTE.marker);
    plainText('An original open-world crime game — no real places, no real people.', VIEW.width / 2, VIEW.height - 24, 13, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawBigPanel('PAUSED', [
      'The city waits for you.',
      'WASD — move & drive    E — car    F — punch    SPACE — brake',
      'Your progress saves automatically when a job is done.',
    ], 'Press P or ENTER to resume');
  }

  function drawOver(g) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const wasted = g.over?.type === 'wasted';
    const lines = wasted
      ? ['You were wasted on the streets of Port Meridian.', `The hospital bill costs $100. You keep $${g.player.money}.`]
      : ['The Meridian police finally caught up with you.', `The fine is $150. You keep $${g.player.money}.`];
    drawBigPanel(wasted ? 'WASTED' : 'BUSTED', lines, 'Press ENTER to wake up at Meridian General', wasted ? '#e5534b' : '#2b6cb0');
  }

  /** Paint one frame: the world, then the HUD, then the screen panel. */
  function draw(g, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - g.camera.x * view.scale, view.y - g.camera.y * view.scale);
    drawWorld(g);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(g, ui.hasSave);
      return;
    }
    drawHud(g);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(g);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
