// Citation and temporal checks to improve accuracy

function containsNumericClaim(text) {
  return /(\b\d{1,3}(,\d{3})*(\.\d+)?%?\b)/.test(text) || /\b(doubled|tripled|all-time high|record)\b/i.test(text);
}

export function evaluateCitations({ text = '', meta = {} }) {
  const hasNumbers = containsNumericClaim(text);
  const lc = meta.linkCounts || {};
  const nearby = Math.max(0, lc.block || 0) + Math.max(0, lc.before || 0) + Math.max(0, lc.after || 0);
  const articleLinks = Math.max(0, lc.article || 0);
  let risk = 0;
  const notes = [];
  if (hasNumbers && nearby === 0) { risk += 40; notes.push('Numeric/statistical claim without nearby citations.'); }
  if (hasNumbers && articleLinks < 3) { risk += 20; notes.push('Low number of links in article for numerical claims.'); }
  if (!hasNumbers && nearby === 0 && articleLinks === 0) { risk += 10; notes.push('No citations detected near the selection or in article.'); }
  risk = Math.max(0, Math.min(100, risk));
  return { hasNumbers, nearbyLinks: nearby, articleLinks, citationRisk: risk, notes };
}

function parseDateMaybe(s) {
  try { const d = new Date(s); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

export function evaluateTemporal({ text = '', meta = {} }) {
  const publishedStr = meta.published || '';
  const published = parseDateMaybe(publishedStr);
  const notes = [];
  let risk = 0;
  if (published) {
    const now = new Date();
    const ageDays = (now - published) / (1000*60*60*24);
    if (ageDays > 365 * 3) { risk += 15; notes.push('Article appears older than 3 years; check for updated evidence.'); }
  }
  // Detect explicit years in text and compare
  const years = Array.from(text.matchAll(/\b(19|20)\d{2}\b/g)).map(m => parseInt(m[0],10));
  if (years.length) {
    const maxYear = Math.max(...years);
    if (published && maxYear < published.getFullYear() - 5) {
      risk += 10; notes.push('Claim references much older events than publish date; context may be outdated.');
    }
  }
  risk = Math.max(0, Math.min(100, risk));
  return { temporalRisk: risk, notes };
}
