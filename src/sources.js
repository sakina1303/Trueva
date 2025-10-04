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

export function suggestSources({ text, url, title, flags, entities = {} }) {
  // Generate site search links with paraphrased keywords and entities
  const baseKws = extractKeywords(title || text);
  const entityKws = (entities.keywords || []).slice(0,4);
  const mix = Array.from(new Set([...entityKws, ...baseKws])).slice(0,4);
  const q = encodeURIComponent(mix.join(' '));
  const suggestions = [
    {
      title: `Reuters coverage: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://www.reuters.com/site-search/?query=${q}`,
      reliability_score: 90,
      reason: 'High-authority newsroom; HTTPS; transparent masthead; corroborates with primary sources',
      evidence_snippet: null,
      type: 'secondary'
    },
    {
      title: `AP News coverage: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://apnews.com/search?q=${q}`,
      reliability_score: 90,
      reason: 'Authoritative wire service; cites primary statements; HTTPS',
      evidence_snippet: null,
      type: 'secondary'
    },
    {
      title: `Snopes fact checks: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://www.snopes.com/search/?q=${q}`,
      reliability_score: 92,
      reason: 'Recognized fact-checker; links to primary evidence; HTTPS',
      evidence_snippet: null,
      type: 'secondary'
    }
  ];
  const topics = new Set(entities.topics || []);
  if (topics.has('politics')) {
    suggestions.push({
      title: `PolitiFact checks: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://www.politifact.com/search/?q=${q}`,
      reliability_score: 90,
      reason: 'Recognized political fact-checker; cites primary sources; HTTPS',
      evidence_snippet: null,
      type: 'secondary'
    });
  }
  if (topics.has('health')) {
    suggestions.push({
      title: `WHO info: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://www.who.int/search?q=${q}`,
      reliability_score: 92,
      reason: 'Authoritative health guidance; primary reports; HTTPS',
      evidence_snippet: null,
      type: 'secondary'
    });
    suggestions.push({
      title: `PubMed studies: ${mix.slice(0,3).join(' ') || 'topic'}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${q}`,
      reliability_score: 93,
      reason: 'Peer-reviewed literature index; links to DOIs; HTTPS',
      evidence_snippet: null,
      type: 'primary'
    });
  }
  const strong = false; // no live corroboration locally
  return { suggestions, strong };
}

export function scoreReliability(suggestions) {
  // Average suggested source reliability as a proxy
  if (!suggestions || !suggestions.length) return 50;
  const avg = suggestions.reduce((a,b)=>a + (b.reliability_score||0), 0) / suggestions.length;
  return Math.round(avg);
}
