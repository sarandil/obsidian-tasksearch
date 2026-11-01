# Changelog

All notable changes to Task search are listed here, newest first.
Each release has one `## <version>` section with `Added`, `Changed`, `Fixed`, `Removed`
and `Migration` subsections as needed.

## 0.4.0

### Added
- "What's new" window after updates, with a highlighted Migration section when a release needs changes to your blocks. Turn it off in Settings → Task search.
- Show release notes command.

## 0.3.0

### Added
- First public version.
- `task-search` code block that lists the tasks of every note whose properties match a query, grouped by the note's frontmatter title.
- Options: `query`, `properties`, `source` (folders and tags) and `status`.
- Live filters in the rendered view: text, tag, and a multi-select status dropdown (To do, Done, Question, Important, Star, Other) with task counts.
- Search criteria summary under the toolbar.
- Tick tasks or set any status from the context menu; changes are written back to the note.
- Title property setting.
