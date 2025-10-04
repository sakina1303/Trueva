const AUTH_SOURCES = [
  { title: 'Reuters', base: 'https://www.reuters.com', bonus: 30 },
  { title: 'AP News', base: 'https://apnews.com', bonus: 30 },
  { title: 'BBC News', base: 'https://www.bbc.com', bonus: 30 },
  { title: 'Snopes', base: 'https://www.snopes.com', bonus: 30 },
  { title: 'PolitiFact', base: 'https://www.politifact.com', bonus: 30 },
  { title: 'WHO', base: 'https://www.who.int', bonus: 30 },
  { title: 'PubMed', base: 'https://pubmed.ncbi.nlm.nih.gov', bonus: 30 }
];

function extractKeywords(text) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3);
  const stop = new Set(['this','that','with','from','they','have','will','would','could','should','about','there','their','which','were','been','into','after','before','because','while','however','therefore']);
  const counts = new Map();
  for (const w of words) if (!stop.has(w)) counts.set(w, (counts.get(w)||0)+1);
  return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([w])=>w);
}

export function makeSearchQueries(text) {
  const kws = extractKeywords(text);
  const q = kws.slice(0,4).join(' ');
  return [
    `${q} site:reuters.com OR site:apnews.com OR site:bbc.com`,
    `${q} site:snopes.com OR site:politifact.com`
  ];
}

export function suggestSources({ text, url, title, flags }) {
  // Local suggestion heuristic: we cannot fetch; propose reputable sources and paraphrased queries
  const kws = extractKeywords(title || text).slice(0,4).join(' ');
  const suggestions = AUTH_SOURCES.slice(0,3).map(s => ({
    title: `${s.title} coverage related to: ${kws || 'topic'}`,
    url: s.base,
    reliability_score: 80 + s.bonus / 3,
    reason: 'Authoritative outlet; encourages cross-corroboration; HTTPS and transparent masthead',
    evidence_snippet: null,
    type: 'secondary'
  }));
  const strong = false; // no live corroboration locally
  return { suggestions, strong };
}

export function scoreReliability(suggestions) {
  // Average suggested source reliability as a proxy
  if (!suggestions || !suggestions.length) return 50;
  const avg = suggestions.reduce((a,b)=>a + (b.reliability_score||0), 0) / suggestions.length;
  return Math.round(avg);
}
