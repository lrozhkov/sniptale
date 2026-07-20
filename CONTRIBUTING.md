# Contributing to Sniptale

Sniptale welcomes bug reports and focused product or engineering proposals. Describe observed behavior, expected behavior, reproduction steps, environment details, and relevant logs without credentials or private data. A proposal should state the user problem, intended outcome, and important constraints.

Sniptale does not currently accept external code contributions. Please do not submit implementation patches or pull requests unless the repository owner has explicitly requested them. Unsolicited patches and pull requests may be closed without review or inclusion in the project.

Submitting a report or proposal does not guarantee implementation or a response. Public reports must not contain credentials, personal data, private recordings, or undisclosed security details.

## Maintainer workflow

`main` is the only long-lived branch. Maintainer changes use a short-lived `feat/*`, `fix/*`, `refactor/*`, `chore/*`, or `codex/*` branch and a pull request with a Conventional Commit title. Required QA and review must be green before squash merge; merged branches are deleted. Releases are immutable `vX.Y.Z` tags created from `main`, without permanent develop, release, or hotfix branches.

## Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Lev Rozhkov is the accountable enforcement owner.
