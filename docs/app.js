/* ── State ───────────────────────────────────────────────────────────────── */
let ALL_QUESTIONS = [];
let filtered      = [];
let sortCol       = 'id';
let sortDir       = 'asc';
let showAnswer    = false;
let showSolution  = false;
let testQuestions = [];   // ordered list of selected question objects
let dragSrcIdx    = null;

const LETTERS = ['A','B','C','D','E','F','G','H'];

/* ── LaTeX → HTML converter ─────────────────────────────────────────────── */
function ltx(tex) {
  if (!tex) return '';
  let s = tex;

  // Images
  s = s.replace(/\\includegraphics(?:\[.*?\])?\{\.\.\/images\/(.*?)\}/g,
    '<img src="images/$1" alt="figure">');

  // tcolorbox → news-box (capture content inside optional args and mandatory arg)
  s = s.replace(/\\begin\{tcolorbox\}(?:\[.*?\])?([\s\S]*?)\\end\{tcolorbox\}/g,
    '<div class="news-box">$1</div>');

  // Tables (basic)
  s = s.replace(/\\begin\{tabular\}\{.*?\}([\s\S]*?)\\end\{tabular\}/g, (_, body) => {
    const rows = body.split('\\\\').map(r => r.trim()).filter(r => r && !r.match(/^\\h?line\s*$/));
    const html = rows.map((row, i) => {
      const cells = row.replace(/\\hline/g, '').split('&').map(c => {
        const content = ltxInline(c.trim());
        return i === 0 ? `<th>${content}</th>` : `<td>${content}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table>${html}</table>`;
  });

  // Environments
  s = s.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g,
    '<div style="text-align:center">$1</div>');
  s = s.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, body) => {
    const items = body.split('\\item').filter(x => x.trim());
    return '<ul>' + items.map(i => `<li>${ltxInline(i.trim())}</li>`).join('') + '</ul>';
  });
  s = s.replace(/\\begin\{enumerate\}(?:\[.*?\])?([\s\S]*?)\\end\{enumerate\}/g, (_, body) => {
    const items = body.split('\\item').filter(x => x.trim());
    return '<ol>' + items.map(i => `<li>${ltxInline(i.trim())}</li>`).join('') + '</ol>';
  });

  s = ltxInline(s);

  // Paragraphs
  s = s.replace(/\n{2,}/g, '</p><p>');
  return '<p>' + s + '</p>';
}

function ltxInline(s) {
  // Protect math regions so we don't mangle LaTeX inside $...$ or \[...\]
  const mathRegions = [];
  s = s.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]*?\$)/g, match => {
    const idx = mathRegions.length;
    mathRegions.push(match);
    return `\x00MATH${idx}\x00`;
  });

  // Text formatting
  s = s.replace(/\\textbf\{([\s\S]*?)\}/g,  '<strong>$1</strong>');
  s = s.replace(/\\textit\{([\s\S]*?)\}/g,  '<em>$1</em>');
  s = s.replace(/\\emph\{([\s\S]*?)\}/g,    '<em>$1</em>');
  s = s.replace(/\\textsf\{([\s\S]*?)\}/g,  '$1');
  s = s.replace(/\\texttt\{([\s\S]*?)\}/g,  '<code>$1</code>');
  s = s.replace(/\\textcolor\{.*?\}\{([\s\S]*?)\}/g, '$1');
  s = s.replace(/\\tiny|\\small|\\large|\\Large|\\LARGE|\\huge|\\Huge/g, '');

  // Symbols
  s = s.replace(/\\checkmark/g, '✓');
  s = s.replace(/\\texttimes/g, '✗');
  s = s.replace(/\\ldots/g,     '…');
  s = s.replace(/\\cdot/g,      '·');
  s = s.replace(/\\%/g,         '%');
  s = s.replace(/\\&/g,         '&amp;');
  s = s.replace(/\\\$/g,        '&#36;');
  s = s.replace(/\\#/g,         '#');
  s = s.replace(/\\{/g,         '{');
  s = s.replace(/\\}/g,         '}');
  s = s.replace(/---/g,         '—');
  s = s.replace(/--/g,          '–');
  s = s.replace(/``/g,          '\u201C');
  s = s.replace(/''/g,          '\u201D');

  // Spacing/breaks
  s = s.replace(/\\ /g, ' ');
  s = s.replace(/~/g, '\u00a0');
  s = s.replace(/\\\\(\[.*?\])?/g, '<br>');
  s = s.replace(/\\(?:[vh]space\*?|medskip|bigskip|smallskip|noindent)\{?.*?\}?/g, '');
  s = s.replace(/\\quad|\\qquad|\\,|\\;|\\:/g, ' ');

  // Misc commands to strip
  s = s.replace(/\\(?:hline|toprule|midrule|bottomrule|cline\{.*?\})/g, '');
  s = s.replace(/\\(?:label|ref|cite|footnote)\{.*?\}/g, '');
  s = s.replace(/\\(?:centering|raggedright|raggedleft)/g, '');
  s = s.replace(/\\multirow\{.*?\}\{.*?\}\{([\s\S]*?)\}/g, '$1');
  s = s.replace(/\\multicolumn\{.*?\}\{.*?\}\{([\s\S]*?)\}/g, '$1');

  // Restore math regions
  s = s.replace(/\x00MATH(\d+)\x00/g, (_, i) => mathRegions[+i]);

  // \mathbb{Z} etc handled by MathJax
  return s;
}

