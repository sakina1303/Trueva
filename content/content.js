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

function getHeadline() {
  const h1 = document.querySelector('article h1, h1');
  if (h1 && h1.textContent.trim()) return h1.textContent.trim();
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (og) return og.trim();
  return document.title || '';
}

function getDescription() {
  const md = document.querySelector('meta[name="description"]')?.getAttribute('content');
  const ogd = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
  return (md || ogd || '').trim();
}

function getPublishDate() {
  const candidates = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="date"]',
    'time[datetime]'
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    const val = el?.getAttribute('content') || el?.getAttribute('datetime') || el?.textContent;
    if (val && val.trim()) return val.trim();
  }
  return '';
}

function countLinksIn(el) {
  try { return (el && el.querySelectorAll) ? el.querySelectorAll('a[href]').length : 0; } catch { return 0; }
}

function getSelectionText() {
  const sel = window.getSelection();
  return sel && sel.toString().trim();
}

function getSelectionContext() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { headline: getHeadline(), description: getDescription() };
  const range = sel.getRangeAt(0);
  let node = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const block = node.closest('p, div, section, article') || node;
  const before = block.previousElementSibling && block.previousElementSibling.innerText ? block.previousElementSibling.innerText.trim() : '';
  const after = block.nextElementSibling && block.nextElementSibling.innerText ? block.nextElementSibling.innerText.trim() : '';
  return {
    headline: getHeadline(),
    description: getDescription(),
    published: getPublishDate(),
    surrounding: {
      before: before.slice(0, 400),
      after: after.slice(0, 400)
    },
    linkCounts: {
      block: countLinksIn(block),
      before: countLinksIn(block.previousElementSibling),
      after: countLinksIn(block.nextElementSibling)
    }
  };
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

function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function classForCategory(cat) {
  if (cat === 'proven_false') return 'fnf-red';
  if (cat === 'language_bias') return 'fnf-yellow';
  if (cat === 'missing_evidence') return 'fnf-blue';
  return 'fnf-yellow';
}

function applyHighlights(items) {
  clearHighlights();
  if (!items || !items.length) return;
  // Walk all text nodes and apply every occurrence for each item.span
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      const tag = node.parentElement.tagName;
      if (['SCRIPT','STYLE','NOSCRIPT'].includes(tag)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  items.forEach(item => {
    const spanText = (item.span || '').trim();
    if (!spanText) return;
    const catClass = classForCategory(item.category);
    textNodes.forEach(node => {
      let searchFrom = 0;
      while (true) {
        const idx = node.nodeValue.indexOf(spanText, searchFrom);
        if (idx === -1) break;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + spanText.length);
        const mark = document.createElement('mark');
        mark.className = `fnf-highlight ${catClass}`;
        mark.title = item.reason + (item.explanation ? ` — ${item.explanation}` : '');
        range.surroundContents(mark);
        highlights.push({ element: mark });
        // Advance after this mark
        searchFrom = idx + spanText.length;
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCAN_PAGE') {
    const artEl = document.querySelector('article') || document.querySelector('main') || document.body;
    sendResponse({ text: getArticleText(), meta: { type: 'page', headline: getHeadline(), description: getDescription(), published: getPublishDate(), linkCounts: { article: countLinksIn(artEl) } } });
  }
  if (msg.type === 'SCAN_SELECTION') {
    sendResponse({ text: getSelectionText() || '', meta: { type: 'selection', ...getSelectionContext() } });
  }
  if (msg.type === 'APPLY_HIGHLIGHTS') {
    applyHighlights(msg.highlights || []);
  }
  if (msg.type === 'TOGGLE_HIGHLIGHTS') {
    highlightsVisible = !!msg.visible;
    document.documentElement.classList.toggle('fnf-hide-highlights', !highlightsVisible);
  }
});
