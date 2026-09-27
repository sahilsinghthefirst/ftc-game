# FieldLab

A browser-based FTC outreach game: assemble a modular 3D robot, then drive it against a bot in Artifact Rush. Designed for elementary and middle school players. This is an unofficial FIRST-inspired educational prototype, not an official competition simulator.

## Local development

Use Node.js 24 LTS and npm. The lockfile is checked in; use `npm ci` for reproducible installation.

```sh
git clone https://github.com/sahilsinghthefirst/ftc-game.git
cd ftc-game
npm ci
npm run dev -- --port 3001
```

Open http://localhost:3001. A browser with WebGL support is required. No API keys or database setup are needed for the current gameplay.

## Checks

```sh
node --test tests/*.mjs
npx tsc --noEmit
npm run build
```

Manual smoke test: assemble a robot, start a match, drive with WASD or arrows, hold Space to collect and score, pause/resume, and finish a match. Check touch controls on a narrow viewport too. ARTIFACTS score nothing on their own: purple ones count 1.5 toward the GOAL and green ones 1, so the GOAL tips at 10 for 20 points and rolls those ARTIFACTS back onto the mats, where they must be visible again. Purple ARTIFACTS fill two storage slots in every module except the Low Rider Hopper.

## Code map

- `app/field-lab.tsx`: workshop flow, loadouts, briefing, and results.
- `app/assembly-bay.tsx`, `app/robot-3d.tsx`: interactive assembly and workshop view.
- `app/robot-model.ts`: shared procedural robot geometry and moving parts.
- `app/game-arena.tsx`: match loop, controls, bot, scoring, and HUD.
- `app/field.ts`: field geometry - a 6 x 6 square of foam mats, with the goals, bases, and ARTIFACT positions every other module reads from.
- `app/robot-physics.ts`: driving, braking, and rolling-ball interactions.
- `app/match-guidance.ts`: collection guidance, per-part gameplay tables, and the GOAL tipping rule.
- `app/bot-driver.ts`: the opposing bot's steering, obstacle avoidance, and stuck recovery.
- `app/arena-scene.ts`, `app/scene-kit.ts`: Three.js field, cameras, materials, and animations.
- `tests/`: focused gameplay regression tests.

Stack: React, TypeScript, Vinext/Vite, Three.js, and Tailwind CSS.

## Working together

Branch from the latest `main`, make focused changes, run the checks, and open a pull request. Avoid committing dependency directories, build output, local recordings, or credentials; these are excluded by `.gitignore`. Coordinate changes to the main match loop and shared robot model to reduce conflicts.

## Hosting

The existing hosted game is at https://fieldlab-ftc-outreach.gensahilsingh.chatgpt.site/. `.openai/hosting.json` identifies that Sites project and is used by the Vite configuration; it contains no deployment credentials. GitHub pushes alone do not update that hosted site. Production publication is a separate, authorized step.

### Static export

`npm run build` targets Cloudflare Workers: it emits client assets plus a worker that renders the HTML shell per request. For static hosts, `npm run build:static` boots that worker once, snapshots the shell it renders, and writes it alongside the client assets into `out/`. FieldLab is a single route with no server data, so the snapshot hydrates and plays exactly like the worker-served build.

```sh
npm run build:static
```

`out/` is a plain static directory any static host can serve. It includes a `vercel.json` with immutable caching for `/_next/static` and a catch-all rewrite to `index.html`. Deploy it with `cd out && npx vercel deploy --prod`; this needs an interactive `npx vercel login` first, and publishing is a separate, authorized step.

The physics are intentionally forgiving for younger players. Multiplayer, full season-rule fidelity, and engineering-grade simulation are not implemented.
