# Contributing to Task search

Thanks for your interest in improving Task search! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and requesting features

Please open an [issue](../../issues) and include:

- your Obsidian version and operating system,
- the `task-search` code block you used,
- what you expected to happen and what happened instead.

A small sample note that reproduces the problem helps a lot.

## Development setup

You need [Node.js](https://nodejs.org/) 20 or later.

```bash
git clone https://github.com/sarandil/obsidian-tasksearch.git
cd obsidian-tasksearch
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Rebuilds `main.js` on every change. |
| `npm run build` | Type-checks and produces a production build. |
| `npm run lint` | Checks the code against the official Obsidian plugin guidelines (ESLint). |
| `npm test` | Runs the unit tests for the parsing, filter and changelog logic. |
| `npm run changelog -- check` | Validates `CHANGELOG.md` (also part of `npm run build`). |
| `npm run changelog -- print <x.y.z>` | Prints one version's release notes. |

To try your build in Obsidian, copy `main.js`, `manifest.json` and `styles.css` into `<test vault>/.obsidian/plugins/task-search/`, then reload the plugin. Use a separate test vault rather than your everyday one.

## Project structure

| Path | Contents |
|---|---|
| `src/main.ts` | Plugin entry point; registers the `task-search` code block and the settings tab. |
| `src/view.ts` | Renders a code block: toolbar, search criteria, grouped task list and task actions. |
| `src/status-picker.ts` | The multi-select status dropdown. |
| `src/settings.ts` | Plugin settings. |
| `src/changelog.ts` | Changelog parsing, validation and version selection, with no Obsidian dependency. |
| `src/release-notes.ts` | The "What's new" window and the update check. |
| `scripts/changelog.ts` | Build-time changelog check and release-notes output. |
| `CHANGELOG.md` | Release notes, bundled into the plugin and used for GitHub releases. |
| `src/logic.ts` | Pure helpers (config parsing, matching, task line handling) with no Obsidian dependency. |
| `test/` | Unit tests for `src/logic.ts` and `src/changelog.ts`. |
| `styles.css` | Styles; all classes use the `tsearch-` prefix. |

## Pull requests

- Base your branch on `dev` and open the pull request against `dev`.
- Keep each pull request focused on one change.
- Make sure `npm run lint`, `npm test` and `npm run build` all pass.
- Add or update tests in `test/` when you change anything in `src/logic.ts` or `src/changelog.ts`.
- Add your user-facing changes to `CHANGELOG.md`, under the section of the next version. If users have to change their blocks, add a `### Migration` subsection with a before/after example. Write each list item and paragraph on a single line: the "What's new" window shows line breaks as they are in the file.
- Update `README.md` when you change user-facing behaviour or options.
- All user-facing text is in English and uses sentence case.

## Releasing (maintainers)

`main` is protected, so every release goes through a pull request.

1. On `dev`, make sure `CHANGELOG.md` has a complete section for the new version.
2. Bump the version without tagging: `npm version <x.y.z> --no-git-tag-version`.
   This updates `package.json`, `manifest.json` and `versions.json`. Commit and push `dev`.
3. Open a pull request from `dev` to `main` and merge it (merge commit).
4. Tag the release on `main`:
   `git switch main`, `git pull`, `git tag <x.y.z>`, `git push origin <x.y.z>` (no `v` prefix).
5. The GitHub Actions workflow lints, tests and builds the plugin, then publishes a release with
   `main.js`, `manifest.json` and `styles.css`. The release notes are the version's section of
   `CHANGELOG.md`.
6. Merge `main` back into `dev`: `git switch dev`, `git merge main`, `git push origin dev`.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