/* ── Build stats ─────────────────────────────────────────────────────────── */
function buildStats(qs) {
  const counts = {};
  qs.forEach(q => { counts[q.topic] = (counts[q.topic] || 0) + 1; });
  const el = document.getElementById('stats');
  el.innerHTML = `
    <div class="stat-chip">Total <span>${qs.length}</span></div>
    ${Object.entries(counts).sort().map(([t,n]) =>
      `<div class="stat-chip">${t} <span>${n}</span></div>`).join('')}
  `;
}

/* ── Populate filters ────────────────────────────────────────────────────── */
function populateFilters(qs) {
  const fill = (id, key) => {
    const sel = document.getElementById(id);
    const vals = [...new Set(qs.map(q => q[key]).filter(Boolean))].sort();
    vals.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  };
  fill('filter-source', 'source');
  fill('filter-topic',  'topic');
  fill('filter-year',   'year');
  fill('filter-type',   'type');
}

/* ── Filter & sort ───────────────────────────────────────────────────────── */
function applyFilters() {
  const q      = document.getElementById('search').value.toLowerCase();
  const source = document.getElementById('filter-source').value;
  const topic  = document.getElementById('filter-topic').value;
  const year   = document.getElementById('filter-year').value;
  const type   = document.getElementById('filter-type').value;

  filtered = ALL_QUESTIONS.filter(item => {
    if (source && item.source !== source) return false;
    if (topic  && item.topic  !== topic)  return false;
    if (year   && item.year   !== year)   return false;
    if (type   && item.type   !== type)   return false;
    if (q) {
      const hay = [item.id, item.title, item.topic, item.subtopic,
                   item.source, item.year, item.round, item.statement,
                   item.solution].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let va = (a[sortCol] || '').toString();
    let vb = (b[sortCol] || '').toString();
    const num = !isNaN(va) && !isNaN(vb);
    let cmp = num ? Number(va) - Number(vb) : va.localeCompare(vb);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  renderTable();
  renderActiveTags();
}

/* ── Render table ────────────────────────────────────────────────────────── */
function renderTable() {
  const tbody = document.getElementById('q-body');
  const noRes = document.getElementById('no-results');
  const count = document.getElementById('count-bar');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    noRes.classList.remove('hidden');
    count.textContent = '';
    return;
  }
  noRes.classList.add('hidden');
  count.textContent = `Showing ${filtered.length} of ${ALL_QUESTIONS.length} questions`;

  const selectedIds = new Set(testQuestions.map(q => q.id));

  tbody.innerHTML = filtered.map((q, i) => `
    <tr data-idx="${i}" class="${selectedIds.has(q.id) ? 'row-selected' : ''}">
      <td class="td-check" onclick="event.stopPropagation()">
        <input type="checkbox" class="q-check" data-idx="${i}"
          ${selectedIds.has(q.id) ? 'checked' : ''}>
      </td>
      <td class="td-id">${q.id || '—'}</td>
      <td class="td-title">${q.title || '—'}</td>
      <td><span class="badge badge-${q.source}">${q.source || '—'}</span></td>
      <td>${q.year || '—'}</td>
      <td><span class="badge badge-${q.topic}">${q.topic || '—'}</span></td>
      <td class="td-subtopic">${q.subtopic || '—'}</td>
      <td><span class="badge badge-${q.type}">${q.type || '—'}</span></td>
      <td>${q.answer
        ? `<span class="answer-badge ${q.type === 'numeric' ? 'numeric' : ''}">${q.answer}</span>`
        : '<span style="color:#9ca3af">—</span>'}</td>
    </tr>
  `).join('');

  // Row click → open modal; checkbox click → toggle test selection
  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => openModal(filtered[+row.dataset.idx]));
  });
  tbody.querySelectorAll('.q-check').forEach(cb => {
    cb.addEventListener('change', () => {
      toggleTestQuestion(filtered[+cb.dataset.idx]);
    });
  });

  // Select-all checkbox
  const selAll = document.getElementById('select-all');
  if (selAll) {
    selAll.checked = filtered.length > 0 && filtered.every(q =>
      testQuestions.some(t => t.id === q.id));
    selAll.indeterminate = !selAll.checked &&
      filtered.some(q => testQuestions.some(t => t.id === q.id));
  }
}

