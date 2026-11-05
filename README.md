# Page Scooper

Teach any page what to collect, then copy everything together.

Page Scooper is an early Manifest V3 Chrome extension. Select a useful region on a site once, and it adds a reusable **Scoop this page** button whenever you return. Captures from multiple tabs collect inside the extension until you copy them as one organized document.

## Try it locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository folder.
5. Visit an ordinary `http` or `https` page.
6. Open Page Scooper and choose **Choose what to scoop**.
7. Click the page region you want Page Scooper to remember.

## Current scope

- One trained region per website origin
- Local-only recipe storage
- Session-only capture collection
- Combined plain-text copy with page titles and URLs
- No analytics, server, account, or uploaded page content

The current capture method reads visible rendered text. Pages that virtualize long transcripts may expose only the currently rendered portion; an auto-scroll collector is planned for a later iteration.

## Project structure

- `manifest.json` — Manifest V3 configuration and permissions
- `background.js` — saved rules, dynamic script registration, capture collection, and badge state
- `content.js` — region picker, resilient locator creation, injected scoop button, and page capture
- `popup.*` — training controls and collection interface
