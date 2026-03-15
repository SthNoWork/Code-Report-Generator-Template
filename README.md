# Code Report Generator Template

Simple web viewer for lab reports with automatic folder detection.

https://sthnowork.github.io/Code-Report-Generator-Template/

## Splitting Sections in output.txt

Use this exact marker in `output.txt`:

```text
=== CUT ===
```

## Exercise Description for Main.\* Only

Put this block comment at the top of `Main.*`:

```text
/*
any text here will be inside the description list
*/
```

## What It Does

- Scans your project folders
- Detects labs and exercises automatically using numbers in folder names
- Renders source code and `output.txt`
- Renders `.csv` output files as HTML tables
- Loads shared utils from `utils/`
- Exports lab view to PDF

## Structure

```text
project-root/
  Lab/
    Lab1/
      Ex1/
        Main.*
        output.txt
      Ex2/
    Lab2/
    utils/
      any_shared_code.*
```

Root is taken from the folder you choose with Open Project Folder inside the app.

## Detection Rules

- Ignores `.git`
- No auto-open of the first folder
- Lab folders: names containing a number
- Exercise folders: names containing a number
- Main file: `Main.*`
- Other code files: any `*.*` except `.txt` and known binary/media files
- Output file: `output.txt`
- Output files also support patterns from `config.js`, including `.csv`

## Working Name Examples

The number can appear anywhere in lab/exercise folder names.

Valid lab folder examples:

- `Lab1`
- `lab-2`
- `DS_Lab_03`
- `week4-lab`
- `module_5`
- `assignment6`

Valid exercise folder examples:

- `Ex1`
- `ex-2`
- `task3`
- `exercise_04`
- `problem5`
- `q6`

Valid main file examples:

- `Main.java`
- `Main.cpp`
- `Main.c`
- `Main.py`
- `Main.js`
- `Main.ts`

Other code files that are also supported in the same exercise folder:

- `helper.cpp`
- `utils.java`
- `node_impl.py`
- `graph.ts`

Files skipped as source code:

- `output.txt` (handled as output panel)
- any `.txt` source notes
- binary/media files like `.exe`, `.dll`, `.png`, `.jpg`, `.mp4`

## Splitting output.txt with === CUT ===

Use this marker line in `output.txt` to split output into multiple sections:

```text
=== CUT ===
```

Each section becomes its own output block in the viewer and in exported PDF.

Example `output.txt`:

```text
Compile started...
=== CUT ===
Input: 5
Output: 120
=== CUT ===
Input: 7
Output: 5040
```

This will show 3 output blocks:

1. `Compile started...`
2. `Input: 5 / Output: 120`
3. `Input: 7 / Output: 5040`

Another clean example:

```text
=== CUT ===
Test Case 1: PASS

=== CUT ===
Test Case 2: PASS

=== CUT ===
Test Case 3: FAIL
```

Tip:

- Keep marker text exactly as `=== CUT ===` (same spaces and casing).

## Run

Use a local server (not `file://`).

```bash
python -m http.server 5500
```

Open `http://localhost:5500/index.html`.

## Docs

- Full guide: `PROJECT_STRUCTURE.md`
- Settings: `config.js`
- Example export: `example.pdf`
