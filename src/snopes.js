// Snopes API integration with opt-in, caching, retries, and privacy safeguards
// We paraphrase queries and never send full article text.

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return settings;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

async function getCache(key) {
  const { snopesCache = {} } = await chrome.storage.local.get('snopesCache');
  const entry = snopesCache[key];
  if (!entry) return null;
  const maxAgeMs = 1000 * 60 * 60 * 24; // 24h
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.value;
}

async function setCache(key, value) {
  const data = await chrome.storage.local.get('snopesCache');
  const snopesCache = data.snopesCache || {};
  snopesCache[key] = { ts: Date.now(), value };
  await chrome.storage.local.set({ snopesCache });
}

function hash(str) {
  let h = 0; for (let i=0;i<str.length;i++) { h = (h<<5) - h + str.charCodeAt(i); h |= 0; }
  return 'h' + (h >>> 0).toString(16);
}

function buildQuery({ title, text }) {
  const t = (title || '').trim();
  if (t) return t.slice(0, 140);
  // fallback: first sentence of text, paraphrased by truncation
  const first = (text || '').split(/[.!?]/).find(Boolean) || '';
  return first.slice(0, 140);
}

async function fetchSnopes(query, base, key) {
  // Generic GET; adjust to actual API as needed
  const url = new URL(base);
  url.searchParams.set('q', query);
  const headers = { 'Accept': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Snopes HTTP ${res.status}`);
  return res.json();
}

function normalizeResult(json) {
  // Try to map to {rating, evidence, url, title}
  // We attempt several likely shapes.
  const item = Array.isArray(json?.results) ? json.results[0] : json?.result || json;
  if (!item) return null;
  const rating = item.rating || item.verdict || item.claimRating || null;
  const evidence = item.evidence || item.summary || item.excerpt || null;
  const url = item.url || item.link || null;
  const title = item.title || item.headline || null;
  if (!rating && !url && !title) return null;
  return { rating, evidence, url, title };
}

export async function snopesLookup({ title, text }) {
  const settings = await getSettings();
  if (!settings.snopesOptIn) return { used: false, result: null, error: null };
  if (!isOnline()) return { used: true, result: null, error: 'offline' };
  const query = buildQuery({ title, text });
  const cacheKey = hash(query + (settings.snopesApiBase || ''));
  const cached = await getCache(cacheKey);
  if (cached) return { used: true, result: cached, error: null, cached: true };

  const base = settings.snopesApiBase || 'https://api.snopes.com/fact-check';
  const key = settings.snopesApiKey || '';

  let lastError = null;
  for (let attempt=0; attempt<2; attempt++) {
    try {
      const json = await fetchSnopes(query, base, key);
      const norm = normalizeResult(json);
      if (norm) {
        await setCache(cacheKey, norm);
        return { used: true, result: norm, error: null, cached: false };
      }
      lastError = new Error('No actionable result');
    } catch (e) {
      lastError = e;
      await sleep(300 * (attempt + 1));
    }
  }
  return { used: true, result: null, error: lastError?.message || 'Unknown Snopes error' };
}
