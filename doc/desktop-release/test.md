# Desktop release verification · 2026-10-27

Requested initial release: **0.0.1 / v0.0.1**. Local environment: macOS, Bun 1.3.5, Vite 6, actionlint 1.7.12. Version CLI probe generated `{ "version": "0.0.1" }` without changing the source config (`evidence/version.log`). The existing local app config is 0.0.1; the workflow overrides CI version from the validated tag.

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen Bun install | 156 installs / 214 packages, unchanged | `evidence/frozen-install.log` |
| Packaging regression | 5 cases pass, included in full suite | `test/release_packaging.test.ts` |
| Workflow integration | 2 tests pass; publication test covers missing release, existing draft/public release, failed create/upload | `evidence/workflow-integration.log` |
| Source archives | Tracked exact-commit contents verified in ZIP/tar.gz, modified/untracked files excluded, SHA256 payloads checked | same integration suite |
| Static validation | actionlint passes; node --check passes; all 15 embedded Bash blocks parse | `evidence/actionlint.log` |
| Full `bun test` | **2197 pass / 0 fail**, 196 files, 13951 assertions, 38.14s | `evidence/full.log` |
| `bun run type-check` | Pass | `evidence/type-check.log` |
| `bun run build` | Pass, 2.71s | `evidence/build.log` |
| Whitespace | `git diff --check` passes | local check |

Initial actionlint failure (job-level runner.temp context) was fixed by moving the path to consuming step envs. The source ZIP assertion was corrected to distinguish explicit directory entries from file entries. Subsequent checks passed. Existing React act warnings remain in the full suite output; no claim of a warning-free test environment.

The workflow pins official checkout/upload/download/setup-bun action SHAs and builds on native macOS ARM/Intel, Ubuntu 22.04 x64 and Windows 2022 x64 runners. Only the final job has write permission. It requires checks plus every native build before creating/publishing a release, verifies tag/SHA, collects required packages, creates source archives, verifies SHA256SUMS, uploads to a draft, then publishes. A failed upload cannot run the publication command; a public release is not overwritten. These shell behaviors were exercised against a fake gh executable, never GitHub publication APIs.

No remote tag was pushed; no GitHub workflow run or real release was created. Hosted native compilation/bundling, real GITHUB_TOKEN policies and signing/notarization were not exercised locally. Native binary success must be confirmed by the first Actions run. Builds have no configured distribution-signing credentials. See [usage](./README.md) for publishing v0.0.1. Final implementation hashes are in `evidence/source.json`.

**ACCEPTANCE: PASS for implementation and local verification; hosted execution pending.**