/* ── Active filter tags ──────────────────────────────────────────────────── */
function renderActiveTags() {
  const wrap = document.getElementById('active-filters');
  const tags = [];
  const ids  = ['filter-source','filter-topic','filter-year','filter-type'];
  ids.forEach(id => {
    const v = document.getElementById(id).value;
    if (v) tags.push({ id, label: v });
  });
  wrap.innerHTML = tags.map(t =>
    `<div class="filter-tag">${t.label}
      <button data-id="${t.id}" title="Remove">✕</button>
    </div>`
  ).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.id).value = '';
      applyFilters();
    });
  });
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
function openModal(q) {
  showAnswer   = false;
  showSolution = false;

  // Meta header
  document.getElementById('modal-meta').innerHTML = `
    <h2>${q.title || 'Untitled'}</h2>
    <div class="meta-chips">
      ${q.id     ? `<span class="meta-chip">Q${q.id}</span>` : ''}
      ${q.source ? `<span class="meta-chip">${q.source}</span>` : ''}
      ${q.year   ? `<span class="meta-chip">${q.year}</span>` : ''}
      ${q.round  ? `<span class="meta-chip">${q.round.replace(/--/g,'–')}</span>` : ''}
      ${q.topic  ? `<span class="meta-chip">${q.topic}</span>` : ''}
      ${q.subtopic ? `<span class="meta-chip">${q.subtopic}</span>` : ''}
      ${q.type   ? `<span class="meta-chip">${q.type}</span>` : ''}
      ${q.language ? `<span class="meta-chip">${q.language}</span>` : ''}
    </div>
  `;

  // Statement
  document.getElementById('modal-statement').innerHTML = ltx(q.statement || '');

  // Choices
  const choicesEl = document.getElementById('modal-choices');
  if (q.choices && q.choices.length > 0) {
    choicesEl.innerHTML = q.choices.map((c, i) => {
      const letter = LETTERS[i];
      const isCorrect = q.answer === letter;
      return `
        <div class="choice-item ${showAnswer && isCorrect ? 'correct' : ''}">
          <span class="choice-letter">${letter}</span>
          <span>${ltxInline(c)}</span>
        </div>`;
    }).join('');
    choicesEl.classList.remove('hidden');
  } else {
    choicesEl.innerHTML = '';
  }

  // Answer / solution toggles
  const ansEl = document.getElementById('modal-answer');
  ansEl.innerHTML = q.answer
    ? `<strong>Answer:</strong> ${q.type === 'numeric' ? q.answer : `Option (${q.answer})`}`
    : 'No answer key available.';
  ansEl.classList.add('hidden');

  document.getElementById('modal-solution-body').innerHTML =
    ltx(q.solution || 'Solution not yet available.');
  document.getElementById('modal-solution').classList.add('hidden');

  const btnAns = document.getElementById('toggle-answer');
  const btnSol = document.getElementById('toggle-solution');
  btnAns.textContent   = 'Show Answer';
  btnSol.textContent   = 'Show Solution';
  btnAns.classList.remove('active');
  btnSol.classList.remove('active');

  btnAns.onclick = () => {
    showAnswer = !showAnswer;
    ansEl.classList.toggle('hidden', !showAnswer);
    btnAns.textContent = showAnswer ? 'Hide Answer' : 'Show Answer';
    btnAns.classList.toggle('active', showAnswer);
    // Highlight correct choice
    if (q.choices && q.choices.length) {
      choicesEl.querySelectorAll('.choice-item').forEach((el, i) => {
        el.classList.toggle('correct', showAnswer && LETTERS[i] === q.answer);
        el.querySelector('.choice-letter').style.background =
          showAnswer && LETTERS[i] === q.answer ? 'var(--green)' : '';
      });
    }
    rerenderMath();
  };

  btnSol.onclick = () => {
    showSolution = !showSolution;
    document.getElementById('modal-solution').classList.toggle('hidden', !showSolution);
    btnSol.textContent = showSolution ? 'Hide Solution' : 'Show Solution';
    btnSol.classList.toggle('active', showSolution);
    rerenderMath();
  };

  // Show modal
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  rerenderMath();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function rerenderMath() {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([document.getElementById('modal-overlay')]).catch(() => {});
  }
}

