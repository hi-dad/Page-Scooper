const CONTENT_SCRIPT_ID = "page-scooper-saved-rules";

chrome.runtime.onInstalled.addListener(restoreExtensionState);
chrome.runtime.onStartup.addListener(restoreExtensionState);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SAVE_RULE") {
    saveRule(message.rule)
      .then((rule) => sendResponse({ ok: true, rule }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "REMOVE_RULE") {
    removeRule(message.origin)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ADD_CAPTURE") {
    addCapture(message.capture)
      .then((captures) => sendResponse({ ok: true, count: captures.length }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_STATE") {
    getState(message.origin)
      .then((state) => sendResponse({ ok: true, ...state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CLEAR_CAPTURES") {
    chrome.storage.session
      .set({ captures: [] })
      .then(() => updateBadge(0))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "REMOVE_CAPTURE") {
    removeCapture(message.id)
      .then((captures) => sendResponse({ ok: true, captures }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function saveRule(incomingRule) {
  if (!incomingRule?.origin || !incomingRule?.locator) {
    throw new Error("The selected page region could not be saved.");
  }

  const { rules = [] } = await chrome.storage.local.get("rules");
  const rule = {
    ...incomingRule,
    id: incomingRule.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString()
  };

  // The first version keeps one trained region per origin. Re-teaching replaces it.
  const nextRules = [...rules.filter((item) => item.origin !== rule.origin), rule];
  await chrome.storage.local.set({ rules: nextRules });
  await syncRegisteredContentScript();
  return rule;
}

async function removeRule(origin) {
  const { rules = [] } = await chrome.storage.local.get("rules");
  await chrome.storage.local.set({
    rules: rules.filter((rule) => rule.origin !== origin)
  });
  await syncRegisteredContentScript();
}

async function addCapture(incomingCapture) {
  if (!incomingCapture?.content?.trim()) {
    throw new Error("That region did not contain any visible text.");
  }

  const { captures = [] } = await chrome.storage.session.get("captures");
  const capture = {
    ...incomingCapture,
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString()
  };
  const nextCaptures = [...captures, capture];
  await chrome.storage.session.set({ captures: nextCaptures });
  await updateBadge(nextCaptures.length);
  return nextCaptures;
}

async function removeCapture(id) {
  const { captures = [] } = await chrome.storage.session.get("captures");
  const nextCaptures = captures.filter((capture) => capture.id !== id);
  await chrome.storage.session.set({ captures: nextCaptures });
  await updateBadge(nextCaptures.length);
  return nextCaptures;
}

async function getState(origin) {
  const [{ rules = [], settings = {} }, { captures = [] }] = await Promise.all([
    chrome.storage.local.get(["rules", "settings"]),
    chrome.storage.session.get("captures")
  ]);
  return {
    captures,
    rule: rules.find((item) => item.origin === origin) || null,
    settings: {
      includeTimestamps: false,
      ...settings
    }
  };
}

async function syncRegisteredContentScript() {
  const { rules = [] } = await chrome.storage.local.get("rules");
  const matches = [...new Set(rules.map((rule) => originToMatchPattern(rule.origin)))].filter(Boolean);

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    // There may be nothing registered yet.
  }

  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches,
      js: ["utils.js", "content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }
  ]);
}

async function restoreExtensionState() {
  const { captures = [] } = await chrome.storage.session.get("captures");
  await Promise.all([
    syncRegisteredContentScript(),
    updateBadge(captures.length)
  ]);
}

function originToMatchPattern(origin) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function updateBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: "#173d35" });
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
}
