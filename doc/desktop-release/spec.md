# Cross-platform desktop releases

2026-10-27. Add a GitHub Actions workflow to build TauDesign and release binaries and source from one tagged commit. Initial requested app version is **0.0.1**, manual tag default `v0.0.1`; the existing local Tauri config already has this version.

- Trigger on `v*` tags or manual dispatch with an existing version tag. Validate SemVer and resolve it once to a commit; all jobs check out that SHA. CI overrides only Tauri's release version with the tag, without changing local version files.
- Native runners: macOS Apple Silicon and Intel (`.app.tar.gz`, preserving permissions/symlinks), Ubuntu 22.04 x64 (`.deb` + `.AppImage`), Windows x64 (NSIS setup `.exe`). Local packaging defaults stay unchanged. No signing credentials are required; binaries are unsigned/unnotarized.
- Track the current Bun lockfile, use Bun 1.3.5/frozen installs and Cargo `--locked`. Frontend test/type/build gate precedes the build matrix. Linux installs Tauri 2 system prerequisites.
- Build jobs have read-only repository permissions. Only the final release job has `contents: write`. Do not interpolate untrusted tag input into shell code. Unique artifact names, missing package failures, all-success release dependency, no partial public release.
- Source `.zip`/`.tar.gz` archives use `git archive` on the same SHA, excluding ignored/untracked local files. SHA256SUMS covers all payloads. Verify tag/SHA before publishing. Create or resume a draft, upload complete assets, then publish; existing public releases are not overwritten. Prerelease tags create prereleases.
- This task writes the workflow and supporting collector; it does not push tags or create a live release. Hosted OS builds require the first GitHub run; local validation cannot claim Windows/Linux binaries were built.

References: https://v2.tauri.app/distribute/pipelines/github/ ; https://docs.github.com/en/actions/reference/runners/github-hosted-runners ; https://cli.github.com/manual/gh_release_create

## Installation policy update · 2026-10-28

The user requested plain `bun install` after an Actions installation was canceled. Both the frontend check job and native build matrix shall use `bun install`, retaining Bun 1.3.5, the tracked lockfile and Cargo `--locked`. Bun may resolve or update the lockfile within the ephemeral runner; those changes are not committed. Release source archives still use the original tagged SHA.

The Bun frozen-install requirement above is deprecated on 2026-10-28 and superseded by this section at the user's request; the original requirement is retained as history. A canceled operation alone does not establish a lockfile mismatch. This policy change cannot establish that a hosted cancellation is fixed without another Actions run.