/* ── Test Builder ────────────────────────────────────────────────────────── */
function toggleTestQuestion(q) {
  const idx = testQuestions.findIndex(t => t.id === q.id);
  if (idx === -1) testQuestions.push(q);
  else testQuestions.splice(idx, 1);
  updateTestBuilder();
  renderTable(); // refresh checkboxes + row highlights
}

function updateTestBuilder() {
  const n = testQuestions.length;
  document.getElementById('test-count').textContent =
    n === 0 ? '0 questions selected'
    : n === 1 ? '1 question selected'
    : `${n} questions selected`;

  const builder = document.getElementById('test-builder');
  builder.classList.toggle('has-selection', n > 0);

  renderTestList();
}

function renderTestList() {
  const list = document.getElementById('test-list');
  if (testQuestions.length === 0) {
    list.innerHTML = '<li class="test-empty">No questions selected yet. Check rows in the table.</li>';
    return;
  }
  list.innerHTML = testQuestions.map((q, i) => `
    <li class="test-item" draggable="true" data-idx="${i}">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span class="test-item-num">${i + 1}.</span>
      <span class="test-item-id">Q${q.id}</span>
      <span class="test-item-title">${q.title || '—'}</span>
      <span class="badge badge-${q.topic} badge-sm">${q.topic}</span>
      <span class="badge badge-${q.type} badge-sm">${q.type}</span>
      <button class="btn-icon remove-q" data-idx="${i}" title="Remove">✕</button>
    </li>
  `).join('');

  list.querySelectorAll('.remove-q').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      testQuestions.splice(+btn.dataset.idx, 1);
      updateTestBuilder();
      renderTable();
    });
  });

  // Drag-to-reorder
  list.querySelectorAll('.test-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrcIdx = +item.dataset.idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.test-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const destIdx = +item.dataset.idx;
      if (dragSrcIdx !== null && dragSrcIdx !== destIdx) {
        const [moved] = testQuestions.splice(dragSrcIdx, 1);
        testQuestions.splice(destIdx, 0, moved);
        dragSrcIdx = null;
        updateTestBuilder();
      }
    });
  });
}

