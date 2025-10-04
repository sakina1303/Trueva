import { scoreReliability, suggestSources, makeSearchQueries } from './sources.js';
import { detectBias, lexicalBias } from './scoring.js';
import { snopesLookup } from './snopes.js';
import { detectDomainBias, combineBiasSignals } from './bias-detector.js';
import { extractEntities } from './entity-extractor.js';
import { evaluateCitations, evaluateTemporal } from './citation-checker.js';

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

function getHost(u) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }

const FACT_CHECKERS = new Set(['snopes.com','politifact.com','factcheck.org','afp.com','reuters.com']);

// Trusted major news domains (requested): India + Global
const TRUSTED_NEWS_DOMAINS = [
  // India
  'indiatimes.com', 'hindustantimes.com', 'news18.com', 'ndtv.com', 'indianexpress.com',
  'aajtak.in', 'abplive.com', 'livehindustan.com', 'thehindu.com', 'amarujala.com',
  // Global
  'yahoo.com', 'bbc.com', 'cnn.com', 'news.google.com', 'nytimes.com', 'theguardian.com',
  'dailymail.co.uk', 'foxnews.com', 'usatoday.com', 'msn.com'
];

function isHostTrusted(host) {
  if (!host) return false;
  return TRUSTED_NEWS_DOMAINS.some(d => host === d || host.endsWith('.' + d));
}

