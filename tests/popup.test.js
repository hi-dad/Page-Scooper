const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const script = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("popup uses transcript-focused product language", () => {
  assert.match(html, /Searching for transcripts\?/);
  assert.match(html, />TRANSCRIPTS</);
  assert.match(script, /LIVE ON THIS SITE/);
  assert.match(script, /Auto-click setup: active/);
  assert.match(script, /Looks for the selected webpage component on every page at/);
});

test("help and saved sites open inside the popup", () => {
  assert.match(html, /id="main-view"/);
  assert.match(html, /id="help-view"[^>]*hidden/);
  assert.match(html, /id="back-button"/);
  assert.doesNotMatch(script, /openOptionsPage/);
  assert.match(script, /mainView\.hidden = true/);
  assert.match(script, /helpView\.hidden = false/);
});

test("popup explains safe automatic click behavior", () => {
  assert.match(script, /Saving clicks across the whole site is disabled to prevent unwanted clicks/);
  assert.match(html, /Similar pages<\/strong> is recommended/);
});
