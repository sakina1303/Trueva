export function detectBias(text) {
  const leftLex = [/\bclimate justice\b/i, /\bsocial equity\b/i, /\bprogressive\b/i, /\bredistribution\b/i];
  const rightLex = [/\btax cuts\b/i, /\bborder security\b/i, /\bpatriot\b/i, /\bwoke\b/i];
  let left = 0, right = 0;
  for (const r of leftLex) if (r.test(text)) left += 10;
  for (const r of rightLex) if (r.test(text)) right += 10;
  let label = 'Neutral';
  let score = 50;
  if (left > right) { label = 'Leaning Left'; score = 40 + left; }
  if (right > left) { label = 'Leaning Right'; score = 60 + right; }
  score = Math.max(0, Math.min(100, score));
  return { label, score };
}

export function lexicalBias(text) {
  const res = detectBias(text);
  return { score: res.score, label: res.label, confidence: 0.5 };
}
