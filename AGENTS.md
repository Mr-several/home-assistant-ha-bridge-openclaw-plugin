# Repository Guidelines

## Project Structure & Module Organization
- `index.ts` is the plugin entrypoint; it registers the `ha-bridge` service and CLI commands.
- Core logic lives under `src/`:
  - `src/service/` orchestrates runtime flow.
  - `src/ha/` manages Home Assistant WebSocket transport.
  - `src/dispatch/` builds and executes OpenClaw command argv.
  - `src/pipeline/` contains dedupe, queue, and rate-limit guards.
  - `src/cli/`, `src/state/`, and `src/template/` hold CLI wiring, runtime state, and rendering.
- Tests are in `test/*.test.ts`.
- Plugin metadata/schema lives in `openclaw.plugin.json`.
- Local SDK typings are in `types/openclaw-plugin-sdk.d.ts`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm test`: run all Vitest tests once.
- `npm run test:watch`: run Vitest in watch mode for local iteration.
- `npm run check`: run strict TypeScript checks (`tsc --noEmit`).
- Integration with OpenClaw:
  - `openclaw plugins install -l .`
  - `openclaw plugins enable ha-bridge`

## Coding Style & Naming Conventions
- Language: TypeScript (ESM, strict mode).
- Use 2-space indentation, semicolons, and double quotes.
- Keep relative imports ESM-compatible with `.js` suffixes (for TS source imports).
- File names use kebab-case (for example, `ha-bridge-service.ts`).
- Use `PascalCase` for classes/types, `camelCase` for functions/variables, and `UPPER_SNAKE_CASE` for constants.

## Testing Guidelines
- Framework: Vitest (`environment: "node"`).
- Name tests `*.test.ts` and place them in `test/`.
- Prefer focused `describe` blocks per module behavior (`config`, `ws-client`, dispatch/routing, reconnect).
- For networking behavior, use ephemeral local servers (`WebSocketServer({ port: 0 })`).
- Before opening a PR, run `npm test && npm run check`.

## Commit & Pull Request Guidelines
- This directory snapshot has no local `.git` history; use Conventional Commit style by default (`feat:`, `fix:`, `test:`, `chore:`).
- Keep commits scoped to one concern.
- PRs should include: intent summary, config/schema impact, and test evidence.
- If dispatch behavior changes, include example command argv or CLI output (`ha-bridge dry-run`).

## Security & Configuration Tips
- Never commit real `haToken` values or private HA endpoints.
- Prefer `wss://.../api/websocket` outside local networks.
- Keep `maxMessagesPerMinute`, `queueMax`, and reconnect settings aligned with expected event volume.
