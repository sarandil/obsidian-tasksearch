# Changelog

All notable changes to Task search are listed here, newest first.
Each release has one `## <version>` section with `Added`, `Changed`, `Fixed`, `Removed`
and `Migration` subsections as needed.

## 0.4.0

### Changed
- The block configuration uses YAML, like Bases. Blocks in the old format show an error until they are converted (see Migration).
- The status selection is saved to the block when you close the status dropdown.

### Added
- Search settings panel in the rendered view (Search button, or click a search criterion). Changes are saved to the block.
- Property, folder and tag pickers in the settings panel.
- Include this note (`include-self`): always show the tasks of the note that contains the block, even when it doesn't match the search.
- "What's new" window after updates, with a highlighted Migration section when a release needs changes to your blocks. Turn it off in Settings → Task search.
- Show release notes command.

### Migration
The block configuration must be YAML from this version on. Blocks in the old format show an error with a Show release notes button until they are converted. Blocks that are already valid YAML, such as `query: client-x`, keep working. Convert a block like this:

Before:

```yaml
query: client-x
properties: project, client
source: Work/, #client
status: todo, question
```

After:

```yaml
query: client-x
properties:
  - project
  - client
source:
  folders:
    - Work
  tags:
    - client
status:
  - todo
  - question
```

- List options (`properties`, `status`, `source`) become YAML lists.
- `source` is split into `folders` and `tags`. Write tags without `#`.
- `properties: *` must be quoted in YAML: `properties: "*"`, or remove the line to search every property.
- A value that starts with `#` must be quoted: `query: "#client"`.
- Indent with spaces, not tabs.
- Comments in the block are not kept when the view writes the block back.

## 0.3.0

### Added
- First public version.
- `task-search` code block that lists the tasks of every note whose properties match a query, grouped by the note's frontmatter title.
- Options: `query`, `properties`, `source` (folders and tags) and `status`.
- Live filters in the rendered view: text, tag, and a multi-select status dropdown (To do, Done, Question, Important, Star, Other) with task counts.
- Search criteria summary under the toolbar.
- Tick tasks or set any status from the context menu; changes are written back to the note.
- Title property setting.
