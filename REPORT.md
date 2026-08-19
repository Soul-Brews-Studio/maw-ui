# Issue #82 report

- Disposition: retired `arena.html`, `talk.html`, `timemachine.html`, and `shrine.html` from Vite build inputs; their source remains unchanged but they are absent from shipped output.
- Inventory: the focused test accounts for all 17 documents as 13 gated React entries plus four unshipped legacy entries.
- Red-first: on base `7cea00c2c776307b90b08c5a5261add4f1a03a7c`, `bun test legacyDocuments.test.ts` failed both named source and built-output retirement assertions because all four documents were present.
- Green: the focused test passed twice with identical normalized output (2 tests, 19 assertions each).
- Gates: `npx tsc --noEmit`, `bun test` (135 tests), and `bun run build` passed.
- Scope: no auth internals, deploy configuration, CI, legacy document source, or token handling changed.
