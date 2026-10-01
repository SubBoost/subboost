# Contributing to SubBoost

Thanks for helping improve SubBoost.

## Issues and Pull Requests

- Open an issue for bug reports, reproducible failures, or documentation gaps.
- Open pull requests from a fork or your own branch.
- Keep each pull request focused on one feature, fix, or documentation change.
- Include what changed, how you tested it, and any user-visible impact.
- Do not bump package versions unless a maintainer explicitly asks for it.

## What Belongs Here

This repository contains the deployable app, shared packages, public documentation, tests, and public release automation.

Do not add secrets, personal configuration, deployment credentials, private keys, real subscription URLs, machine-specific files, or private operational notes.

## Contributor License Grant

By submitting a pull request, you confirm that you have the right to submit the contribution.

Your contribution is licensed to the public under the repository license, AGPL-3.0-only. In addition, you grant SubBoost maintainers a perpetual, worldwide, non-exclusive, royalty-free, irrevocable, sublicensable license to use, reproduce, modify, distribute, publicly perform, publicly display, and create derivative works from your contribution for proprietary distributions, hosted services, and other SubBoost services.

## Local Checks

Run the smallest relevant checks first:

```powershell
npm run lint
npm run test:unit
npm run check:local-app
```

For parser, template, subscription output, or deployment changes, also run the focused test or selftest that covers the changed behavior.

## UI Colors

The app has a dark and a light theme with the same layout. Take colors from the theme tokens in `packages/ui/src/styles/theme.css` (for example `text-fg-60`, `bg-ink/5`, `border-ink/10`, `bg-surface`) instead of dark-only classes such as `text-white/60` or `bg-white/5`; `npm run lint` rejects the latter. Check UI changes in both themes.

## Documentation

- Keep README changes bilingual: update `README-CN.md` first, then sync `README.md`.
- Keep deployment instructions in the documentation site unless the README only needs a short pointer.
- Avoid publishing maintainer-only workflow, private infrastructure details, or machine-specific paths.
