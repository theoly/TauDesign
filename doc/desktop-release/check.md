# Acceptance
- [x] Valid version tags produce exact metadata; malformed tags and missing bundles fail. Packages have unique OS/architecture names; macOS archive retains executable bits and symlinks.
- [x] Workflow compiles on native macOS ARM/Intel, Linux x64 and Windows x64; Linux prerequisites and frozen Bun/Cargo dependencies are configured.
- [x] Release waits for checks/all binaries, creates source from the same SHA, hashes all payloads, publishes only after successful upload, and refuses to overwrite public releases.
- [x] YAML/actionlint and shell/JS validation pass. Full tests, TypeScript and production build pass. Hosted-build limitation explicitly recorded.

First validation: [!] actionlint found runner context unavailable in job env; archive test found harmless explicit directory entry. Returned for fixes before final acceptance. Issues are recorded here; the same log paths now contain the successful reruns.


Final evidence (2026-10-27):
- `test/release_packaging.test.ts`: 5 cases, tag validation including 0.0.1/newlines, missing/empty/ambiguous packages, platform names, macOS actual tar extraction and permissions/symlinks.
- `scripts/tests/test_release_workflow.py`: 2 integration tests; exact committed source vs modified/untracked files, source archive contents/checksums, five draft/public/upload/create scenarios against a fake gh. `evidence/workflow-integration.log`.
- actionlint 1.7.12, JS syntax and all 15 Bash blocks passed. Frozen Bun install passed unchanged. `evidence/actionlint.log`, `frozen-install.log`, `version.log`.
- Full regression 2197/0, type-check and build passed. `test.md` and `evidence/{full,type-check,build}.log`.

Matrix/native build acceptance above concerns the validated workflow configuration, not actual hosted binaries. No remote tag or release was created during local validation.

## Install command adjustment · 2026-10-28

The earlier frozen Bun requirement is historical; the current installation policy is in `spec.md` under Installation policy update.

- [x] Both dependency installation steps use `bun install`; no frontend frozen-install command remains. Workflow diff verifies both steps.
- [x] Fixed Bun version, native matrix, Cargo lock and publication dependencies are preserved. Workflow diff changes only the two installation commands.
- [x] Workflow/static and integration checks, full tests, type-check and build pass. See `test.md`, 2026-10-28 addendum.
- [x] Hosted cancellation is not reported as resolved without a confirming run. Run 40621539382 shows installation canceled after approximately 20 minutes, consistent with the check job timeout; no lockfile error was logged.
