import { analyzeText } from "../src/analyzer.js";
import { renderExplainability } from "../src/privacy.js";

const qs = (sel) => document.querySelector(sel);
let highlightsVisible = true;

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
  const res = await chrome.tabs.sendMessage(tab.id, { type: mode === 'page' ? 'SCAN_PAGE' : 'SCAN_SELECTION' });
  return { tab, text: res?.text || "", meta: res?.meta || {} };
}

function renderResults(output) {
  const results = qs('#results');
  const scoreEl = qs('#score');
  const badge = qs('#badge');
  const biasEl = qs('#bias');
  const flagsEl = qs('#flags');
  const panel = qs('#highlightsPanel');
  const sourcesEl = qs('#sources');
  const explain = qs('#explainability');

  results.classList.remove('hidden');

  scoreEl.textContent = `${output.final_score}%`;
  scoreEl.classList.remove('green','yellow','red');
  scoreEl.classList.add(colorForScore(output.final_score));
  badge.textContent = `${output.final_score}%`;
  biasEl.textContent = output.bias?.label || 'Neutral';

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

  explain.innerHTML = renderExplainability(output);
}

async function run(mode) {
  const { tab, text, meta } = await requestExtraction(mode);
  if (!text || !text.trim()) {
    renderResults({ final_score: 50, flags: [], highlights: [], suggested_sources: [], bias: { label: 'Neutral' } });
    return;
  }
  const payload = { mode, text, url: tab.url, title: tab.title, language: 'en' };
  const output = await analyzeText(payload);
  renderResults(output);
  // ask content script to highlight
  await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_HIGHLIGHTS', highlights: output.highlights || [] });
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
