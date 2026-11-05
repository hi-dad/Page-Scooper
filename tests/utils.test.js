const test = require("node:test");
const assert = require("node:assert/strict");
const { extractTimestampRange } = require("../utils.js");

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