function generatePDF(questions, includeSolutions) {
  const name    = document.getElementById('test-name').value.trim() || 'Test';
  const title   = name + (includeSolutions ? ' \u2014 Solutions' : '');
  const sources = [...new Set(questions.map(q => q.source).filter(Boolean))].join(', ');
  const baseUrl = window.location.href.replace(/\/[^\/]*$/, '/');
  const ALPHA   = 'ABCDEFGH';

  // Pre-render each question to HTML using the existing ltx() / ltxInline() converters
  const blocks = questions.map((q, qi) => {
    const stmtHtml = ltx(q.statement || '');

    // Choices
    let choicesHtml = '';
    if (q.choices && q.choices.length > 0) {
      const items = q.choices.map((c, ci) => {
        const letter  = ALPHA[ci];
        const correct = includeSolutions && q.answer === letter;
        return `<li class="${correct ? 'correct-choice' : ''}">`
          + `<span class="choice-letter-pdf">${letter}</span>`
          + `<span>${ltxInline(c)}</span></li>`;
      }).join('');
      choicesHtml = `<ol class="choices-pdf">${items}</ol>`;
    }

    // Answer badge (numeric / dissertative)
    let answerHtml = '';
    if (includeSolutions && q.answer && q.type !== 'objective') {
      answerHtml = `<div class="answer-pdf"><strong>Answer:</strong> ${q.answer}</div>`;
    }

    // Solution box
    let solutionHtml = '';
    if (includeSolutions && q.solution && q.solution.trim()) {
      solutionHtml = `<div class="solution-pdf"><div class="sol-label">Solution</div>${ltx(q.solution.trim())}</div>`;
    }

    const meta  = [q.source, q.year, q.round].filter(Boolean).join(' \xb7 ');
    const topic = [q.topic, q.subtopic].filter(Boolean).join(' \u2014 ');

    return `<div class="question-pdf">
  <div class="q-header-pdf">
    <span class="q-num-pdf">${qi + 1}.</span>
    <span class="q-title-pdf">${q.title || ''}</span>
    <span class="q-meta-pdf">${meta}</span>
  </div>
  <div class="q-topic-pdf">${topic}</div>
  <div class="q-stmt-pdf">${stmtHtml}</div>
  ${choicesHtml}${answerHtml}${solutionHtml}
</div>`;
  }).join('<hr class="q-sep">');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${title}</title>
<base href="${baseUrl}">
<script>
window.MathJax = {
  tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['\\\\[','\\\\]']] },
  options: { skipHtmlTags: ['script','noscript','style','textarea'] },
  startup: { ready() { MathJax.startup.defaultReady(); MathJax.startup.promise.then(() => window.print()); } }
};
<\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Georgia,serif;font-size:11pt;line-height:1.55;
     color:#000;padding:20mm 22mm;max-width:210mm;margin:0 auto}
