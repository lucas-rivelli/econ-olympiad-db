/* ── State ───────────────────────────────────────────────────────────────── */
let ALL_QUESTIONS = [];
let filtered      = [];
let sortCol       = 'id';
let sortDir       = 'asc';
let showAnswer    = false;
let showSolution  = false;

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

  tbody.innerHTML = filtered.map((q, i) => `
    <tr data-idx="${i}">
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

  // Row click → open modal
  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => openModal(filtered[+row.dataset.idx]));
  });
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
