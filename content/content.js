let highlights = [];
let highlightsVisible = true;

function getArticleText() {
  // Try common article containers
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.article-body',
    '.story-body',
    '.post-content',
    'body'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el.innerText.trim();
  }
  return document.body.innerText.trim();
}

function getSelectionText() {
  const sel = window.getSelection();
  return sel && sel.toString().trim();
}

function clearHighlights() {
  highlights.forEach(h => {
    const el = h.element;
    if (!el) return;
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
  highlights = [];
}

function applyHighlights(items) {
  clearHighlights();
  if (!items || !items.length) return;

  const bodyText = document.body.innerText;
  items.forEach(item => {
    const spanText = item.span;
    if (!spanText) return;
    // naive highlight: find first occurrence of spanText
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(spanText);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + spanText.length);
        const mark = document.createElement('mark');
        mark.className = 'fnf-highlight';
        range.surroundContents(mark);
        highlights.push({ element: mark });
        break;
      }
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCAN_PAGE') {
    sendResponse({ text: getArticleText(), meta: { type: 'page' } });
  }
  if (msg.type === 'SCAN_SELECTION') {
    sendResponse({ text: getSelectionText() || '', meta: { type: 'selection' } });
  }
  if (msg.type === 'APPLY_HIGHLIGHTS') {
    applyHighlights(msg.highlights || []);
  }
  if (msg.type === 'TOGGLE_HIGHLIGHTS') {
    highlightsVisible = !!msg.visible;
    document.documentElement.classList.toggle('fnf-hide-highlights', !highlightsVisible);
  }
});
