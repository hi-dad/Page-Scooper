const teachButton = document.querySelector("#teach-button");
const forgetButton = document.querySelector("#forget-button");
const clearButton = document.querySelector("#clear-button");
const copyButton = document.querySelector("#copy-button");
const siteStatus = document.querySelector("#site-status");
const captureCount = document.querySelector("#capture-count");
const captureList = document.querySelector("#capture-list");
const message = document.querySelector("#message");

let activeTab;
let activeOrigin;
let state = { rule: null, captures: [] };

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
  render();
  setMessage("The saved region was removed.");
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURES" });
  state.captures = [];
  render();
  setMessage("Collection cleared.");
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatCaptures(state.captures));
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
    state = { rule: response.rule, captures: response.captures || [] };
  }
  render();
}

function render() {
  if (activeOrigin) {
    siteStatus.textContent = state.rule ? "Ready to scoop" : "No scoop button yet";
    teachButton.textContent = state.rule ? "Choose a different region" : "Choose what to scoop";
    forgetButton.hidden = !state.rule;
  }

  const captures = state.captures || [];
  captureCount.textContent = captures.length;
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
    meta.textContent = `${wordCount(capture.content).toLocaleString()} words`;

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
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

function formatCaptures(captures) {
  return captures.map((capture, index) => {
    const heading = [
      `SCOOP ${index + 1}: ${capture.title || "Untitled page"}`,
      capture.url || "",
      "=".repeat(72)
    ].filter(Boolean).join("\n");
    return `${heading}\n\n${capture.content}`;
  }).join("\n\n\n");
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
