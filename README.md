# Code Report Generator - Step-by-Step Tutorial

Simple web viewer for lab reports with automatic folder detection.

Live demo:
https://sthnowork.github.io/Code-Report-Generator-Template/

## How to use

click open project folder and select the folder that contains all exercise for a single lab/assignment

if it doesnt work

## 1. What this tool does

This viewer reads your lab/project folder and automatically builds a report page with:

- Exercise cards
- Code blocks
- Output blocks
- Image blocks (description screenshots, output screenshots, diagrams)
- PDF export

## 2. Browser requirement

Use Chrome or Edge.
Firefox is not supported because this app uses the File System Access API.

## 3. Prepare your folder (important)

You can use either layout:

### A) Lab-style layout (recommended)

```text
YourRoot/
  Lab3/
    Ex1/
      Main.java
      output.txt
    Ex2/
      Main.java
      output.txt
    Ex3/
      Main.java
      output.txt
      desc.png
```

### B) Flat/test layout (works too)

When files are flat in one folder, use **consistent number suffixes** to group related files:

```text
TEST/
  Main1.java
  output1.txt
  desc1.png
  Main2.java
  output2.txt
  desc2.png
  Main3.java
  output3.txt
```

**All files for Exercise 1 must have `1` in the name, all files for Exercise 2 must have `2`, etc.**

### C) Random/unstructured layout (chaotic)

If your folder structure is completely random with no naming pattern, it can be:

**Flat and unorganized (with exercise numbers):**

```text
MyProject/
  AssignmentCode1.java      ← Exercise 1
  FinalOutput1.txt          ← Exercise 1
  description1.png          ← Exercise 1
  AssignmentCode2.java      ← Exercise 2
  FinalOutput2.txt          ← Exercise 2
  screenshot2.png           ← Exercise 2
  AssignmentCode3a.java     ← Exercise 3 Part A
  test_output3a.csv         ← Exercise 3 Part A
  diagram3a.png             ← Exercise 3 Part A
```

**OR nested/scattered randomly (with exercise numbers):**

```text
MyProject/
  src/
    Main1.java              ← Exercise 1
  output/
    result1.txt             ← Exercise 1
  screenshots/
    desc1.png               ← Exercise 1
  docs/
    Main2.java              ← Exercise 2
  helpers/
    Utils2.java             ← Exercise 2
  images/
    diagram2.png            ← Exercise 2
    output2a.csv            ← Exercise 2 Part A
    code3a.java             ← Exercise 3 Part A
    result3a.txt            ← Exercise 3 Part A
```

**Result:** The tool recursively scans every folder, but without **numbered naming**, everything gets loaded as a **single unorganized card** with no sections. Files are not grouped by exercise.

**To use Layout C and get organization, you MUST add numbering where the number represents the exercise number:**

**The number IS the exercise identifier** — so all files with `1` = Exercise 1, all files with `2` = Exercise 2, etc.

**Follow the numbering rules below:** ⬇️

- **The number in each filename identifies which exercise it belongs to**: `Main1.java` is in Exercise 1, `Main2.java` is in Exercise 2
- **Use single-digit or letter suffixes**: `1`, `2`, `3` or `1a`, `1b`, `1c`
- **DO NOT use formats like `4.1`, `4.2`** — the sorter treats `4.1` as containing both "4" and "1", causing it to group incorrectly
- **For multiple parts of the same exercise**, use letters after the number: `4a.java`, `4b.java`, `4a_output.txt`, `4b_output.txt`
- **CRITICAL: Match all related files** — if you have `code4a.java` (Exercise 4 Part A), also name output `output4a.txt` and description `desc4a.png`. All must have the same number suffix `4a`

Example:

```text
MyProject/
  src/
    Main1.java        ← this number "1" means Exercise 1
  output/
    output1.txt       ← same number "1" = same exercise
  screenshots/
    desc1.png         ← same number "1" = same exercise
  helpers/
    Utils1.java       ← same number "1" = same exercise
  images/
    diagram1.png      ← same number "1" = same exercise
    Main2.java        ← this number "2" means Exercise 2
    output2.txt       ← same number "2" = same exercise
    desc2.png         ← same number "2" = same exercise
```

**Layout C requires explicit number grouping** — the number in the filename IS the exercise marker. Without matching numbers, files won't group correctly.

---

### ℹ️ How auto-detection works

The tool automatically creates **sections/exercises** when it finds **folders with numbers in their names**:

- **Finds folders named:** `Ex1`, `Ex2`, `Exercise1`, `1`, `Lab3`, `Part1`, etc. → Creates separate exercise cards
- **No numbered folders?** → Creates one flat card with all files together
- **Flat files with numbers?** (Layout B) → Groups files by their number suffix into separate cards