h1{font-size:18pt;text-align:center;margin-bottom:4pt}
.cover{text-align:center;margin-bottom:18pt;padding-bottom:10pt;border-bottom:1.5pt solid #000}
.cover p{font-size:11pt;color:#444;margin-top:4pt}
.question-pdf{margin:0 0 18pt 0}
.q-header-pdf{display:flex;align-items:baseline;gap:6pt;margin-bottom:3pt}
.q-num-pdf{font-size:13pt;font-weight:bold;min-width:20pt;flex-shrink:0}
.q-title-pdf{font-weight:bold;font-size:11pt;flex:1}
.q-meta-pdf{font-size:8.5pt;color:#555;white-space:nowrap}
.q-topic-pdf{font-size:8.5pt;color:#777;margin-bottom:6pt;font-style:italic}
.q-stmt-pdf p{margin:0 0 5pt 0}
.q-stmt-pdf img{max-width:80%;height:auto;display:block;margin:8pt auto}
.q-stmt-pdf table{border-collapse:collapse;margin:6pt auto;font-size:10pt}
.q-stmt-pdf td,.q-stmt-pdf th{border:1pt solid #aaa;padding:3pt 8pt}
.q-stmt-pdf th{background:#f0f0f0}
.q-stmt-pdf ul,.q-stmt-pdf ol{padding-left:20pt;margin:4pt 0}
.q-stmt-pdf li{margin-bottom:2pt}
.news-box{border:1pt solid #bbb;border-radius:4pt;padding:8pt 12pt;
          background:#f9f9f9;margin:6pt 0;font-size:10pt}
.choices-pdf{list-style:none;margin:8pt 0 6pt 0;padding:0}
.choices-pdf li{display:flex;align-items:baseline;gap:8pt;padding:3pt 6pt;
                border-radius:3pt;margin-bottom:2pt}
.correct-choice{background:#d4edda;font-weight:bold}
.choice-letter-pdf{font-weight:bold;min-width:18pt;flex-shrink:0}
.answer-pdf{margin:6pt 0;font-size:10.5pt}
.solution-pdf{border-left:3pt solid #28a745;background:#f0faf0;
              padding:8pt 12pt;margin:8pt 0;font-size:10pt}
.sol-label{font-weight:bold;margin-bottom:4pt;font-size:10pt;color:#1a6630}
.solution-pdf p{margin:0 0 4pt 0}
.solution-pdf ul,.solution-pdf ol{padding-left:18pt;margin:3pt 0}
hr.q-sep{border:none;border-top:0.5pt solid #ccc;margin:14pt 0}
@media print{
  body{padding:0;margin:0}
  .question-pdf{page-break-inside:avoid}
  hr.q-sep{margin:10pt 0}
}
</style>
</head><body>
<div class="cover">
  <h1>${title}</h1>
  <p>${questions.length} Question${questions.length !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; ${sources}</p>
</div>
${blocks}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups for this site to generate PDFs.'); return; }
  w.document.write(html);
  w.document.close();
}

/* ── Sort ────────────────────────────────────────────────────────────────── */
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col; sortDir = 'asc';
    }
    document.querySelectorAll('th').forEach(t => {
      t.classList.remove('sort-asc','sort-desc');
    });
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    applyFilters();
  });
});

/* ── Event listeners ─────────────────────────────────────────────────────── */
document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('clear-search').addEventListener('click', () => {
  document.getElementById('search').value = '';
  applyFilters();
});
document.getElementById('reset-filters').addEventListener('click', () => {
  ['filter-source','filter-topic','filter-year','filter-type'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('search').value = '';
  applyFilters();
});
['filter-source','filter-topic','filter-year','filter-type'].forEach(id => {
  document.getElementById(id).addEventListener('change', applyFilters);
});
// Select-all checkbox
document.getElementById('select-all').addEventListener('change', function() {
  if (this.checked) {
    filtered.forEach(q => {
      if (!testQuestions.some(t => t.id === q.id)) testQuestions.push(q);
    });
  } else {
    const filteredIds = new Set(filtered.map(q => q.id));
    testQuestions = testQuestions.filter(q => !filteredIds.has(q.id));
  }
  updateTestBuilder();
  renderTable();
});

// Test builder panel toggle
document.getElementById('toggle-builder').addEventListener('click', () => {
  const panel = document.getElementById('test-builder');
  const btn = document.getElementById('toggle-builder');
  const isOpen = panel.classList.toggle('open');
  btn.textContent = isOpen ? 'Build Test ▼' : 'Build Test ▲';
});

document.getElementById('clear-test').addEventListener('click', () => {
  testQuestions = [];
  const panel = document.getElementById('test-builder');
  panel.classList.remove('open');
  document.getElementById('toggle-builder').textContent = 'Build Test ▲';
  updateTestBuilder();
  renderTable();
});

document.getElementById('dl-questions').addEventListener('click', () => {
  if (!testQuestions.length) return;
  generatePDF(testQuestions, false);
});

document.getElementById('dl-solutions').addEventListener('click', () => {
  if (!testQuestions.length) return;
  generatePDF(testQuestions, true);
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ── Init ────────────────────────────────────────────────────────────────── */
fetch('questions.json')
  .then(r => r.json())
  .then(data => {
    ALL_QUESTIONS = data;
    buildStats(data);
    populateFilters(data);
    applyFilters();
  })
  .catch(err => {
    document.getElementById('q-body').innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:40px;color:#ef4444">
        Failed to load questions.json: ${err.message}
      </td></tr>`;
  });
