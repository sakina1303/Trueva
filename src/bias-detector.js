// Domain-based bias detector inspired by AllSides-like mappings (simplified)
// Combines domain leaning with lexical bias for a composite score.

const DOMAIN_BIAS_MAP = {
  // Left
  'cnn.com': { label: 'Left', score: 35 },
  'nytimes.com': { label: 'Left', score: 40 },
  'theguardian.com': { label: 'Left', score: 40 },
  // Right
  'foxnews.com': { label: 'Right', score: 65 },
  'dailywire.com': { label: 'Right', score: 65 },
  'nationalreview.com': { label: 'Right', score: 60 },
  // Center
  'reuters.com': { label: 'Center', score: 50 },
  'apnews.com': { label: 'Center', score: 50 },
  'bbc.com': { label: 'Center', score: 50 }
};

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; }
}

export function detectDomainBias(url) {
  const host = getDomain(url);
  const entry = DOMAIN_BIAS_MAP[host];
  if (!entry) return { label: 'Unknown', score: 50, confidence: 0.3, evidence: host || 'unknown' };
  return { label: entry.label, score: entry.score, confidence: 0.8, evidence: host };
}

export function combineBiasSignals(domainBias, lexicalBias) {
  // Combine with weighted average; domain gets higher weight if known
  const dw = domainBias && domainBias.confidence > 0.5 ? 0.6 : 0.3;
  const lw = 1 - dw;
  const composite = Math.round(dw * domainBias.score + lw * lexicalBias.score);
  let label = 'Neutral';
  if (composite < 47) label = 'Leaning Left';
  else if (composite > 53) label = 'Leaning Right';
  else label = 'Center';
  const confidence = Math.min(1, (domainBias.confidence * dw + 0.6 * lw));
  const evidence = `Domain: ${domainBias.evidence}; Lexical score: ${lexicalBias.score}`;
  return { label, score: composite, confidence, evidence };
}
