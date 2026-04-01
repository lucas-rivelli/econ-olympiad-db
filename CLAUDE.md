# Econ Olympiad Database — AI Instructions

This file tells Claude Code, Cursor, and other AI assistants how to work with this project.

## What this project is

A structured database of economics olympiad questions (OBECON, IEO, CEO, REO, NET, NOIC).
- Questions are stored as `.tex` files using a custom `\question{}` LaTeX macro
- A Python script builds `docs/questions.json` from those files
- A static web app at `docs/` serves as the browsable interface (GitHub Pages)
- `database.csv` is the master index

---

## Directory structure

```
Database/
├── questions/
│   ├── micro/          q0001.tex, q0003.tex, ...
│   ├── macro/          q0002.tex, q0004.tex, ...
│   ├── finance/        q0010.tex, ...
│   └── game_theory/    q0006.tex, ...
├── images/             source images (all sizes)
├── docs/
│   ├── images/         images served by the web app (copies from images/)
│   ├── questions.json  auto-generated — DO NOT edit manually
│   ├── index.html
│   ├── style.css
│   └── app.js
├── scripts/
│   └── build_json.py   parses all .tex → docs/questions.json
├── pdfs/
│   ├── inbox/          drop new PDFs here before processing
│   └── processed/      move PDFs here after processing
├── database.csv        master index (one row per question)
└── CLAUDE.md           this file
```

---

## The 4 valid topics

| Topic | Folder |
|-------|--------|
| Micro | questions/micro/ |
| Macro | questions/macro/ |
| Finance | questions/finance/ |
| Game Theory | questions/game_theory/ |

Subtopics are free-text (e.g. `Demand Theory`, `CAPM / Asset Pricing`).

---

## Question ID convention

- 4-digit zero-padded integers: `0001`, `0002`, ..., `0068`, ...
- File name matches ID: `q0042.tex`
- To find the next available ID: check the last row of `database.csv`

---

## The `\question{}` LaTeX format

Every `.tex` file contains exactly one `\question{...}` call. All fields use `key = {value}` syntax.

```latex
% q0042.tex — Keynesia
\question{
  id        = {0042},
  title     = {Keynesia},
  source    = {OBECON},
  year      = {2026},
  round     = {Seletiva IEO -- Phase C},
  language  = {English},
  topic     = {Macro},
  subtopic  = {Keynesian Multiplier / Fiscal Policy},
  type      = {objective},
  statement = {%
    Keynesia has sticky prices and wages. Consumption: $C = 10 + 0.8Y$.
    A stimulus increases investment by 10 billion. Find the Keynesian
    multiplier $m$ and the change in output $\Delta Y$.
  },
  choices   = {%
    \item $m = 0.2$ and $\Delta Y = 2$.
    \item $m = 0.8$ and $\Delta Y = 8$.
    \item $m = 2$ and $\Delta Y = 20$.
    \item $m = 5$ and $\Delta Y = 50$.
  },
  answer    = {D},
  solution  = {%
    Multiplier $m = 1/(1-MPC) = 1/(1-0.8) = 5$.
    With $\Delta I = 10$: $\Delta Y = 5 \times 10 = 50$ billion.
    Answer: \textbf{(D)}.
  },
}
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | 4-digit, matches filename |
| `title` | string | Short descriptive title |
| `source` | string | `OBECON`, `IEO`, `CEO`, `REO`, `NET`, `NOIC` |
| `year` | string | e.g. `2026` |
| `round` | string | e.g. `Seletiva IEO -- Phase A`, `Final` |
| `language` | string | `English` or `Portuguese` |
| `topic` | string | One of the 4 valid topics above |
| `subtopic` | string | Free-text, slash-separated if multiple |
| `type` | string | `objective`, `dissertative`, or `numeric` |
| `statement` | block | Full question text in LaTeX |
| `choices` | block | `\item` per choice (A, B, C, …); empty `{}` for non-objective |
| `answer` | string | Letter (`A`–`E`) for objective, number for numeric, empty for dissertative |
| `solution` | block | Step-by-step solution in LaTeX |

### Type rules
- **objective**: has choices (A–E), answer is a letter
- **numeric**: no choices, answer is a number
- **dissertative**: no choices, answer is empty

### Images
Reference images as:
```latex
\includegraphics[width=0.8\textwidth]{../images/q0042_fig1.png}
```
Image naming: `q{ID}_fig{N}.{ext}` (e.g. `q0042_fig1.png`)

**Important**: always copy the image to BOTH `images/` AND `docs/images/`:
```bash
cp images/q0042_fig1.png docs/images/q0042_fig1.png
```

---

## Workflow: adding a new PDF

### Step 1 — Drop PDF in inbox
```
pdfs/inbox/MyExam2025.pdf
```

### Step 2 — Extract images from the PDF
```python
import fitz, os
doc = fitz.open("pdfs/inbox/MyExam2025.pdf")
for page_num in range(len(doc)):
    page = doc[page_num]
    for img_idx, img in enumerate(page.get_images(full=True)):
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        if pix.width < 200 or pix.height < 200:
            continue          # skip logos/icons
        if pix.n == 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        name = f"q{QUESTION_ID}_fig{img_idx+1}.png"
        pix.save(f"images/{name}")
        pix.save(f"docs/images/{name}")
