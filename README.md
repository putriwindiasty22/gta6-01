# Port Meridian

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/putriwindiasty22/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/putriwindiasty22/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Meridian** is an original open-world crime game set in a sun-soaked modern coastal city. Walk the promenade, steal a car off the street, outrun the Meridian police as your wanted level climbs, and work through three story jobs: a courier delivery against the clock, losing the heat after tripping an alarm, and collecting five drops stashed around town. Traffic and pedestrians fill the streets, the HUD tracks your health, money, wanted stars and mission objective on a live minimap, and your progress saves automatically. Everything — the city, the names, the art and the synthesised sound — is original, built from scratch in plain canvas JavaScript with no libraries and no network requests.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome.

- **WASD / Arrow keys** — walk and drive
- **E** — get in / out of a car
- **F** — punch
- **SPACE** — brake
- **SHIFT** — run
- **H** — horn
- **P** — pause

## How it is built

`game/` holds the whole game as static files: `index.html` plus one ES module per job under `game/src/` — `config` (tuning and palette), `world` (the city), `vehicles` (driving and traffic), `pedestrians`, `police` (wanted level and pursuit), `missions` (the three jobs), `audio` (WebAudio synthesis), `render` (canvas drawing, HUD and minimap), `state` (the game step) and `main` (the loop, screens and saving). `main.ts` at the repository root copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.

<sub>Entered on [make.fun](https://make.fun/?ref=xch7gh1j&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
