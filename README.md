# Code Report Generator Template

Simple web viewer for building lab/code reports from a folder.

https://sthnowork.github.io/Code-Report-Generator-Template/

## How It Scans Files

- Opened folder is scanned at root + first-level subfolders.
- If root has files, root becomes one report card.
- Each first-level subfolder becomes its own report card.
- Images are rendered as image blocks.
- Output files support section splitting using `=== CUT ===`.

## Quick Steps

1. Open the app.
2. Select mode (Code Mode or Text Mode).
3. Click Open Folder.
4. Review generated cards, reorder/edit as needed.
5. Export PDF.

## Notes

- The home screen loads this README automatically when available.
- In Text Mode, `.txt` can be shown as description.

## Splitting Sections in output.txt

Use this exact marker in `output.txt`:

```text
=== CUT ===
```