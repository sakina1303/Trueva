# Trueva

A Chrome extension that analyzes news articles or selected text to highlight potential misinformation patterns, provide an authenticity score, bias meter, and reputable source suggestions.

## Features
- Dual scanning modes: full page or selection
- Authenticity score with color coding
- Bias detection meter (heuristic)
- Flagged claims with explanations
- Suggested reputable sources and search queries
- On-page highlights of suspicious spans
- Privacy-friendly: local analysis by default

## Install (Developer Mode)
1. Build not required. Open Chrome → Extensions → Enable Developer Mode.
2. Click "Load unpacked" and select the `fake-news-filter/` folder.
3. Pin the extension. Open a news page and click the icon.

## Usage
- Scan Full Page: Analyzes the article body.
- Scan Selection: Select a paragraph, then analyze only that text.
- Toggle Highlights: Show/hide underlined spans on the page.

## Architecture
- `manifest.json`: MV3 configuration
- `popup/`: UI (HTML/CSS/JS)
- `content/`: DOM extraction and highlighting
- `background/`: service worker placeholder
- `src/analyzer.js`: heuristics, flags, highlights, scoring
- `src/scoring.js`: bias meter
- `src/sources.js`: source suggestion heuristic & reliability proxy
- `src/privacy.js`: explainability panel

## Privacy
- No external requests are made by default. All analysis is local.
- Source suggestions are generic links to reputable outlets.

## Roadmap
- Integrate live fact-check APIs (Snopes, PolitiFact) with user opt-in
- Improve NLP (transformer-based classifier) and citation detection
- Add community feedback loop and trust timeline
