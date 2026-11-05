(function exposePageScooperUtils(globalObject) {
  function extractTimestampRange(value) {
    const text = String(value || "");
    const lines = text.split(/\r?\n/);
    const lineStartPattern = /^\s*[\[(]?\s*((?:\d{1,2}:)?\d{1,3}:\d{2})(?![\d:])/;
    let timestamps = lines
      .map((line) => line.match(lineStartPattern)?.[1])
      .filter(Boolean)
      .map(toTimestamp)
      .filter(Boolean);

    // Some sites flatten transcript rows onto one line. Fall back to every
    // timestamp-shaped value only when line starts did not provide a range.
    if (timestamps.length < 2) {
      const allPattern = /(^|[^\d:])((?:\d{1,2}:)?\d{1,3}:\d{2})(?![\d:])/g;
      timestamps = [...text.matchAll(allPattern)]
        .map((match) => toTimestamp(match[2]))
        .filter(Boolean);
    }

    if (timestamps.length < 2) return null;
    return {
      start: timestamps[0].label,
      end: timestamps[timestamps.length - 1].label
    };
  }

  function toTimestamp(label) {
    const parts = label.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      if (seconds >= 60) return null;
      return { label, seconds: minutes * 60 + seconds };
    }

    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      if (minutes >= 60 || seconds >= 60) return null;
      return { label, seconds: hours * 3600 + minutes * 60 + seconds };
    }

    return null;
  }

  const api = Object.freeze({ extractTimestampRange });
  globalObject.PageScooperUtils = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
