# Task search

Collect tasks from across your vault into any note. Task search finds the notes whose **properties** match a query and lists their tasks **grouped by each note's frontmatter `title`** instead of its file name. Live filters work as you type, and you can update task statuses in place.

## Installation

**From the community directory:** open *Settings → Community plugins → Browse*, search for **Task search**, then select *Install* and *Enable*.

**Manually:** download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest). Put them into `<your vault>/.obsidian/plugins/task-search/`, then enable the plugin under *Settings → Community plugins*.

## Usage

Add a `task-search` code block to any note:

````markdown
```task-search
query: client-x
properties: project, client
source: Work/
status: todo, question
```
````

This lists the open and question tasks from every note in the `Work` folder whose `project` or `client` property contains `client-x`.

### Options

| Option | Description |
|---|---|
| `query` | Text to look for in the note's properties. Matching is case-insensitive and partial. For list properties, any item can match. Leave it out to list the tasks of every note that has any. |
| `properties` | Comma-separated property names to search in. Omit it, or use `*`, to search in every property. Only used together with `query`. |
| `source` | Limits the search to folders and/or tags, e.g. `Work/, Projects, #client`. Folders are OR-ed, tags are OR-ed, and the two groups are AND-ed. |
| `status` | Statuses selected when the note opens: a comma-separated list of `todo`, `done`, `question`, `important`, `star` and `other`, or `all`. Defaults to `todo`. |

Option names are case-insensitive. Lines starting with `#` are comments. All options are optional: an empty block lists the open tasks of every note in the vault.

````markdown
```task-search
```
````

### Working with the results

- **Search criteria:** a line under the toolbar summarises the block's settings: the query (or *none* when every note with tasks is listed), the properties searched (or *any property*) and the source (or *entire vault*).
- **Groups:** each matching note is a collapsible group headed by its frontmatter title and its task count. Click the heading to open the note. Ctrl/Cmd-click opens it in a new tab.
- **Filter box:** filters by note title or task text as you type.
- **Tag dropdown:** shows only notes that have the selected tag.
- **Status dropdown:** a multi-select list of *To do* `[ ]`, *Done* `[x]`, *Question* `[?]`, *Important* `[!]`, *Star* `[*]` and *Other* (`[/]`, `[-]`, or any other symbol), each with its current count. Tick any combination; tick all of them to see every task. The button shows the current selection.
- **Checkbox:** toggles a task between to do and done. The change is written back to the source note.
- **Right-click on a task:** sets any status (`[ ]`, `[/]`, `[?]`, `[!]`, `[*]`, `[x]`, `[-]`) or opens the note.
- **Task text:** links, tags and formatting are rendered. Click the text to jump to the task's line in its note.

The list refreshes automatically when your notes change, and the filters you've chosen are kept. Nested tasks keep their indentation. The note that contains the block is never part of its own results.

## Settings

- **Title property:** the frontmatter property used as the group heading (default `title`). Notes without it are shown by file name.

## Privacy

Everything runs locally on Obsidian's metadata cache and vault API. The plugin makes no network requests.

## Contributing

Bug reports, ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
