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

  function removeTranscriptTimestamps(value) {
    const cleanedLines = [];
    let pendingTimestampSeconds = null;

    for (const line of String(value || "").split(/\r?\n/)) {
      const timestampMatch = line.match(
        /^\s*[\[(]?\s*((?:\d{1,2}:)?\d{1,3}:\d{2})\s*[\])]?\s*(?:[-–—]\s*)?/
      );

      if (timestampMatch) {
        const timestamp = toTimestamp(timestampMatch[1]);
        const remainder = line.slice(timestampMatch[0].length);
        pendingTimestampSeconds = timestamp?.seconds ?? null;

        if (
          pendingTimestampSeconds !== null
          && parseSpokenDuration(remainder) === pendingTimestampSeconds
        ) {
          cleanedLines.push("");
          pendingTimestampSeconds = null;
        } else {
          cleanedLines.push(remainder);
          if (remainder.trim()) pendingTimestampSeconds = null;
        }
        continue;
      }

      if (
        pendingTimestampSeconds !== null
        && parseSpokenDuration(line) === pendingTimestampSeconds
      ) {
        pendingTimestampSeconds = null;
        continue;
      }

      if (line.trim()) pendingTimestampSeconds = null;
      cleanedLines.push(line);
    }

    return cleanedLines
      .join("\n")
      .replace(/^\n+|\n+$/g, "")
      .replace(/\n{3,}/g, "\n\n");
  }

  function parseSpokenDuration(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return null;

    let totalSeconds = 0;
    let matchCount = 0;
    const unitPattern = /(\d+)\s*(hours?|minutes?|seconds?)/g;
    for (const match of text.matchAll(unitPattern)) {
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit.startsWith("hour")) totalSeconds += amount * 3600;
      if (unit.startsWith("minute")) totalSeconds += amount * 60;
      if (unit.startsWith("second")) totalSeconds += amount;
      matchCount += 1;
    }

    const leftover = text.replace(unitPattern, "").replace(/[\s,&]+/g, "");
    return matchCount && !leftover ? totalSeconds : null;
  }

  function createPageScope(type, value) {
    const url = value instanceof URL ? value : new URL(value);
    if (type === "origin") return { type: "origin" };
    if (type === "exact") {
      return { type: "exact", value: `${url.origin}${url.pathname}${url.search}` };
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length <= 1) {
      return { type: "path", value: url.pathname || "/" };
    }
    return {
      type: "path-prefix",
      value: `/${segments.slice(0, -1).join("/")}/`
    };
  }

  function matchesPageScope(ruleOrigin, scope, value) {
    const url = value instanceof URL ? value : new URL(value);
    if (ruleOrigin !== url.origin) return false;
    if (!scope || scope.type === "origin") return true;
    if (scope.type === "exact") {
      return `${url.origin}${url.pathname}${url.search}` === scope.value;
    }
    if (scope.type === "path") return url.pathname === scope.value;
    if (scope.type === "path-prefix") return url.pathname.startsWith(scope.value);
    return true;
  }

  const api = Object.freeze({
    createPageScope,
    extractTimestampRange,
    matchesPageScope,
    removeTranscriptTimestamps
  });
  globalObject.PageScooperUtils = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