**Recommendation:** Use Layout A (numbered folders) for best results. Numbered folder names trigger automatic sectioning.

### ⚠️ Important naming rules for Layout B (Flat structure):

- **Use single-digit or letter suffixes**: `1`, `2`, `3` or `1a`, `1b`, `1c`
- **DO NOT use formats like `4.1`, `4.2`** — the sorter treats `4.1` as containing both "4" and "1", causing it to group incorrectly with Exercise 1
- **For exercises with multiple parts**, use letters after the number: `4a.java`, `4b.java`, `4a_output.txt`, `4b_output.txt`
- **Match all related files** — if you have `Main4a.java`, also name the output `output4a.txt` and description `desc4a.png`

### File naming pattern reference:

For Layout A (folders):

```
Folder name has the exercise identifier (Ex1, Ex2, etc.)
Files inside don't need numbers: Main.java, output.txt, desc.png
```

For Layout B (flat):

```
File name must include exercise number/letter
Main1.java, output1.txt, desc1.png      (for Exercise 1)
Main4a.java, output4a.txt, desc4a.png   (for Exercise 4 Part A)
Main4b.java, output4b.txt, desc4b.png   (for Exercise 4 Part B)
```

### Example folder structures:

Layout A (recommended):

![Recommended layout 1](tutorial%20image/recommend0.png)
![Recommended layout 2](tutorial%20image/recommend1.png)
![Recommended layout 3](tutorial%20image/recommend2.png)

## 4. Exercises with multiple parts

If an exercise has multiple parts (e.g., Exercise 3.1, 3.2, 3.3), you have two options:

### Option A: Create a subfolder for each part (recommended with Layout A)

```text
Lab3/
  Ex3/
    Part1/
      Main.java
      output.txt
    Part2/
      Main.java
      output.txt
    Part3/
      Main.java
      output.txt
```

### Option B: Use letter suffixes in flat layout (Layout B)

```text
TEST/
  Main3a.java
  output3a.txt
  desc3a.png
  Main3b.java
  output3b.txt
  desc3b.png
  Main3c.java
  output3c.txt
  desc3c.png
```

**Do not use:** `Main3.1.java` — this gets misinterpreted as containing both "3" and "1", causing sorting chaos.
**Use instead:** `Main3a.java`, `Main3b.java`, `Main3c.java`

All files for the same part must share the same suffix (all `3a` files go together, all `3b` files go together).

## 5. Naming rules you should follow

- Put each exercise in its own folder when possible (`Ex1`, `Ex2`, ...).
- Use a main source file name like `Main.java` so it is auto-marked as main.
- Any image file (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`) is shown as an image block.
- Output file candidates are matched from config (default includes `output.txt`, `*.txt`, `*.json`, `*.csv`).

## 6. Add exercise description correctly

If your main code file starts with a block comment, that comment is extracted and shown as the "Exercise Description" panel.

Example format in `Main.java`:

```java
/*
Lab03.1. Quadratic equation
Write a program using Function to find roots of quadratic equation ax^2 + bx + c = 0
*/

public class Main {
  public static void main(String[] args) {
    // ...
  }
}
```

Raw file and rendered result example:

![Code with top block comment](tutorial%20image/example1.png)
![Rendered exercise description](tutorial%20image/example1-output.png)

## 7. Split long output into multiple output cards

Inside `output.txt`, add separator lines:

```text
=== CUT ===
```

Each section becomes a separate output block in the report.

Example input and rendered result:

![Output file using CUT markers](tutorial%20image/example2.png)
![Rendered split output blocks](tutorial%20image/example2-output.png)

## 8. Use screenshots for description/output visuals

You can place `desc.png` (problem screenshot) and `output.png` (console/result screenshot) in an exercise folder.
They are automatically displayed as image blocks.

Example result:

![Exercise with image-based description/output](tutorial%20image/example3.png)
![Rendered with image block](tutorial%20image/example3-output.png)

## 9. Open and generate the report

1. Open `index.html` in Chrome/Edge (or open the hosted page).
2. Click "Open Project Folder".
3. Select your project root folder.
4. Expand categories/labs/exercises.
5. Reorder blocks if needed.
6. Click PDF export when ready.

## 10. Common mistake to avoid

Do not rely on random filename patterns if you want clean ordering and clear grouping.
This can still render, but the result may be less organized:

![Less organized naming example](tutorial%20image/dont.png)

Prefer consistent names like:

- Exercise folders: `Ex1`, `Ex2`, `Ex3`
- Main file: `Main.java`
- Output file: `output.txt`
- Optional images: `desc.png`, `output.png`

## 11. Optional customization

You can edit `config.js` to change:

- UI text labels
- Preferred folder names
- Output separators
- Output file matching rules
- PDF settings

---

If you want, I can also add a second README section with a "template folder you can copy" for new lab reports.
