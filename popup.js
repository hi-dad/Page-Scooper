const teachButton = document.querySelector("#teach-button");
const forgetButton = document.querySelector("#forget-button");
const clearButton = document.querySelector("#clear-button");
const copyButton = document.querySelector("#copy-button");
const siteStatus = document.querySelector("#site-status");
const captureCount = document.querySelector("#capture-count");
const captureLabel = document.querySelector("#capture-label");
const captureList = document.querySelector("#capture-list");
const message = document.querySelector("#message");
const ruleSettings = document.querySelector("#rule-settings");
const scopeSelect = document.querySelector("#scope-select");
const stepsStatus = document.querySelector("#steps-status");
const recordStepsButton = document.querySelector("#record-steps-button");
const runStepsButton = document.querySelector("#run-steps-button");
const clearStepsButton = document.querySelector("#clear-steps-button");
const autoOpenToggle = document.querySelector("#auto-open-toggle");
const timestampsToggle = document.querySelector("#timestamps-toggle");
const scopeHint = document.querySelector("#scope-hint");

let activeTab;
let activeOrigin;
let state = {
  rule: null,
  captures: [],
  settings: { includeTimestamps: false }
};

initialize();

teachButton.addEventListener("click", async () => {
  if (!activeTab?.id || !activeOrigin) return;
  setMessage("");

  try {
    const originPattern = toOriginPattern(activeOrigin);
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      setMessage("Page Scooper needs access to this site to remember your choice.", true);
      return;
    }

    await ensureContentScript(activeTab.id);
    await chrome.tabs.sendMessage(activeTab.id, { type: "START_PICKER" });
    window.close();
  } catch (error) {
    setMessage(readableError(error), true);
  }
});

forgetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "REMOVE_RULE", origin: activeOrigin });
  if (!response?.ok) {
    setMessage(response?.error || "Could not forget this site.", true);
    return;
  }
  state.rule = null;
  chrome.tabs.sendMessage(activeTab.id, { type: "RULE_REMOVED" }).catch(() => {});
  render();
  setMessage("The saved region was removed.");
});

scopeSelect.addEventListener("change", async () => {
  await saveRulePatch({ scope: PageScooperUtils.createPageScope(scopeSelect.value, activeTab.url) });
  setMessage("Page matching updated.");
});

recordStepsButton.addEventListener("click", async () => {
  if (!state.rule || !activeTab?.id) return;
  try {
    await ensureContentScript(activeTab.id);
    const rule = {
      ...state.rule,
      scope: state.rule.scope || PageScooperUtils.createPageScope("similar", activeTab.url)
    };
    await chrome.tabs.sendMessage(activeTab.id, { type: "START_STEP_RECORDER", rule });
    window.close();
  } catch (error) {
    setMessage(readableError(error), true);
  }
});

runStepsButton.addEventListener("click", async () => {
  if (!state.rule || !activeTab?.id) return;
  try {
    await ensureContentScript(activeTab.id);
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "RUN_OPENING_STEPS",
      rule: state.rule
    });
    setMessage(response?.ok ? "Running the saved opening steps…" : response?.error, !response?.ok);
  } catch (error) {
    setMessage(readableError(error), true);
  }
});

clearStepsButton.addEventListener("click", async () => {
  await saveRulePatch({ openerSteps: [], autoOpen: false });
  setMessage("Opening steps cleared.");
});

autoOpenToggle.addEventListener("change", async () => {
  const patch = { autoOpen: autoOpenToggle.checked };
  if (!state.rule.scope) patch.scope = PageScooperUtils.createPageScope("similar", activeTab.url);
  await saveRulePatch(patch);
  setMessage(autoOpenToggle.checked ? "Automatic running enabled." : "Automatic running disabled.");
});

timestampsToggle.addEventListener("change", async () => {
  state.settings.includeTimestamps = timestampsToggle.checked;
  await chrome.storage.local.set({ settings: state.settings });
  setMessage(timestampsToggle.checked ? "Copied text will include timestamps." : "Copied text will omit timestamps.");
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURES" });
  state.captures = [];
  render();
  setMessage("Collection cleared.");
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatCaptures(
      state.captures,
      state.settings.includeTimestamps
    ));
    copyButton.textContent = "Copied!";
    setMessage(`${state.captures.length} ${pluralize(state.captures.length, "scoop")} copied together.`);
    setTimeout(() => { copyButton.textContent = "Copy everything"; }, 1400);
  } catch {
    setMessage("Chrome blocked clipboard access. Please try again.", true);
  }
});

captureList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-id]");
  if (!button) return;
  const response = await chrome.runtime.sendMessage({ type: "REMOVE_CAPTURE", id: button.dataset.removeId });
  if (response?.ok) {
    state.captures = response.captures;
    render();
  }
});

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const url = new URL(activeTab?.url || "");
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    activeOrigin = url.origin;
  } catch {
    siteStatus.textContent = "This page cannot be trained";
    teachButton.disabled = true;
  }

  const response = await chrome.runtime.sendMessage({ type: "GET_STATE", origin: activeOrigin });
  if (response?.ok) {
    state = {
      rule: response.rule,
      captures: response.captures || [],
      settings: response.settings || { includeTimestamps: false }
    };
  }
  render();
}

