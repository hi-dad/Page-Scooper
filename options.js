const recipeList = document.querySelector("#recipe-list");
const captureList = document.querySelector("#capture-list");
const recipeCount = document.querySelector("#recipe-count");
const captureCount = document.querySelector("#capture-count");
const timestampsToggle = document.querySelector("#timestamps-toggle");
const clearCapturesButton = document.querySelector("#clear-captures-button");

let state = {
  rules: [],
  captures: [],
  settings: { includeTimestamps: false }
};

loadState();

chrome.storage.onChanged.addListener(() => loadState());

timestampsToggle.addEventListener("change", async () => {
  state.settings.includeTimestamps = timestampsToggle.checked;
  await chrome.storage.local.set({ settings: state.settings });
});

clearCapturesButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURES" });
});

recipeList.addEventListener("click", async (event) => {
  const removeButton = event.target.closest("[data-remove-origin]");
  if (removeButton) {
    const origin = removeButton.dataset.removeOrigin;
    if (!confirm(`Forget the saved Page Scooper recipe for ${new URL(origin).hostname}?`)) return;
    await chrome.runtime.sendMessage({ type: "REMOVE_RULE", origin });
    return;
  }

  const visitButton = event.target.closest("[data-visit-origin]");
  if (visitButton) {
    await chrome.tabs.create({ url: visitButton.dataset.visitOrigin });
  }
});

captureList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-capture]");
  if (!button) return;
  await chrome.runtime.sendMessage({ type: "REMOVE_CAPTURE", id: button.dataset.removeCapture });
});

async function loadState() {
  const [{ rules = [], settings = {} }, { captures = [] }] = await Promise.all([
    chrome.storage.local.get(["rules", "settings"]),
    chrome.storage.session.get("captures")
  ]);
  state = {
    rules,
    captures,
    settings: { includeTimestamps: false, ...settings }
  };
  render();
}

function render() {
  timestampsToggle.checked = Boolean(state.settings.includeTimestamps);
  recipeCount.textContent = state.rules.length;
  captureCount.textContent = state.captures.length;
  clearCapturesButton.disabled = !state.captures.length;
  renderRecipes();
  renderCaptures();
}

function renderRecipes() {
  if (!state.rules.length) {
    recipeList.innerHTML = '<div class="empty-state">No trained sites yet. Choose a region from the extension popup to create one.</div>';
    return;
  }

  recipeList.replaceChildren(...state.rules
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((rule) => {
      const item = createItemShell();
      const url = new URL(rule.origin);
      item.avatar.textContent = url.hostname.charAt(0);
      item.title.textContent = url.hostname;
      item.subtitle.textContent = scopeDescription(rule, url);
      item.preview.textContent = rule.sampleText || "Saved page region";

      const clickCount = rule.openerSteps?.length || 0;
      const canAutoRun = PageScooperUtils.canRunRecipeAutomatically(rule);
      item.pills.append(
        createPill(clickCount ? `${clickCount} recorded ${clickCount === 1 ? "click" : "clicks"}` : "No auto-click setup"),
        createPill(canAutoRun ? "Runs on page load" : "Manual reveal", canAutoRun)
      );

      const visit = createButton("Visit site");
      visit.dataset.visitOrigin = rule.origin;
      const remove = createButton("Forget", true);
      remove.dataset.removeOrigin = rule.origin;
      item.actions.append(visit, remove);
      return item.root;
    }));
}

function renderCaptures() {
  if (!state.captures.length) {
    captureList.innerHTML = '<div class="empty-state">Your current collection is empty.</div>';
    return;
  }

  captureList.replaceChildren(...state.captures.map((capture) => {
    const item = createItemShell();
    const hostname = safeHostname(capture.url);
    item.avatar.textContent = hostname.charAt(0) || "S";
    item.title.textContent = capture.title || "Untitled page";
    const range = capture.timestampRange || PageScooperUtils.extractTimestampRange(capture.content);
    item.subtitle.textContent = [
      hostname,
      `${wordCount(capture.content).toLocaleString()} words`,
      range ? `${range.start}–${range.end}` : null
    ].filter(Boolean).join(" · ");
    item.preview.remove();
    item.pills.remove();

    const remove = createButton("Remove", true);
    remove.dataset.removeCapture = capture.id;
    item.actions.append(remove);
    return item.root;
  }));
}

function createItemShell() {
  const root = document.createElement("article");
  root.className = "library-item";
  const avatar = document.createElement("div");
  avatar.className = "site-avatar";
  const content = document.createElement("div");
  const title = document.createElement("div");
  title.className = "item-title";
  const subtitle = document.createElement("div");
  subtitle.className = "item-subtitle";
  const preview = document.createElement("div");
  preview.className = "item-preview";
  const pills = document.createElement("div");
  pills.className = "pills";
  const actions = document.createElement("div");
  actions.className = "item-actions";
  content.append(title, subtitle, preview, pills);
  root.append(avatar, content, actions);
  return { root, avatar, title, subtitle, preview, pills, actions };
}

function createPill(label, active = false) {
  const pill = document.createElement("span");
  pill.className = `pill${active ? " active" : ""}`;
  pill.textContent = label;
  return pill;
}

function createButton(label, danger = false) {
  const button = document.createElement("button");
  button.className = `small-button${danger ? " danger" : ""}`;
  button.textContent = label;
  return button;
}

function scopeDescription(rule, url) {
  if (!rule.scope || rule.scope.type === "origin") return `Every page on ${url.hostname}`;
  if (rule.scope.type === "path-prefix") return `${url.hostname}${rule.scope.value}…`;
  if (rule.scope.type === "path") return `${url.hostname}${rule.scope.value}`;
  return "Similar pages";
}

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "Saved page";
  }
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}
