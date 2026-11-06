const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