function render() {
  if (activeOrigin) {
    siteStatus.textContent = state.rule ? "Ready to scoop" : "No scoop button yet";
    teachButton.textContent = state.rule ? "Choose a different region" : "Choose what to scoop";
    forgetButton.hidden = !state.rule;
  }

  ruleSettings.hidden = !state.rule;
  if (state.rule) {
    const stepCount = state.rule.openerSteps?.length || 0;
    scopeSelect.value = state.rule.scope?.type === "exact"
      ? "exact"
      : state.rule.scope?.type === "origin"
        ? "origin"
        : state.rule.scope
          ? "similar"
          : "origin";
    stepsStatus.textContent = stepCount
      ? `${stepCount} ${pluralize(stepCount, "step")} saved`
      : "Not configured";
    recordStepsButton.textContent = stepCount ? "Replace steps" : "Record steps";
    runStepsButton.hidden = !stepCount;
    clearStepsButton.hidden = !stepCount;
    autoOpenToggle.disabled = !stepCount;
    autoOpenToggle.checked = Boolean(stepCount && state.rule.autoOpen);
    scopeHint.textContent = describeScope(state.rule.scope, activeTab.url);
  }

  timestampsToggle.checked = Boolean(state.settings.includeTimestamps);

  const captures = state.captures || [];
  captureCount.textContent = captures.length;
  captureLabel.textContent = pluralize(captures.length, "scoop");
  clearButton.disabled = !captures.length;
  copyButton.disabled = !captures.length;

  if (!captures.length) {
    captureList.innerHTML = '<div class="empty-state">Scooped pages will wait here until you copy them together.</div>';
    return;
  }

  captureList.replaceChildren(...captures.map((capture) => {
    const item = document.createElement("div");
    item.className = "capture-item";

    const title = document.createElement("div");
    title.className = "capture-title";
    title.textContent = capture.title || "Untitled page";

    const meta = document.createElement("div");
    meta.className = "capture-meta";
    const timestampRange = capture.timestampRange || PageScooperUtils.extractTimestampRange(capture.content);
    meta.textContent = [
      `${wordCount(capture.content).toLocaleString()} words`,
      timestampRange ? `${timestampRange.start}–${timestampRange.end}` : null
    ].filter(Boolean).join(" · ");
    if (timestampRange) meta.title = "Timestamp range found in the captured text";

    const remove = document.createElement("button");
    remove.className = "remove-capture";
    remove.dataset.removeId = capture.id;
    remove.title = "Remove from collection";
    remove.setAttribute("aria-label", `Remove ${capture.title || "capture"}`);
    remove.textContent = "×";

    item.append(title, meta, remove);
    return item;
  }));
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["utils.js", "content.js"] });
  }
}

function formatCaptures(captures, includeTimestamps) {
  return captures.map((capture, index) => {
    const heading = [
      `SCOOP ${index + 1}: ${capture.title || "Untitled page"}`,
      capture.url || "",
      "=".repeat(72)
    ].filter(Boolean).join("\n");
    const hasTranscriptRange = capture.timestampRange
      || PageScooperUtils.extractTimestampRange(capture.content);
    const content = includeTimestamps || !hasTranscriptRange
      ? capture.content
      : PageScooperUtils.removeTranscriptTimestamps(capture.content);
    return `${heading}\n\n${content}`;
  }).join("\n\n\n");
}

async function saveRulePatch(patch) {
  if (!state.rule) return null;
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_RULE",
    rule: { ...state.rule, ...patch }
  });
  if (!response?.ok) {
    setMessage(response?.error || "The recipe could not be updated.", true);
    return null;
  }
  state.rule = response.rule;
  chrome.tabs.sendMessage(activeTab.id, { type: "RULE_UPDATED", rule: state.rule }).catch(() => {});
  render();
  return state.rule;
}

function describeScope(scope, pageUrl) {
  const url = new URL(pageUrl);
  if (scope?.type === "exact") return "Runs only for this exact URL.";
  if (!scope || scope.type === "origin") return `Runs anywhere on ${url.hostname}.`;

  if (scope.type === "path-prefix") {
    return `Runs on ${url.hostname}${scope.value}…`;
  }
  return `Runs on ${url.hostname}${scope.value || url.pathname}.`;
}

function toOriginPattern(origin) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function pluralize(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function readableError(error) {
  if (/Cannot access|chrome:\/\//i.test(error?.message || "")) {
    return "Chrome does not allow extensions to run on this page.";
  }
  return error?.message || "Something went wrong. Please try again.";
}
