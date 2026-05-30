## Interaction Rules

- **Always suggest options when asking questions** — when clarifying requirements, provide concrete recommendations or choices to help the user decide quickly, rather than open-ended questions

## Language Preference

- Respond in Simplified Chinese unless the user explicitly requests another language

## Repository Overview

Yarn 1.x monorepo (`yarn@1.22.22`).

| Package | Purpose |
|---------|---------|
| **happy-app** | Expo/React Native mobile + web client |
| **happy-cli** | CLI wrapper for Claude Code, Codex, Gemini |
| **happy-server** | Fastify backend (API + Socket.IO) |
| **happy-voice** | LiveKit-based voice gateway |
| **happy-wire** | Shared Zod schemas and wire types |

## Type Checking (run after all changes)

Run `yarn typecheck` in the package you modified. In happy-server the command is `yarn build` (which is `tsc --noEmit`, not a real build step).

## happy-wire (run after every change)

After modifying the **happy-wire** package, always run `yarn build` in it — consumers depend on its compiled `dist` output, so changes won't take effect until rebuilt.

## Running a Single Test (Vitest)

```bash
npx vitest run path/to/file.test.ts
```
