# Repository Guidelines

## Project Structure & Module Organization

This WXT extension uses Vue 3, TypeScript, and UnoCSS to download X/Twitter videos.

- `entrypoints/`: capture/content scripts, background download management, and popup, options, and welcome pages.
- `components/video/`: shared UI; `composables/`: reactive download and selection logic.
- `utils/`, `types/`, `constants/`: validation, preferences, shared types, and constants.
- `locales/`: five YAML translations; `assets/images/downloader.svg`: source icon.
- `tests/*.test.ts`: automated tests; `docs/screenshots/`: UI previews.
- `dist/` and `.wxt/`: generated output; do not edit or commit.

## Build, Test, and Development Commands

Use Node.js LTS and the pnpm version pinned in `package.json`.

- `pnpm install`: install dependencies and prepare WXT types.
- `pnpm dev` / `pnpm dev:firefox`: start browser development sessions.
- `pnpm build` / `pnpm build:firefox`: build into `dist/chrome-mv3` / `dist/firefox-mv3`.
- `pnpm zip` / `pnpm zip:firefox`: package distributable archives.
- `pnpm test`: run Node.js tests through `tsx`.
- `pnpm typecheck`: check TypeScript and Vue types.
- `pnpm lint`: run ESLint; `pnpm format`: apply oxfmt; `pnpm format:check`: verify formatting.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, and trailing commas. Follow `eslint.config.mjs` and `.oxfmtrc.jsonc`. Use TypeScript, Vue Composition API with `<script lang="ts" setup>`, PascalCase component filenames, and `useXxx.ts` composables. Prefer `@ntnyq/utils` for general utilities. Keep translation keys and placeholders consistent across all locales.

## Testing Guidelines

Use `node:test` and `node:assert/strict` in `tests/<feature>.test.ts`, with descriptive behavior-based test names. Add regression coverage for parsing, message validation, downloads, preferences, and lifecycle changes. No numeric coverage threshold is configured. Before submitting, run tests, formatting checks, lint, typecheck, and both browser builds. For UI changes, check popup/content interactions and narrow layouts; distinguish mocked browser checks from real X/Firefox verification.

## Commit & Pull Request Guidelines

Follow the history's Conventional Commit prefixes: `feat:`, `fix:`, and `chore:`. Keep commits focused. PRs should describe behavior changes, link relevant issues, list validation performed, and include screenshots for UI changes.

## Security Boundaries

Preserve sender and payload validation. Accept downloads only from HTTPS MP4 URLs on `video.twimg.com`. Capture existing page responses without collecting authentication tokens or bypassing access restrictions.

## Agent Instructions

Follow @/Users/ntnyq/.codex/RTK.md. Prefix shell commands with `rtk`, except `pnpm typecheck`. Use the user-managed pnpm and preserve PATH and Node.js:

```sh
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm test
PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm typecheck
```

Apply that PATH prefix to every pnpm invocation. Never modify Codex's bundled pnpm or runtime cache.