```

### Step 3 — Create `.tex` files
- Find next available ID from `database.csv`
- Create `questions/{topic}/q{ID}.tex` using the format above
- One file per question

### Step 4 — Update `database.csv`
Append one row per question:
```
0069,Question Title,OBECON,2026,Phase X,English,Macro,Subtopic,objective,questions/macro/q0069.tex,B,false
```
CSV columns: `id,title,source,year,round,language,topic,subtopic,type,file_path,answer,has_image`

Set `has_image` to `true` if the question contains `\includegraphics`.

### Step 5 — Rebuild the JSON
```bash
python3 scripts/build_json.py
```
This regenerates `docs/questions.json` from all `.tex` files.

### Step 6 — Move PDF to processed
```bash
mv "pdfs/inbox/MyExam2025.pdf" "pdfs/processed/"
```

### Step 7 — Commit and push
```bash
git add questions/ images/ docs/images/ docs/questions.json database.csv
git commit -m "Add questions from MyExam2025"
git push
```

---

## Workflow: correcting an answer

1. Edit the `.tex` file: change `answer = {X}` to the correct value
2. Edit `database.csv`: update the answer column for that row
3. Run `python3 scripts/build_json.py`
4. Commit and push

---

## Common LaTeX patterns used in statements

```latex
% Math inline
$P = MC$, $\pi \geq 0$, $\Delta Y = 50$

% Math display
\[ Q^* = \frac{a - c}{2b} \]

% Dollar signs (NOT math)
R\$~1{,}000   % Brazilian Real — the \$ and ~ avoid MathJax issues

% Escaped dollar (text context)
\$50 million   % renders as $50 million

% Enumerated sub-parts
\begin{enumerate}[(a)]
  \item First part.
  \item Second part.
\end{enumerate}

% Bullet list
\begin{itemize}
  \item First point.
  \item Second point.
\end{itemize}

% Bold / italic
\textbf{bold text}   \textit{italic text}

% Em dash
---   % or use \textemdash

% Non-breaking space (use before units, numbers)
10~million,   R\$~500
```

---

## Web app notes

- The web app lives at `docs/` and is served via GitHub Pages
- It reads `docs/questions.json` (never the `.tex` files directly)
- Math is rendered by MathJax v3 — standard LaTeX math syntax works
- `docs/app.js` converts a subset of LaTeX to HTML (bold, italic, lists, images, tables)
- Math inside `$...$` and `\[...\]` is passed through untouched to MathJax
- Do **not** manually edit `docs/questions.json` — always regenerate it

---

## Source naming conventions

| Competition | `source` value |
|-------------|----------------|
| Brazilian Econ Olympiad | `OBECON` |
| International Economics Olympiad | `IEO` |
| Canadian Economics Olympiad | `CEO` |
| Russian Economics Olympiad | `REO` |
| Northwestern Economics Tournament | `NET` |
| National Olympiad in Iran (Econ) | `NOIC` |

---

## Running locally

Open `docs/index.html` in a browser (needs a local server for the JSON fetch):
```bash
cd docs && python3 -m http.server 8080
# then open http://localhost:8080
```
