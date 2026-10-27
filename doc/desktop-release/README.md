# Desktop release usage

Initial app release: **0.0.1** (`v0.0.1`). Workflow: `.github/workflows/release.yml`.

After committing these files, create and push a tag on the commit containing the workflow:

```bash
git tag v0.0.1
git push origin v0.0.1
```

Alternatively, after pushing an existing tag, use **Actions → Desktop release → Run workflow → tag: v0.0.1**. The tag must exist; the workflow never creates it from an arbitrary default branch. Future tags can use `vX.Y.Z` or `vX.Y.Z-beta.1`. The tag determines the CI app version via a temporary Tauri config; local packaging settings are unchanged. To publish from Actions the repository must permit its built-in `GITHUB_TOKEN` to write releases; no custom PAT is used.

The four native jobs produce:

| Platform | Release assets |
| --- | --- |
| macOS Apple Silicon | `TauDesign-0.0.1-macos-arm64.app.tar.gz` |
| macOS Intel | `TauDesign-0.0.1-macos-x64.app.tar.gz` |
| Linux x64 | `TauDesign-0.0.1-linux-x64.deb`, `TauDesign-0.0.1-linux-x64.AppImage` |
| Windows x64 | `TauDesign-0.0.1-windows-x64-setup.exe` |
| Source | `TauDesign-v0.0.1-src.zip`, `TauDesign-v0.0.1-src.tar.gz` |
| Integrity | `SHA256SUMS` |

macOS archives preserve the `.app` executable modes and symlinks. Downloaded AppImages may need `chmod +x`. These builds have no distribution-signing/notarization credentials; this workflow does not establish an Apple Developer ID or Windows publisher signature.

Unit/type/frontend build checks must pass before native builds start; all native builds must pass before any release is published. Assets upload to a draft first; upload failure leaves it unpublished. Rerunning can resume a draft; an existing public release is never overwritten. A moved version tag fails final SHA verification. Source archives include only files tracked at the built commit, with a versioned root directory. Build artifacts remain available for 14 days even when another platform fails.

Local checks: `bun test test/release_packaging.test.ts`, `python3 -m unittest scripts.tests.test_release_workflow -v` (PyYAML), and `actionlint .github/workflows/release.yml`. These validate packaging and workflow logic; actual Windows/Linux/macOS hosted binaries require running Actions.
