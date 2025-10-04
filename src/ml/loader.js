// Lightweight deterministic ML (logistic models) without external libs.
// Keeps rule-based pipeline primary. Provides bounded signals.

let modelsReady = false;

export async function ensureModelsLoaded() {
  // No heavy model files; initialize once.
  modelsReady = true;
}

function sigmoid(x) {
  // Numerically stable
  if (x >= 0) { const z = Math.exp(-x); return 1 / (1 + z); }
  const z = Math.exp(x); return z / (1 + z);
}

function tokenize(t) {
  return (t || '').trim().split(/\s+/).filter(Boolean);
}

// Claim-likeness features per sentence
function featuresClaim(s) {
  const text = s || '';
  const low = text.toLowerCase();
  const toks = tokenize(text);
  const len = text.length;
  const lenNorm = Math.min(1, len / 220);
  const numPresent = /\d/.test(text) ? 1 : 0;
  const verbs = (low.match(/\b(is|are|was|were|has|have|had|says|said|claims?|reports?|states?|announced|confirms?)\b/g) || []).length;
  const verbRatio = toks.length ? Math.min(1, verbs / Math.max(5, toks.length)) : 0;
  const modal = /\b(will|would|should|could|may|might|can|cannot)\b/i.test(low) ? 1 : 0;
  const cites = /\b(according to|as per|data shows|study finds|report (?:by|says))\b/i.test(low) ? 1 : 0;
  return { lenNorm, numPresent, verbRatio, modal, cites };
}

// Sensational tone features (document-level)
function featuresSensational(t) {
  const text = t || '';
  const low = text.toLowerCase();
  const toks = tokenize(text);
  const sensHits = (low.match(/\b(shocking|explosive|unbelievable|cover-?up|outrage|betrayal|exposed|disaster|meltdown|scandal|guaranteed|miracle)\b/g) || []).length;
  const excl = (text.match(/!/g) || []).length;
  const capsTokens = toks.filter(w => /[A-Z]{4,}/.test(w) && !/\d/.test(w)).length;
  const capRatio = toks.length ? Math.min(1, capsTokens / toks.length) : 0;
  const superl = (low.match(/\b(always|never|everyone|no one|worst|best|ultimate)\b/g) || []).length;
  return { sensHits, excl, capRatio, superl };
}

// Returns an array of floats [0..1] per input sentence indicating claim-likeness (logistic model)
export async function predictClaimLikeness(sentences) {
  if (!modelsReady || !Array.isArray(sentences) || sentences.length === 0) return null;
  // Learned-like weights (hand-tuned):
  // score = sigmoid(b + w1*len + w2*num + w3*verbRatio + w4*modal + w5*cites)
  const b = -1.0, w1 = 1.2, w2 = 1.0, w3 = 2.0, w4 = 0.6, w5 = 1.4;
  return sentences.map(s => {
    const f = featuresClaim(s);
    const z = b + w1*f.lenNorm + w2*f.numPresent + w3*f.verbRatio + w4*f.modal + w5*f.cites;
    return Math.max(0, Math.min(1, sigmoid(z)));
  });
}

// Returns an array of floats [0..1] per input (here single string) for sensational tone (logistic model)
export async function predictSensational(texts) {
  if (!modelsReady || !Array.isArray(texts) || texts.length === 0) return null;
  // score = sigmoid(b + w1*sensHits + w2*excl + w3*capRatio + w4*superl)
  const b = -2.0, w1 = 0.6, w2 = 0.25, w3 = 3.0, w4 = 0.35;
  return texts.map(t => {
    const f = featuresSensational(t);
    const z = b + w1*f.sensHits + w2*f.excl + w3*f.capRatio + w4*f.superl;
    return Math.max(0, Math.min(1, sigmoid(z)));
  });
}
