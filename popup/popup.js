import { analyzeText } from "../src/analyzer.js";
import { renderExplainability } from "../src/privacy.js";

const qs = (sel) => document.querySelector(sel);
let highlightsVisible = true;
let loading = false;
let currentFeedbackKey = null;

function isOnline() { return typeof navigator !== 'undefined' ? navigator.onLine : true; }

function colorForScore(score) {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function requestExtraction(mode) {
  const tab = await getActiveTab();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: mode === 'page' ? 'SCAN_PAGE' : 'SCAN_SELECTION' });
    return { tab, text: res?.text || "", meta: res?.meta || {} };
  } catch (e) {
    // Content script may not be injected (e.g., chrome://, special pages)
    return { tab, text: "", meta: { error: 'content_script_unavailable' } };
  }
}

function renderResults(output) {
  const results = qs('#results');
  const scoreEl = qs('#score');
  const badge = qs('#badge');
  const biasEl = qs('#bias');
  const biasConfEl = qs('#biasConf');
  const biasPointer = qs('#biasPointer');
  const flagsEl = qs('#flags');
  const panel = qs('#highlightsPanel');
  const sourcesEl = qs('#sources');
  const explain = qs('#explainability');
  const offlineEl = qs('#offline');

  results.classList.remove('hidden');

  const authenticity = Math.max(0, Math.min(100, 100 - (output.final_score || 0)));
  scoreEl.textContent = `${authenticity}%`;
  scoreEl.classList.remove('green','yellow','red');
  scoreEl.classList.add(colorForScore(authenticity));
  badge.textContent = `${authenticity}%`;
  // Bias meter
  const b = output.bias || { label: 'Center', score: 50, confidence: 0.5 };
  biasEl.textContent = b.label || 'Center';
  biasConfEl.textContent = `(${(b.confidence ?? 0.5).toFixed(1)})`;
  if (biasPointer && typeof b.score === 'number') {
    const pct = Math.max(0, Math.min(100, b.score));
    biasPointer.style.left = `${pct}%`;
  }

  flagsEl.innerHTML = '';
  (output.flags || []).forEach(f => {
    const el = document.createElement('span');
    el.className = 'flag';
    el.textContent = f;
    flagsEl.appendChild(el);
  });

  panel.innerHTML = '<h3>Flagged Claims</h3>' + (output.highlights || []).map(h => `
    <div class="source">
      <strong>"${h.span}"</strong><br/>
      <em>${h.reason}</em> — ${h.explanation}
    </div>
  `).join('');

  sourcesEl.innerHTML = '<h3>Suggested Sources</h3>' + (output.suggested_sources || []).map(s => `
    <div class="source">
      <a href="${s.url}" target="_blank" rel="noreferrer">${s.title}</a>
      <div>Reliability: ${s.reliability_score}/100 — ${s.reason}</div>
      ${s.evidence_snippet ? `<div>Snippet: ${s.evidence_snippet}</div>` : ''}
    </div>
  `).join('');

  // Offline banner
  if (!isOnline() || output?.snopes?.error === 'offline') offlineEl.classList.remove('hidden');
  else offlineEl.classList.add('hidden');

  // Include Snopes verdict when available
  const snopesVerdict = output.snopes?.result?.rating ? `<div class="source"><strong>Snopes:</strong> ${output.snopes.result.rating}${output.snopes.result.url ? ` — <a href="${output.snopes.result.url}" target="_blank">view</a>` : ''}${output.snopes.result.evidence ? `<div>${output.snopes.result.evidence}</div>` : ''}</div>` : '';
  const notices = (output.notices && output.notices.length) ? (`<div class="source" style="color:#9a3412"><strong>Notices:</strong><ul>` + output.notices.map(n=>`<li>${n}</li>`).join('') + `</ul></div>`) : '';
  explain.innerHTML = renderExplainability(output) + snopesVerdict + notices;

  // Load community accuracy if available
  updateCommunity();
}

async function run(mode) {
  if (loading) return;
  loading = true;
  const btnPage = qs('#scanPage');
  const btnSel = qs('#scanSelection');
  btnPage.disabled = true; btnSel.disabled = true;
  const originalBadge = qs('#badge').textContent;
  qs('#badge').textContent = '...';
  const { tab, text, meta } = await requestExtraction(mode);
  // Prepare feedback key per URL+title
  currentFeedbackKey = makeFeedbackKey(tab?.url || '', (meta?.headline || tab?.title || ''), mode);
  try {
    if (!text || !text.trim()) {
      const explain = qs('#explainability');
      explain.innerHTML = `<div style="color:#9a3412">No analyzable text returned. This page may block content scripts or has no readable content. Try another page or select text.</div>`;
      renderResults({ final_score: 50, flags: [], highlights: [], suggested_sources: [], bias: { label: 'Neutral' }, notices: ['Page returned no text; local heuristics used.'] });
      return;
    }
    const payload = { mode, text, url: tab.url, title: (meta?.headline || tab.title), language: 'en', meta };
    const output = await analyzeText(payload);
    renderResults(output);
    // ask content script to highlight
    await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_HIGHLIGHTS', highlights: output.highlights || [] });
  } catch (e) {
    const explain = qs('#explainability');
    explain.innerHTML = `<div style="color:#b91c1c">Analysis error: ${e?.message || 'Unknown error'}. Working offline with heuristics.</div>`;
  } finally {
    loading = false;
    btnPage.disabled = false; btnSel.disabled = false;
    qs('#badge').textContent = originalBadge;
  }
}

function makeFeedbackKey(url, title, mode) {
  const key = (url || '') + '|' + (title || '') + '|' + (mode || 'page');
  let h = 0; for (let i=0;i<key.length;i++){ h = (h<<5)-h+key.charCodeAt(i); h|=0; }
  return 'k' + (h >>> 0).toString(16);
}

async function submitFeedback(type) {
  if (!currentFeedbackKey) return;
  const { feedback = {} } = await chrome.storage.local.get('feedback');
  const entry = feedback[currentFeedbackKey] || { agree: 0, disagree: 0 };
  if (type === 'agree') entry.agree += 1; else entry.disagree += 1;
  feedback[currentFeedbackKey] = entry;
  await chrome.storage.local.set({ feedback });
  updateCommunity();
}

async function updateCommunity() {
  const el = qs('#community');
  if (!currentFeedbackKey) { el.textContent = ''; return; }
  const { feedback = {} } = await chrome.storage.local.get('feedback');
  const entry = feedback[currentFeedbackKey] || { agree: 0, disagree: 0 };
  const total = entry.agree + entry.disagree;
  if (!total) { el.textContent = ''; return; }
  const pct = Math.round((entry.agree / total) * 100);
  el.textContent = `Community accuracy: ${pct}% (${total} votes)`;
}

qs('#scanPage').addEventListener('click', () => run('page'));
qs('#scanSelection').addEventListener('click', () => run('selection'));
qs('#toggleHighlights').addEventListener('click', async () => {
  const tab = await getActiveTab();
  highlightsVisible = !highlightsVisible;
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_HIGHLIGHTS', visible: highlightsVisible });
});

qs('#save').addEventListener('click', async () => {
  // Minimal history saver
  const state = {
    url: (await getActiveTab()).url,
    ts: Date.now(),
    score: qs('#score').textContent
  };
  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift(state);
  await chrome.storage.local.set({ history: history.slice(0, 50) });
});

// Feedback events
qs('#agreeBtn').addEventListener('click', () => submitFeedback('agree'));
qs('#disagreeBtn').addEventListener('click', () => submitFeedback('disagree'));
