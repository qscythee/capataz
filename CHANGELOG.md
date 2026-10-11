# Change Log

## 0.1.0

- Add reusable named `systemRoots` and explicit per-project `systemMounts`. Shared-system mutations regenerate all consumers, while ordinary Core/module placement follows authored trees. Add source-root selection, place-aware Explorer actions, configurable route metadata mounts, and explicit relocated CustomRequirer declarations. Runtime and lint routing support named system-root aliases.

- Add managed `projects` layouts with independent Systems roots, shared/mapped Core sources, per-place route metadata, automatic lint targets, named CLI selection, all-project generation/checks, and place-aware Explorer actions. Init scaffolds the selected source layout; watch generates registered layouts while preserving authored lint-only projects.

- Fix Explorer context actions on Windows by matching VS Code native resource paths; retain URI paths for remote workspaces.

- Add per-command `--project-file` output selection for init, system new/remove, and project generate/check. VS Code writing commands prompt when multiple projects exist or the configured default is missing; cancelling occurs before mutations.

- Add top-level `projectFile` for generated output. Replace `dev` with self-contained `watch [project-file]`: preserve alternate projects, regenerate the configured default, and incrementally lint the selected tree without running Rojo or generating sourcemaps.
- Add named `lint.targets` with project-derived membership and optional `includeGlobs`, CLI target selection, and separate incremental VS Code caches with target-labelled diagnostics.

- Support nested grouping folders while preserving the hierarchy in generated service mounts, imports, and lint boundaries.
- Recognize systems by the `System` suffix or a `system.json` file containing `{}`. New systems use the suffix by default.
- Support full system paths in CLI and VS Code create/list/delete workflows; refuse group deletion. Context menus recognize configured roots, empty/nested groups, and marked legacy systems; actions target the clicked workspace.
- Preserve configured route aliases and automatic Roblox service routes inside nested systems.
- Watch compatibility markers for editor diagnostic rebuilds; reject invalid layouts before rewriting generated output.

### Migration

Unsuffixed systems must add `system.json` containing `{}` or be renamed to end in `System`. Before using nested runtime imports, update the project's CustomRequirer from the 0.1.0 template, preserve custom changes, and regenerate the project and SystemRoutes. Existing source is not overwritten automatically. See the README for migration steps.
