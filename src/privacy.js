export function renderExplainability(output) {
  const bullets = [
    `Initial quick score: ${output.initial_score}/100`,
    `Final score after flags/bias: ${output.final_score}/100 (confidence ${output.model_confidence})`,
    `${(output.flags||[]).length} patterns flagged`,
    `No raw text shared externally; suggestions are local heuristics.`
  ];
  const feature = '<div style="margin-top:6px;color:#6b7280;font-size:12px">Explainability panel shows claim spans, counter-evidence hints, and confidence.</div>';
  return `<h3>Explainability</h3><ul>${bullets.map(b=>`<li>${b}</li>`).join('')}</ul>${feature}`;
}
