# Change Log

All notable changes to the "capataz" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Added shared Luau import and Client/Server/Shared boundary analysis, including canonical custom-requirer detection and live VS Code diagnostics for unsaved changes.
- Added CLI commands for project initialization, system management, project generation/validation, import checks, dependency graphs/explanations, toolchain diagnostics, and Rojo development workflows.
- Added JSON output, strict checks, dry runs, standalone executable packaging, and a tagged-release workflow for Rokit distribution.
- Extracted project operations from VS Code and repaired the starter bootstraps/example import so new projects have no undeclared package dependency.
