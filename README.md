# Task search

Collect tasks from across your vault into any note. Task search finds the notes whose **properties** match a query and lists their tasks **grouped by each note's frontmatter `title`** instead of its file name. Live filters work as you type, and you can update task statuses in place.

## Installation

**From the community directory:** open *Settings → Community plugins → Browse*, search for **Task search**, then select *Install* and *Enable*.

**Manually:** download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest). Put them into `<your vault>/.obsidian/plugins/task-search/`, then enable the plugin under *Settings → Community plugins*.

## Usage

Add a `task-search` code block to any note. The block is configured in YAML, like a Bases block:

````markdown
```task-search
query: client-x
properties:
  - project
  - client
source:
  folders:
    - Work
status:
  - todo
  - question
```
````

This lists the open and question tasks from every note in the `Work` folder whose `project` or `client` property contains `client-x`.

You don't have to write the block by hand: the **Search** button in the rendered view opens a settings panel, and every change you make there is saved to the block (see [Changing the search in the view](#changing-the-search-in-the-view)).

### Options

| Option | Description |
|---|---|
| `query` | Text to look for in the note's properties. Matching is case-insensitive and partial. For list properties, any item can match. Leave it out to list the tasks of every note that has any. Quote values that start with `#`: `query: "#client"`. |
| `properties` | List of property names to search in. Leave it out, or use `"*"`, to search in every property. Only used together with `query`. |
| `source` | Limits the search to `folders` and/or `tags`, each a list. Folders are OR-ed, tags are OR-ed, and the two groups are AND-ed. Write tags without `#`; a tag also matches its nested tags (`client` matches `client/abc`). |
| `status` | Statuses selected when the note opens: a list of `todo`, `done`, `question`, `important`, `star` and `other`, or `all`. Defaults to `todo`. |
| `include-self` | `true` always shows the tasks of the note that contains the block, even when it doesn't match the search. Defaults to `false`. |

A list option with a single value can be written on one line (`properties: project`), and YAML flow lists work too (`status: [todo, question]`). Option names are case-insensitive. Indent with spaces, not tabs. All options are optional: an empty block lists the open tasks of every note in the vault.

````markdown
```task-search
```
````

A block that can't be read shows an error instead of the results, so a mistake never changes the search silently. Blocks written for Task search 0.3 and earlier (`properties: project, client`, `source: Work/, #client`) show how to convert them; the steps are in the 0.4.0 section of the [changelog](CHANGELOG.md).

### Changing the search in the view

- **Search button:** opens the settings panel under the toolbar. Set the **Query**, add or remove **Properties**, **Folders** and **Tags** (the add fields suggest the names used in your vault, and accept free text with Enter), and tick **Include this note**.
- **Search criteria:** the line under the toolbar summarises the block's settings: the query (or *none* when every note with tasks is listed), the properties searched (or *any property*), the folders and tags (or *entire vault*), and whether this note is included. Click an item to open the panel at that setting.
- Every change in the panel is saved to the code block at once; the query is saved when you press Enter or leave the field. The status selection is saved when you close the status dropdown.
- When the note is open in the editor, Undo reverts a saved change.
- Comments in the block are not kept when the view saves a change.

### Working with the results

- **Groups:** each matching note is a collapsible group headed by its frontmatter title and its task count. Click the heading to open the note. Ctrl/Cmd-click opens it in a new tab.
- **Filter box:** filters by note title or task text as you type.
- **Tag dropdown:** shows only notes that have the selected tag.
- **Status dropdown:** a multi-select list of *To do* `[ ]`, *Done* `[x]`, *Question* `[?]`, *Important* `[!]`, *Star* `[*]` and *Other* (`[/]`, `[-]`, or any other symbol), each with its current count. Tick any combination; tick all of them to see every task. The button shows the current selection.
- **Checkbox:** toggles a task between to do and done. The change is written back to the source note.
- **Right-click on a task:** sets any status (`[ ]`, `[/]`, `[?]`, `[!]`, `[*]`, `[x]`, `[-]`) or opens the note.
- **Task text:** links, tags and formatting are rendered. Click the text to jump to the task's line in its note.

The filter box and the tag dropdown are temporary; they are not saved to the block. The list refreshes automatically when your notes change, and the filters you've chosen are kept. Nested tasks keep their indentation. The note that contains the block is only part of its own results with `include-self: true`.

## Settings

- **Title property:** the frontmatter property used as the group heading (default `title`). Notes without it are shown by file name.
- **Show release notes after updates:** opens a window with the changes after Task search is updated (default on). The **Show release notes** command opens it at any time.

## Privacy

Everything runs locally on Obsidian's metadata cache and vault API. The plugin makes no network requests.

## Contributing

Bug reports, ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
