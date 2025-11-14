Contributing to node-backend-orm-starter

Thanks for your interest in contributing! This document explains the recommended workflow, code standards, and how to get your changes ready for review.

Table of contents
- Getting started
- Branching & PR workflow
- Code style and formatting
- Tests
- Linting and types
- Commit messages
- Reviewing and merging
- Reporting issues

Getting started
1. Fork the repository and clone your fork:
   git clone git@github.com:your-username/rentivo-backend.git
2. Install dependencies:
   npm install
3. Create a feature branch from `main`:
   git checkout -b feat/short-descriptive-name

Branching & PR workflow
- Use descriptive branch names: feat/..., fix/..., docs/..., chore/...
- Keep PRs small and focused. If a change affects many parts, split into multiple PRs.
- Rebase or merge main frequently to avoid large merge conflicts.
- Open a pull request against the `main` branch when your change is ready. Include:
  - Short summary of the change
  - Motivation / context
  - Any breaking changes
  - Steps to test locally

Code style and formatting
- The project uses TypeScript with strict-ish settings. Keep code clear and well-typed.
- Run the project's formatter before committing. If the project uses prettier/eslint, run:
  npm run format
  npm run lint
- Keep functions small and single-purpose. Controllers should be thin; business logic belongs in services.

Tests
- Add unit tests for new features or bug fixes.
- Aim for deterministic tests (avoid relying on network or mutable system state without isolation).
- Run tests locally before pushing changes:
  npm test

Linting and types
- Ensure TypeScript compiles without errors. Use:
  npm run build
  or
  npm run typecheck
- Fix linting issues reported by the project's linter before creating a PR.

Commit messages
- Use clear, present-tense messages (e.g., "Add user service test", "Fix auth middleware error handling").
- Keep the first line <= 72 characters when possible and include a short description.

Reviewing and merging
- A minimum of one approving review is preferred for non-trivial changes.
- Maintain backward compatibility where possible; document breaking changes clearly.
- Squash or rebase commits on merge if requested by the repo maintainers.

Reporting issues
- Open an issue if you find bugs or want to propose features.
- Provide steps to reproduce, expected vs actual behavior, environment and logs when possible.

Security
- For security-sensitive fixes, contact the maintainers privately (see repository owner contact).
- Do not include secrets or credentials in commits (.env files should be ignored).

Thanks again for contributing — your improvements help make this starter better for everyone.
