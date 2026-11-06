# Page Scooper

Searching for transcripts? Teach a page once. Scoop anytime.

Page Scooper is an early Manifest V3 Chrome extension for transcripts. Select a transcript region on a site once, and it adds a reusable **Scoop this page** button whenever you return. Transcripts from multiple tabs collect inside the extension until you copy them as one organized document.

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
- Transcript timestamp ranges when the captured text contains recognizable timestamps
- Rebinding on single-page-app navigation, including sites that switch videos without reloading
- Optional clean-copy mode that removes transcript timestamps without discarding the original capture
- Recorded multi-step opening workflows, with manual replay or automatic opening
- Similar-page and entire-site recipe scopes
- A Scoop button that stays anchored to the visible part of nested, scrollable content
- Axis-aware clipping and a viewport fallback so valid Scoop buttons remain reachable
- An in-popup help view with every saved transcript setup
- No analytics, server, account, or uploaded page content

The current capture method reads visible rendered text. Pages that virtualize long transcripts may expose only the currently rendered portion; an auto-scroll collector is planned for a later iteration.

## Auto-click setup

If content is hidden behind controls such as **Description → Show transcript**, open a page where the content is still closed and choose **Record clicks** in Page Scooper. Click each page control in order, then choose **Done** in the floating recorder. You can replay the workflow with **Run now** or enable **Run clicks on page load** for matching pages.

Page Scooper fingerprints controls using stable IDs, accessibility labels, classes, and page structure—not their displayed text. A video-specific title can therefore work when the same structural element exists on other videos, although choosing a consistent control is still the most reliable approach.

For safety, recorded clicks can run automatically only on **Similar pages**. A recipe scoped to **Every page on this website** may still find its saved region site-wide, but its recorded clicks must be run manually.

Synthetic clicks work with ordinary page controls. Sites may still require manual interaction when controls live in inaccessible cross-origin frames or explicitly reject scripted clicks.

## Project structure

- `manifest.json` — Manifest V3 configuration and permissions
- `background.js` — saved rules, dynamic script registration, capture collection, and badge state
- `content.js` — region picker, resilient locator creation, injected scoop button, and page capture
- `popup.*` — training controls and collection interface

## Testing

Run the complete validation suite with:

```sh
npm run check
```

The sticky-button matrix tests top, middle, bottom, initially offset, nested, and horizontal scroll positions. GitHub Actions runs the same validation on every push and pull request so a failing button-visibility invariant is reported before merge. Enable branch protection if you also want GitHub to block merging when that check fails.
