// Lightweight rule-based entity & topic extractor
// Extracts people, organizations, locations, and topics for better source suggestions.

const COUNTRIES = ['united states','china','india','russia','uk','united kingdom','germany','france','japan','canada','brazil'];
const POLITICS_KWS = ['election','parliament','senate','congress','policy','campaign','president','prime minister','vote','democrat','republican','conservative','labour'];
const HEALTH_KWS = ['vaccine','virus','covid','cancer','flu','disease','who','cdc','therapy','study','trial'];
const ECON_KWS = ['inflation','gdp','unemployment','stocks','market','economy','trade','tariffs'];
const TECH_KWS = ['ai','artificial intelligence','chip','semiconductor','software','algorithm','cyber','data','privacy'];

function topK(arr, k = 5) {
  const counts = new Map();
  for (const a of arr) counts.set(a, (counts.get(a) || 0) + 1);
  return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([w])=>w);
}

export function extractEntities(text) {
  if (!text) return { people: [], orgs: [], locations: [], topics: [], keywords: [] };
  const tokens = text.split(/\s+/).filter(Boolean);
  const people = [];
  const orgs = [];
  const locations = [];
  const keywords = [];

  // Simple capitalized sequences as names/orgs
  const nameRe = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;
  let m;
  const seen = new Set();
  while ((m = nameRe.exec(text)) !== null) {
    const cand = m[1];
    if (seen.has(cand)) continue;
    seen.add(cand);
    // Heuristic: if followed by Inc/Corp/Party, classify as org
    const after = text.slice(m.index + cand.length, m.index + cand.length + 20).toLowerCase();
    if (/\b(inc|corp|company|party|committee|foundation)\b/.test(after)) orgs.push(cand);
    else people.push(cand);
  }

  // Locations
  const low = text.toLowerCase();
  for (const c of COUNTRIES) if (low.includes(c)) locations.push(c);

  // Topics
  const topics = [];
  const has = (lst) => lst.some(k => low.includes(k));
  if (has(POLITICS_KWS)) topics.push('politics');
  if (has(HEALTH_KWS)) topics.push('health');
  if (has(ECON_KWS)) topics.push('economy');
  if (has(TECH_KWS)) topics.push('technology');

  // Keywords: top frequent non-stopwords
  const cleaned = low.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>3);
  const stop = new Set(['this','that','with','from','they','have','will','would','could','should','about','there','their','which','were','been','into','after','before','because','while','however','therefore','said','says','also','more','over']);
  const kw = cleaned.filter(w=>!stop.has(w));
  const topKeywords = topK(kw, 8);

  return {
    people: topK(people, 5),
    orgs: topK(orgs, 5),
    locations: topK(locations, 5),
    topics: Array.from(new Set(topics)),
    keywords: topKeywords
  };
}
