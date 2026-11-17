
# ScoreMotion Development Rules

## Exploration
- Start by identifying the smallest relevant code area.
- Prefer targeted rg searches over repository-wide reads.
- Read complete files only when necessary to understand dependencies.
- Do not inspect generated videos, caches, or build outputs unless relevant.

## Implementation
- Preserve all existing features unless removal is explicitly requested.
- Prefer minimal, localized changes.
- Do not refactor unrelated code.
- Reuse existing dependencies when possible.

## Compatibility
- Preserve project.json schema_version.
- Maintain backward compatibility with saved projects.
- Keep preview and exported video behavior consistent.

## Verification
- Run focused checks for changed functionality first.
- Run broader regression checks for shared rendering changes.
- On failure, report the relevant error excerpt instead of dumping full logs.
- Never skip essential correctness checks to reduce tokens.

## Reporting
- Summarize changes, affected files, tests, and remaining risks.
- Avoid repeating unchanged explanations.
