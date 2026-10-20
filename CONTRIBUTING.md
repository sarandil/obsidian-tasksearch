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
| `npm test` | Runs the unit tests for the parsing and filter logic. |

To try your build in Obsidian, copy `main.js`, `manifest.json` and `styles.css` into `<test vault>/.obsidian/plugins/task-search/`, then reload the plugin. Use a separate test vault rather than your everyday one.

## Project structure

| Path | Contents |
|---|---|
| `src/main.ts` | Plugin entry point; registers the `task-search` code block and the settings tab. |
| `src/view.ts` | Renders a code block: toolbar, search criteria, grouped task list and task actions. |
| `src/status-picker.ts` | The multi-select status dropdown. |
| `src/settings.ts` | Plugin settings. |
| `src/logic.ts` | Pure helpers (config parsing, matching, task line handling) with no Obsidian dependency. |
| `test/` | Unit tests for `src/logic.ts`. |
| `styles.css` | Styles; all classes use the `tsearch-` prefix. |

## Pull requests

- Base your branch on `dev` and open the pull request against `dev`.
- Keep each pull request focused on one change.
- Make sure `npm run lint`, `npm test` and `npm run build` all pass.
- Add or update tests in `test/` when you change anything in `src/logic.ts`.
- Update `README.md` when you change user-facing behaviour or options.
- All user-facing text is in English and uses sentence case.

## Releasing (maintainers)

1. Bump the version with `npm version <x.y.z>`. This updates `manifest.json` and `versions.json` and creates a tag without a `v` prefix.
2. Push the commit and the tag: `git push --follow-tags`.
3. The GitHub Actions workflow lints, tests and builds the plugin, then publishes a release with `main.js`, `manifest.json` and `styles.css`.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
