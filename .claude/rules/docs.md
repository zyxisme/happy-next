---
paths:
  - docs/**
---

Never commit changes under `docs/` **subdirectories** (e.g. `docs/superpowers/`) — those are local reference only, not shipped with code.

Files directly at the `docs/` root that are already git-tracked (e.g. `docs/changes-from-happy.md`, `docs/changes-from-happy.zh-CN.md`) are shipped docs and **may** be committed — the `/release` flow maintains them.
