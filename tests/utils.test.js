const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateStickyPosition,
  canRunRecipeAutomatically,
  createPageScope,
  extractTimestampRange,
  matchesPageScope,
  removeTranscriptTimestamps
} = require("../utils.js");

test("finds a transcript range from timestamps at the start of lines", () => {
  const transcript = `
0:03
Welcome to the lecture.
0:15
We will meet at 12:30 tomorrow.
12:41
Thanks for watching.
  `;

  assert.deepEqual(extractTimestampRange(transcript), {
    start: "0:03",
    end: "12:41"
  });
});

test("supports hour-long transcripts", () => {
  assert.deepEqual(extractTimestampRange("0:00:12\nIntro\n1:04:09\nClosing"), {
    start: "0:00:12",
    end: "1:04:09"
  });
});

test("falls back to timestamps in flattened transcript text", () => {
  assert.deepEqual(extractTimestampRange("0:00 Welcome 0:35 First topic 2:17 Closing"), {
    start: "0:00",
    end: "2:17"
  });
});

test("returns null when no credible range exists", () => {
  assert.equal(extractTimestampRange("A page with no transcript timestamps."), null);
  assert.equal(extractTimestampRange("Only one time: 2:15"), null);
});

test("removes only timestamps at the beginning of transcript rows", () => {
  const transcript = `0:03 - Welcome to class.
[0:15] We will meet at 12:30 tomorrow.
(1:04:09) — Closing remarks.`;

  assert.equal(
    removeTranscriptTimestamps(transcript),
    "Welcome to class.\nWe will meet at 12:30 tomorrow.\nClosing remarks."
  );
});

test("keeps useful spacing when timestamps occupy their own rows", () => {
  assert.equal(
    removeTranscriptTimestamps("0:00\nFirst paragraph\n0:10\nSecond paragraph"),
    "First paragraph\n\nSecond paragraph"
  );
});

test("removes duplicate spoken accessibility timestamps", () => {
  const transcript = `0:16
16 seconds
First line.
1:08
1 minute, 8 seconds
Second line.`;

  assert.equal(
    removeTranscriptTimestamps(transcript),
    "First line.\n\nSecond line."
  );
});

test("does not remove spoken duration text that does not match the timestamp", () => {
  assert.equal(
    removeTranscriptTimestamps("0:16\nTen seconds is not enough."),
    "Ten seconds is not enough."
  );
});

test("creates a reusable scope for video and course pages", () => {
  assert.deepEqual(
    createPageScope("similar", "https://www.youtube.com/watch?v=abc"),
    { type: "path", value: "/watch" }
  );
  assert.deepEqual(
    createPageScope("similar", "https://school.example/courses/42/pages/lecture-one"),
    { type: "path-prefix", value: "/courses/42/pages/" }
  );
});

test("matches similar pages without matching unrelated site areas", () => {
  const scope = createPageScope("similar", "https://www.youtube.com/watch?v=abc");
  assert.equal(matchesPageScope("https://www.youtube.com", scope, "https://www.youtube.com/watch?v=xyz"), true);
  assert.equal(matchesPageScope("https://www.youtube.com", scope, "https://www.youtube.com/"), false);
  assert.equal(matchesPageScope("https://www.youtube.com", scope, "https://example.com/watch?v=xyz"), false);
});

test("anchors a button to the visible portion of a scrolled transcript", () => {
  const viewport = { top: 0, right: 1200, bottom: 800, left: 0 };
  const clip = { top: 300, right: 1000, bottom: 760, left: 100 };
  const button = { width: 180, height: 40 };

  assert.deepEqual(
    calculateStickyPosition(
      { top: -500, right: 980, bottom: 1500, left: 120 },
      [clip],
      viewport,
      button
    ),
    { left: 788, top: 312 }
  );

  assert.deepEqual(
    calculateStickyPosition(
      { top: -900, right: 980, bottom: 1100, left: 120 },
      [clip],
      viewport,
      button
    ),
    { left: 788, top: 312 }
  );
});

test("hides a sticky button when its selected content is fully clipped", () => {
  assert.equal(
    calculateStickyPosition(
      { top: -500, right: 500, bottom: -100, left: 100 },
      [],
      { top: 0, right: 1200, bottom: 800, left: 0 },
      { width: 180, height: 40 }
    ),
    null
  );
});

test("allows automatic clicks only for page-type-scoped recipes", () => {
  const baseRule = { autoOpen: true, openerSteps: [{ locator: {} }] };
  assert.equal(canRunRecipeAutomatically({ ...baseRule, scope: { type: "path", value: "/watch" } }), true);
  assert.equal(canRunRecipeAutomatically({ ...baseRule, scope: { type: "path-prefix", value: "/courses/" } }), true);
  assert.equal(canRunRecipeAutomatically({ ...baseRule, scope: { type: "origin" } }), false);
  assert.equal(canRunRecipeAutomatically({ ...baseRule, scope: null }), false);
});
