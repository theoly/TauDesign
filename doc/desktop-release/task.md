# Tasks
- [x] R1 Lock dependencies and add version/asset helper with targeted safety/packaging tests.
- [x] R2 Add tag/manual workflow, gated native matrix, exact-source archives and final publication.
- [x] R3 Validate workflow and scripts, run full test → type-check → build; document usage and verification limits.

Validation return #1: actionlint rejected runner.temp in job-level env (only permitted at step level). Move release-config path into the two consuming steps. Archive integration test also assumed git zip omitted directory entries; correct the assertion to compare files. No remote release was attempted.

2026-10-27: All local acceptance checks passed; hosted native builds/publication remain explicitly unexecuted until the tag workflow runs.
