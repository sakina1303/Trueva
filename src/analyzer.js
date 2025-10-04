import { scoreReliability, suggestSources, makeSearchQueries } from './sources.js';
import { detectBias } from './scoring.js';

const FLAGS = ["exaggeration","missing_evidence","sensationalism","biased_language","uncited_statistic","source_ambiguity","misleading_context"];

function quickInitialScore(text) {
  // Fast heuristics: exclamation, ALL CAPS, superlatives, numbers with no context
  let s = 50;
  if (/[!]{2,}/.test(text) || /\b(guaranteed|shocking|unbelievable|exposed)\b/i.test(text)) s += 15;
  if (/\b(always|never|everyone|no one)\b/i.test(text)) s += 10;
  if (/(\b\d{2,}%\b|\b\d{4,}\b)/.test(text)) s += 5;
  if (/[A-Z]{5,}/.test(text)) s += 5;
  return Math.max(0, Math.min(100, s));
}

function findHighlights(text) {
  const spans = [];
  const patterns = [
    { flag: 'exaggeration', re: /\b(doubles your lifespan|cure-all|miracle|100% safe|guaranteed)\b/ig, reason: 'Potential exaggeration' },
    { flag: 'sensationalism', re: /\b(shocking|explosive|exposed|cover-?up|you won\'t believe)\b/ig, reason: 'Likely sensational framing' },
    { flag: 'biased_language', re: /\b(corrupt elites|mainstream media lies|traitors|sheeple)\b/ig, reason: 'Potentially biased language' },
    { flag: 'uncited_statistic', re: /\b\d{1,3}%\b/ig, reason: 'Statistic may lack citation' },
    { flag: 'source_ambiguity', re: /\b(experts say|sources claim|it is said)\b/ig, reason: 'Ambiguous source reference' },
    { flag: 'misleading_context', re: /\b(out of context|taken out of context)\b/ig, reason: 'Context warning' }
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.re.exec(text)) !== null) {
      spans.push({
        span: m[0],
        start: m.index,
        end: m.index + m[0].length,
        reason: p.flag,
        explanation: p.reason + ' — needs citation or nuance.'
      });
    }
  }
  return spans.slice(0, 20);
}

function aggregateFlags(highlights) {
  const set = new Set();
  for (const h of highlights) set.add(h.reason);
  return Array.from(set).filter(f => FLAGS.includes(f));
}

function finalScore(initial, text, flags, biasScore) {
  // Weight flags and bias
  let score = initial;
  score += flags.length * 5;
  score += Math.max(0, (biasScore - 50) / 5); // stronger bias -> more suspicious
  // Cap and floor
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function analyzeText(payload) {
  const { text, url = '', title = '' } = payload;
  const initial = quickInitialScore(text);
  const highlights = findHighlights(text);
  const flags = aggregateFlags(highlights);
  // Bias meter (0-100 right, 0-100 left mapped to label)
  const bias = detectBias(text);

  const { suggestions, strong } = suggestSources({ text, url, title, flags });
  const reliability = scoreReliability(suggestions);

  const final = finalScore(initial, text, flags, bias.score);

  return {
    initial_score: Math.round(initial),
    final_score: Math.round(final),
    model_confidence: strong ? 0.7 : 0.5,
    flags,
    highlights,
    neutral_rewrite: generateNeutralRewrite(text),
    suggested_sources: suggestions,
    suggested_search_queries: strong ? [] : makeSearchQueries(text),
    action_buttons: ["Open sources","Save to history","Report","Get author details"],
    error: null,
    bias
  };
}

function generateNeutralRewrite(text) {
  const trimmed = text.trim().slice(0, 240);
  // Heuristic rewrite
  return ("According to available information, the described claim may require verification; evidence and context should be reviewed.").slice(0, 120);
}
