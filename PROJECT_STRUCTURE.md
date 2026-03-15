# Project Structure Guide (General Template)

This guide explains how to organize and modify this report viewer template for any course or project, not only Data Structures.

## 1. Default Repository Layout

Use this as the starting shape:

```text
Repository/
  config.js
  index.html
  <Category>/
    <Series1>/
      <Task1>/
      <Task2>/
      ...
    <Series2>/
      <Task1>/
      <Task2>/
      ...
    <utils-folder>/
      shared-file-1.*
      shared-file-2.*
```

Default names used by the current config are:

- Category folder: `Lab`
- Series folders: `Lab1`, `Lab2`, ...
- Task folders: `Ex1`, `Ex2`, ...
- Shared utilities folder: `utils`

Important:

- `index.html` and `config.js` should stay at repository root.
- The viewer discovers folders and files by reading directory listings from a web server.

## 2. What You Can Change in config.js

Most behavior should be customized in `config.js`.

### 2.1 Display and naming hints

- `subtitle`: text appended to the lab title.
- `naming.labPrefix` and `naming.labSeparator`: naming hint text for series folders.
- `naming.exercisePrefix` and `naming.exerciseSeparator`: naming hint text for task folders.
- `naming.showSubtitleInLabTitle`: toggle subtitle in header.

### 2.2 Folder selection and utilities

- `category.preferredFolderNames`: preferred top-level folder names to auto-open.
- `paths.utilsFolderName`: shared utilities folder name under the selected category.

### 2.3 Labels and output parsing

- `labels.utilsSectionTitle`: header for the shared utilities section.
- `labels.outputLabel`: label for output panels.
- `output.fileCandidates`: output file names to search in each task folder.
- `output.sectionMarkers`: markers that split one output file into multiple output blocks.

### 2.4 File discovery and PDF export

- `fileDiscovery.skipCodeFileExtensions`: extensions to ignore as non-code.
- `fileDiscovery.preferredMainFileBases`: file base names treated as main file.
- `pdf.*`: PDF width, scale, and quality settings.

## 3. What Still Requires index.html Edits

Some text and UI strings are hardcoded in `index.html` and are not controlled by `config.js` yet, for example:

- Browser title and top bar wording.
- Landing page heading and subtitle text.
- Footer message.

If you want full rebranding (different semester, department, wording), update those strings in `index.html`.

## 4. Recommended Folder Pattern

The viewer works best with a consistent pattern:

- Category: one main content folder (example: `Lab`).
- Series: ordered folders (example: `Lab1`, `Lab2`, ...).
- Tasks: ordered subfolders per series (example: `Ex1`, `Ex2`, ...).

Example:

```text
Lab/
  Lab1/
    Ex1/
      Main.cpp
      output.txt
    Ex2/
      Main.py
      output.txt
  utils/
    helpers.h
    input.cpp
```

## 5. Files Inside Each Task Folder

A task folder can contain:

- Source files (`.cpp`, `.c`, `.java`, `.py`, `.js`, `.ts`, `.txt`, etc.)
- Optional output file, recommended: `output.txt`

Output file candidates are controlled by `output.fileCandidates`.

## 6. Output Section Markers

If one output file contains multiple runs, split with markers. Default markers include:

- `=== CUT ===`
- `===cut===`
- `=== REPORT OUTPUT ===`
- `=======================cut here`

Example:

```text
=== CUT ===
first run output

=== CUT ===
second run output
```

The viewer also strips common terminal footer noise like process-exit and "Press any key" lines.

## 7. Shared Utilities Section

The viewer loads shared code from:

- `<selected-category>/<utils-folder>/`

By default this is `Lab/utils/`.

These files are rendered after all tasks in the current series, both in HTML and exported PDF.

## 8. Running the Viewer

Do not open `index.html` with `file://`.

Run through a local server so `fetch()` can load folders/files.

Option A (VS Code):

1. Install Live Server.
2. Open `index.html` with Live Server.

Option B (Python):

```bash
python -m http.server 5500
```

Then open `http://localhost:5500/index.html`.

## 9. Template Mode for GitHub

If you are preparing a clean template repo, keep placeholder files so empty folders are tracked by Git.

Recommended placeholders per folder:

- `Main.txt`
- `output.txt`

Use short text inside each file (for example "template placeholder") so every folder is preserved when pushed.

## 10. Quick Checklist

- [ ] `index.html` and `config.js` are at root
- [ ] Category folder exists (default `Lab`)
- [ ] Series and task folders follow a consistent pattern
- [ ] Shared utilities folder exists (default `utils` inside category)
- [ ] Each task has code files and optional output file
- [ ] Placeholder files exist where empty folders must be preserved
- [ ] Viewer is run from a local web server, not `file://`
