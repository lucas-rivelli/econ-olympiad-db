# Economics Olympiad Question Database

A structured LaTeX database of questions from major economics olympiads.

## Olympiads covered

| Code | Name | Language |
|------|------|----------|
| OBECON | Olimpíada Brasileira de Economia | Portuguese |
| IEO | International Economics Olympiad | English |
| CEO | Canadian Economics Olympiad | English |
| REO | Russian Economics Olympiad | Russian/English |
| NET | Northwestern Economics Tournament | English |
| NOIC | Northwestern Olympiad in Informatics and Computing | English |

## Topic categories

- `micro/` — Microeconomics
- `macro/` — Macroeconomics
- `game_theory/` — Game Theory
- `finance/` — Finance

Subtopics are defined per question (e.g. Demand Theory, IS-LM, Nash Equilibrium).

## Folder structure

```
Database/
├── questions/          ← one .tex file per question, organized by topic
│   ├── micro/
│   ├── macro/
│   ├── game_theory/
│   └── finance/
├── images/             ← images referenced by questions (q0001_fig1.png, etc.)
├── olympiads/          ← original PDF files organized by olympiad
│   ├── OBECON/
│   ├── IEO/
│   ├── CEO/
│   ├── REO/
│   ├── NET/
│   └── NOIC/
├── styles/
│   └── questions.sty   ← shared LaTeX macros and formatting
├── compiled/           ← master .tex files that \input questions
│   ├── _template_olympiad.tex
│   └── _template_topic.tex
└── database.csv        ← structured index of all questions
```

## Adding a new question

1. Find the next available ID in `database.csv`
2. Copy `questions/micro/q0001.tex` (template) to the appropriate topic folder
3. Fill in all fields in the `\question{...}` command
4. If the question has images, save them as `images/q000X_fig1.png`
5. Add a row to `database.csv`
6. Add `\input{../questions/TOPIC/q000X}` to the relevant compiled files

## Compiling PDFs

From the `Database/` root directory:

```bash
# Compile all micro questions
pdflatex compiled/micro.tex

# Compile all OBECON questions
pdflatex compiled/OBECON.tex
```

To compile **without solutions** (for practice sets), set `\showsolutionsfalse` in the compiled file.

## database.csv columns

| Column | Description |
|--------|-------------|
| id | Zero-padded 4-digit ID (e.g. 0001) |
| title | Short descriptive title |
| source | Olympiad code (OBECON, IEO, CEO, REO, NET, NOIC) |
| year | Year of the competition |
| round | Phase/round (e.g. Phase 1, Final) |
| language | Language of the original question |
| topic | Main topic (Micro, Macro, Game Theory, Finance) |
| subtopic | Subtopic (free text) |
| type | `objective` or `dissertative` |
| file_path | Relative path to the .tex file |
| answer | Answer key (A–E for objective, short text for dissertative) |
| has_image | `true` or `false` |
