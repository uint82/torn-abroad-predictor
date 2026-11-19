# Contributing

## Setup

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Run the checks before opening a pull request:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run server:build
```

## Branches and commits

Create a branch from `main` with a short name, for example `feat/stock-forecast` or `fix/empty-catalog`.

Use conventional commit subjects with no body:

```text
feat(ui): add item detail dialog
fix(api): handle malformed stock response
ref(domain): split profit helpers
test(state): cover quote failures
docs: explain refresh policy
```

Keep each commit focused. Do not mix unrelated refactors, formatting, and behavior changes.

## Code style

- Follow the existing TypeScript and SCSS style.
- Keep functions small and give each function one job.
- Prefer pure functions in `src/domain` and keep side effects at the edges.
- Reuse existing helpers before adding new ones.
- Add tests for behavior changes and edge cases.
- Do not add a dependency without discussing it first.
- Do not use `innerHTML` for API data. Build nodes with the helpers in `src/ui/dom.ts`.
- No emoji and no em dashes in code, comments, or documentation.

Comments are reserved for non-obvious reasoning. Avoid restating what the code already says.

## Pull requests

Describe the problem, the approach, and the checks you ran. Keep pull requests small enough to review in one sitting. UI changes should include a screenshot or a short description of the visible result.

By contributing, you agree that your contribution is licensed under the MIT License.