function randInt(min, max) { // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Additional authenticity tiers
const TIER80 = [
  'reuters.com','apnews.com','aljazeera.com','wsj.com','ft.com','economist.com','npr.org','pbs.org',
  'bloomberg.com','voanews.com','forbes.com','latimes.com','chicagotribune.com','csmonitor.com',
  'theatlantic.com','politico.com','nationalgeographic.com','dw.com','scmp.com','huffpost.com'
];
const TIER70 = [
  'timesofindia.indiatimes.com','deccanherald.com','firstpost.com','theweek.in','outlookindia.com',
  'deccanchronicle.com','telegraphindia.com','business-standard.com','moneycontrol.com','livemint.com',
  'cnbctv18.com','etvbharat.com','mid-day.com','freepressjournal.in','tribuneindia.com','thenewsminute.com',
  'swarajyamag.com','opindia.com','oneindia.com','news9live.com'
];
const TIER60 = [
  'zeenews.india.com','timesnownews.com','republicworld.com','dnaindia.com','newsnationtv.com','lokmat.com',
  'tv9hindi.com','etvbharat.com','prabhasakshi.com','samaylive.com','navbharattimes.indiatimes.com',
  'jagran.com','patrika.com','ibc24.in','khabar.ndtv.com','jantaserishta.com','khaskhabar.com',
  'divyabhaskar.co.in','gujarati.abplive.com','kannada.oneindia.com'
];
const TIER50 = [
  'dailypioneer.com','organiser.org','sundayguardianlive.com','samacharjagat.com','amarujala.tv','punjabkesari.in',
  'samaylive.com','sentinelassam.com','nenow.in','nagalandpost.com','manipurtimes.com','freepresskashmir.news',
  'greaterkashmir.com','dailyexcelsior.com','risingkashmir.com','kashmirmonitor.net','kashmirreader.com',
  'newsbharati.com','jammulinksnews.com','dailythanthi.com'
];

function hostMatches(list, host) {
  if (!host) return false;
  return list.some(d => {
    if (host === d) return true;
    if (host.endsWith('.' + d)) return true;
    // Permissive match: if host contains the domain with a boundary (e.g., foo-bbc.com should NOT match 'bbc.com')
    return host.includes('.' + d) || host.includes(d + '.');
  });
}

function detectLocalVerdict(text) {
  // Look for common rating boxes on fact-checker pages
  const t = (text || '').toLowerCase();
  const trueSignals = [/rating\s*:\s*true/, /\brating\b[^\n]{0,30}\btrue\b/, /\bverdict\b[^\n]{0,30}\btrue\b/];
  const falseSignals = [/rating\s*:\s*false/, /\brating\b[^\n]{0,30}\bfalse\b/, /\bverdict\b[^\n]{0,30}\bfalse\b/];
  if (trueSignals.some(r=>r.test(t))) return 'true';
  if (falseSignals.some(r=>r.test(t))) return 'false';
  return null;
}

function findHighlights(text) {
  const spans = [];
  const patterns = [
    { flag: 'exaggeration', re: /\b(doubles your lifespan|cure-all|miracle|100% safe|guaranteed)\b/ig, reason: 'exaggeration', category: 'language_bias', explain: 'Potential exaggeration — needs citation or nuance.' },
    { flag: 'sensationalism', re: /\b(shocking|explosive|exposed|cover-?up|you won\'t believe)\b/ig, reason: 'sensationalism', category: 'language_bias', explain: 'Likely sensational framing — may overstate the claim.' },
    { flag: 'biased_language', re: /\b(corrupt elites|mainstream media lies|traitors|sheeple)\b/ig, reason: 'biased_language', category: 'language_bias', explain: 'Potentially biased language — consider neutral wording.' },
    { flag: 'uncited_statistic', re: /\b\d{1,3}%\b/ig, reason: 'uncited_statistic', category: 'missing_evidence', explain: 'Statistic may lack citation — verify origin and methodology.' },
    { flag: 'source_ambiguity', re: /\b(experts say|sources claim|it is said)\b/ig, reason: 'source_ambiguity', category: 'missing_evidence', explain: 'Ambiguous source reference — look for named sources.' },
    { flag: 'misleading_context', re: /\b(out of context|taken out of context)\b/ig, reason: 'misleading_context', category: 'missing_evidence', explain: 'Context warning — check surrounding info and dates.' }
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.re.exec(text)) !== null) {
      spans.push({
        span: m[0],
        start: m.index,
        end: m.index + m[0].length,
        reason: p.flag,
        explanation: p.explain,
        category: p.category
      });
    }
  }
  return spans.slice(0, 50);
}

function aggregateFlags(highlights) {
  const set = new Set();
  for (const h of highlights) set.add(h.reason);
  return Array.from(set).filter(f => FLAGS.includes(f));
}

function finalScore(initial, text, flags, biasScore, snopesVerdict) {
  // Weight flags and bias
  let score = initial;
  score += flags.length * 5;
  score += Math.max(0, (biasScore - 50) / 5); // stronger bias -> more suspicious
  // If Snopes indicates false/mixture, increase suspicion; if true/correct, reduce
  if (snopesVerdict) {
    const v = (''+snopesVerdict).toLowerCase();
    if (/(false|fake|debunked|pants on fire|incorrect)/.test(v)) score = Math.min(100, score + 25);
    if (/(mixture|unproven|contested)/.test(v)) score = Math.min(100, score + 10);
    if (/(true|correct)/.test(v)) score = Math.max(0, score - 15);
  }
  // Cap and floor
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function analyzeText(payload) {
  const { text, url = '', title = '', mode = 'page', meta = {} } = payload;
  const ctxParts = [text || ''];
  if (meta?.surrounding?.before) ctxParts.push(meta.surrounding.before);
  if (meta?.surrounding?.after) ctxParts.push(meta.surrounding.after);
  if (meta?.description) ctxParts.push(meta.description);
  if (meta?.headline) ctxParts.push(meta.headline);
  const contextText = ctxParts.join(' \n ');
  const initial = quickInitialScore(text);
  const highlights = findHighlights(text);
  const flags = aggregateFlags(highlights);
  // Bias: combine domain-based (AllSides-like) with lexical (use context for selections)
  const domainB = detectDomainBias(url);
  const lexB = lexicalBias(mode === 'selection' ? contextText : text);
  const bias = combineBiasSignals(domainB, lexB);

  // Entities for better suggestions
  const entities = extractEntities(mode === 'selection' ? contextText : text);

  // Optional Snopes lookup
  const snopes = await snopesLookup({ title, text });

  // Local verdict detection for fact-checker pages when API not available
  const host = getHost(url);
  const isFactChecker = FACT_CHECKERS.has(host);
  const localVerdict = isFactChecker ? detectLocalVerdict(text) : null;

  const { suggestions, strong } = suggestSources({ text, url, title, flags, entities });
  const reliability = scoreReliability(suggestions);

  // Selection-aware scoring weights
  const len = (text || '').trim().length;
  const selection = mode === 'selection';
  // Evidence and temporal checks
  const citations = evaluateCitations({ text, meta: { linkCounts: meta.linkCounts || {} } });
  const temporal = evaluateTemporal({ text: contextText, meta: { published: meta.published || '' } });
  // If on a fact-checker domain, soften initial heuristics
  let baseInitial = initial;
  if (isFactChecker) baseInitial = Math.max(0, initial - 20);

  let final = finalScore(baseInitial, text, flags, bias.score, snopes?.result?.rating || localVerdict);
  if (selection) {
    const flagWeightAdj = len < 120 ? 2 : 3; // lighter weight for short snippets
    final = baseInitial + flags.length * flagWeightAdj + Math.max(0, (bias.score - 50) / 6);
    if (snopes?.result?.rating) {
      const v = (''+snopes.result.rating).toLowerCase();
      if (/(false|fake|debunked|incorrect)/.test(v)) final = Math.min(100, final + 20);
      if (/(true|correct)/.test(v)) final = Math.max(0, final - 12);
    }
    // Apply local verdict if present
    if (!snopes?.result && localVerdict) {
      if (/(false)/.test(localVerdict)) final = Math.min(100, final + 20);
      if (/(true)/.test(localVerdict)) final = Math.max(0, final - 12);
    }
    final = Math.max(0, Math.min(100, Math.round(final)));
  }
  // Apply citation and temporal risk adjustments (modest influence)
  final = Math.min(100, Math.max(0, Math.round(final + (citations.citationRisk || 0) * 0.15 + (temporal.temporalRisk || 0) * 0.1)));

  let notices = [];
  if (selection && len < 80) {
    notices.push('Selection is very short; results may be less reliable. Added page headline and nearby context.');
  }
  if ((citations.citationRisk || 0) >= 40) notices.push('Numeric/statistical claim lacks nearby citations; consider checking the original data source.');
  if ((temporal.temporalRisk || 0) >= 15) notices.push('Article may be dated; verify whether newer evidence contradicts this claim.');
  // Ensure missing_evidence flag appears if citation risk is high
  if ((citations.citationRisk || 0) >= 40 && !flags.includes('missing_evidence')) flags.push('missing_evidence');

  // If authoritative fact-checker indicates TRUE, cap suspicion to very low and add notice
  const titleLower = (title || '').toLowerCase();
  const ctxLower = (contextText || '').toLowerCase();
  const positiveVerdict = (snopes?.result?.rating && /true|correct/i.test(''+snopes.result.rating)) || (localVerdict === 'true')
    || (host === 'snopes.com' && (/\brating\b[^\n]{0,40}\btrue\b/.test(ctxLower) || /\btrue\b/.test(titleLower)));
  const negativeVerdict = (snopes?.result?.rating && /(false|fake|pants on fire|incorrect)/i.test(''+snopes.result.rating)) || (localVerdict === 'false')
    || (host === 'snopes.com' && /\brating\b[^\n]{0,40}\bfalse\b/.test(ctxLower));
  if (isFactChecker && positiveVerdict) {
    final = Math.min(final, randInt(1, 5));
    notices.push('Authoritative fact-check indicates TRUE; authenticity boosted.');
  }
  // Track whether domain logic has applied a cap/floor
  let domainHandled = isFactChecker && positiveVerdict ? true : false;
  // Default trust for Snopes when verdict not detected as negative
  if (host === 'snopes.com' && !negativeVerdict) {
    final = Math.min(final, randInt(1, 5));
    domainHandled = true;
    if (!positiveVerdict) notices.push('Trusted fact-check domain detected (Snopes); defaulting to high authenticity.');
  }
  if (host === 'snopes.com' && negativeVerdict) {
    final = Math.max(final, 85); // high suspicion for FALSE verdict on Snopes
    notices.push('Snopes indicates FALSE; raising suspicion.');
    domainHandled = true;
  }

  // Trusted mainstream news domains: default to high authenticity unless explicit negative verdict found
  if (!domainHandled && isHostTrusted(host) && !negativeVerdict) {
    final = Math.min(final, randInt(3, 10)); // authenticity ≥ 90%
    notices.push('Trusted major news domain detected; defaulting to high authenticity.');
    domainHandled = true;
  }

  // Domain authenticity tiers (only if no explicit negative verdict and not already handled)
  if (!negativeVerdict && !domainHandled) {
    if (hostMatches(TIER80, host)) {
      final = Math.min(final, randInt(11, 20)); // authenticity ≥ 80%
      notices.push('Tier: 80%+ Authentic domain.');
      domainHandled = true;
    } else if (hostMatches(TIER70, host)) {
      final = Math.min(final, randInt(21, 30)); // authenticity ≥ 70%
      notices.push('Tier: 70%+ Authentic domain.');
      domainHandled = true;
    } else if (hostMatches(TIER60, host)) {
      final = Math.min(final, randInt(31, 40)); // authenticity ≥ 60%
      notices.push('Tier: 60%+ Authentic domain.');
      domainHandled = true;
    } else if (hostMatches(TIER50, host)) {
      final = Math.min(final, randInt(41, 50)); // authenticity ≥ 50%
      notices.push('Tier: 50%+ Authentic domain.');
      domainHandled = true;
    }
  }
  // Default others: only apply if nothing else handled and no explicit negative verdict
  if (!negativeVerdict && !domainHandled) {
    final = Math.max(final, randInt(51, 85)); // authenticity < 50%
    notices.push('Domain not in tiers; defaulting to ≤50% authenticity.');
  }

  // If Snopes provides a verdict and we can match a sentence, add a high-severity highlight
  if (snopes?.result?.rating && snopes?.result?.title) {
    const sent = (text.split(/[.!?]/).find(s => s && snopes.result.title.toLowerCase().includes(s.trim().toLowerCase().slice(0, 60))) || '').trim();
    if (sent) {
      const idx = text.indexOf(sent);
      if (idx !== -1) {
        highlights.unshift({
          span: sent.slice(0, 240),
          start: idx,
          end: idx + sent.length,
          reason: 'misleading_context',
          explanation: `Snopes verdict: ${snopes.result.rating}. ${snopes.result.evidence || 'See linked analysis.'}`,
          category: /(false|fake|incorrect)/i.test(snopes.result.rating) ? 'proven_false' : 'missing_evidence',
          source_url: snopes.result.url || null
        });
      }
    }
  }

  return {
    initial_score: Math.round(initial),
    final_score: Math.round(final),
    model_confidence: (snopes?.result ? 0.8 : (strong ? 0.7 : 0.5)),
    flags,
    highlights,
    neutral_rewrite: generateNeutralRewrite(text),
    suggested_sources: suggestions,
    suggested_search_queries: (snopes?.result ? [] : (strong ? [] : makeSearchQueries(text))),
    action_buttons: ["Open sources","Save to history","Report","Get author details"],
    error: null,
    bias,
    entities,
    snopes: snopes || null,
    notices
  };
}

function generateNeutralRewrite(text) {
  const trimmed = text.trim().slice(0, 240);
  // Heuristic rewrite
  return ("Claim requires verification; consult reputable sources and check for cited evidence and context.").slice(0, 120);
}
