(() => {
  if (globalThis.__pageScooperLoaded) return;
  globalThis.__pageScooperLoaded = true;

  const extensionHosts = new Set();
  let activePicker = null;
  let activeStepRecorder = null;
  let activeMount = null;
  let stopRuleWatcher = null;
  let openingRun = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "START_PICKER") {
      startPicker();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "START_STEP_RECORDER") {
      startStepRecorder(message.rule);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RUN_OPENING_STEPS") {
      runOpeningSteps(message.rule, { announce: true });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RULE_UPDATED") {
      watchSavedRule(message.rule);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RULE_REMOVED") {
      stopRuleWatcher?.();
      stopRuleWatcher = null;
      activeMount?.destroy();
      sendResponse({ ok: true });
    }
  });

  initializeSavedRule();

  async function initializeSavedRule() {
    const { rules = [] } = await chrome.storage.local.get("rules");
    const rule = rules.find((item) => item.origin === location.origin);
    if (!rule) return;
    watchSavedRule(rule);
  }

  function startPicker() {
    activePicker?.cancel();

    const overlay = document.createElement("div");
    overlay.dataset.pageScooper = "picker";
    Object.assign(overlay.style, {
      position: "fixed",
      pointerEvents: "none",
      border: "3px solid #f5a623",
      borderRadius: "8px",
      background: "rgba(245, 166, 35, 0.12)",
      boxShadow: "0 0 0 9999px rgba(16, 35, 31, 0.18)",
      zIndex: "2147483646",
      transition: "all 70ms ease-out"
    });

    const tip = createFloatingTip();
    document.documentElement.append(overlay, tip);
    extensionHosts.add(overlay);
    extensionHosts.add(tip);

    let hovered = null;

    const onMove = (event) => {
      const candidate = document.elementFromPoint(event.clientX, event.clientY);
      if (!candidate || isExtensionElement(candidate)) return;
      hovered = candidate;
      const rect = candidate.getBoundingClientRect();
      Object.assign(overlay.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
    };

    const onClick = async (event) => {
      if (!hovered || isExtensionElement(hovered)) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const target = hovered;
      cancel();
      const rule = {
        origin: location.origin,
        locator: buildLocator(target),
        sampleText: normalizeText(target.innerText).slice(0, 160),
        scope: PageScooperUtils.createPageScope("similar", location.href)
      };

      const response = await chrome.runtime.sendMessage({ type: "SAVE_RULE", rule });
      if (!response?.ok) {
        showToast(response?.error || "Page Scooper could not save that region.", "error");
        return;
      }

      watchSavedRule(response.rule);
      showToast("Saved. Page Scooper will remember this region.");
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") cancel();
    };

    const cancel = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      tip.remove();
      extensionHosts.delete(overlay);
      extensionHosts.delete(tip);
      activePicker = null;
    };

    activePicker = { cancel };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function createFloatingTip() {
    const host = document.createElement("div");
    host.dataset.pageScooper = "tip";
    Object.assign(host.style, {
      position: "fixed",
      left: "50%",
      top: "18px",
      transform: "translateX(-50%)",
      zIndex: "2147483647"
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const tip = document.createElement("div");
    tip.textContent = "Click the content you want to scoop · Esc to cancel";
    tip.style.cssText = `
      box-sizing: border-box; padding: 11px 16px; border-radius: 999px;
      background: #173d35; color: #fffaf0; font: 600 13px/1.2 system-ui, sans-serif;
      box-shadow: 0 8px 28px rgba(0,0,0,.2); white-space: nowrap;
    `;
    shadow.append(tip);
    return host;
  }

  function startStepRecorder(rule) {
    if (!rule) return;
    activePicker?.cancel();
    activeStepRecorder?.cancel();

    const steps = [];
    const host = document.createElement("div");
    host.dataset.pageScooper = "step-recorder";
    Object.assign(host.style, {
      position: "fixed",
      left: "50%",
      top: "16px",
      transform: "translateX(-50%)",
      zIndex: "2147483647"
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const panel = document.createElement("div");
    panel.style.cssText = `
      box-sizing: border-box; min-width: 420px; max-width: min(620px, calc(100vw - 32px));
      padding: 13px 14px; border: 1px solid rgba(255,255,255,.16); border-radius: 16px;
      background: #173d35; color: #fffaf0; box-shadow: 0 12px 38px rgba(0,0,0,.28);
      font: 600 12px/1.35 system-ui, sans-serif;
    `;
    const title = document.createElement("strong");
    title.textContent = "Record the clicks that reveal your content";
    title.style.cssText = "display:block;font-size:13px;margin-bottom:2px";
    const detail = document.createElement("span");
    detail.textContent = "Start with it closed. Click reusable controls in order; their text may change between pages.";
    detail.style.cssText = "color:#c9d9d5;font-weight:500";
    const status = document.createElement("div");
    status.style.cssText = `
      min-height: 18px; margin: 9px 0; padding: 7px 9px; border-radius: 9px;
      background: rgba(255,255,255,.09); color: #eff6f3; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    `;
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;justify-content:flex-end;gap:7px";
    const undo = recorderButton("Undo", true);
    const cancelButton = recorderButton("Cancel", true);
    const done = recorderButton("Done", false);
    controls.append(undo, cancelButton, done);
    panel.append(title, detail, status, controls);
    shadow.append(panel);
    document.documentElement.append(host);
    extensionHosts.add(host);

    const renderStatus = () => {
      undo.disabled = !steps.length;
      undo.style.opacity = steps.length ? "1" : ".45";
      if (!steps.length) {
        status.textContent = "No clicks recorded yet";
        return;
      }
      status.textContent = steps.map((step, index) => `${index + 1}. ${step.label}`).join("  →  ");
    };

    const onPageClick = (event) => {
      if (isExtensionElement(event.target)) return;
      const clickable = findClickable(event.target);
      if (!clickable) return;

      const locator = buildLocator(clickable);
      const previous = steps[steps.length - 1];
      if (previous?.locator.selector === locator.selector) return;
      steps.push({ locator, label: describeElement(clickable) });
      flashRecordedElement(clickable);
      renderStatus();
    };

    const cleanup = () => {
      document.removeEventListener("click", onPageClick, true);
      extensionHosts.delete(host);
      host.remove();
      activeStepRecorder = null;
    };

    const cancel = () => cleanup();
    undo.addEventListener("click", () => {
      steps.pop();
      renderStatus();
    });
    cancelButton.addEventListener("click", cancel);
    done.addEventListener("click", async () => {
      if (!steps.length) {
        status.textContent = "Click at least one page control, or choose Cancel.";
        return;
      }
      done.disabled = true;
      done.textContent = "Saving…";
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_RULE",
        rule: { ...rule, openerSteps: steps, autoOpen: rule.autoOpen || false }
      });
      cleanup();
      if (!response?.ok) {
        showToast(response?.error || "Those opening steps could not be saved.", "error");
        return;
      }
      watchSavedRule(response.rule);
      showToast(`${steps.length} ${steps.length === 1 ? "opening step" : "opening steps"} saved.`);
    });

    activeStepRecorder = { cancel };
    document.addEventListener("click", onPageClick, true);
    renderStatus();
  }

  function recorderButton(label, subtle) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
      border: ${subtle ? "1px solid rgba(255,255,255,.2)" : "0"}; border-radius: 9px;
      padding: 7px 11px; color: ${subtle ? "#fffaf0" : "#173d35"};
      background: ${subtle ? "transparent" : "#f6c667"}; font: 750 11px/1 system-ui, sans-serif;
      cursor: pointer;
    `;
    return button;
  }

  function findClickable(element) {
    if (!(element instanceof Element)) return null;
    const semanticControl = element.closest([
      "button", "a", "summary", "[role='button']", "[role='tab']",
      "input[type='button']", "input[type='submit']", "[tabindex='0']"
    ].join(","));
    if (semanticControl) return semanticControl;

    let candidate = element;
    for (let depth = 0; candidate && depth < 4; depth += 1, candidate = candidate.parentElement) {
      if (getComputedStyle(candidate).cursor === "pointer") return candidate;
    }
    return null;
  }

  function describeElement(element) {
    const description = element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.innerText
      || element.textContent
      || element.tagName.toLowerCase();
    return normalizeText(description).replace(/\n/g, " ").slice(0, 48) || "Page control";
  }

  function flashRecordedElement(element) {
    const previousOutline = element.style.outline;
    const previousOffset = element.style.outlineOffset;
    element.style.outline = "3px solid #f5a623";
    element.style.outlineOffset = "3px";
    setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.outlineOffset = previousOffset;
    }, 650);
  }

  function mountScoopButton(target, rule) {
    activeMount?.destroy();

    const host = document.createElement("div");
    host.dataset.pageScooper = "button";
    Object.assign(host.style, {
      position: "fixed",
      zIndex: "2147483645"
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Scoop this page";
    button.style.cssText = `
      appearance: none; border: 0; border-radius: 999px; padding: 9px 13px;
      background: #fff8e8; color: #173d35; box-shadow: 0 4px 18px rgba(23,61,53,.2);
      font: 700 12px/1 system-ui, sans-serif; cursor: pointer;
      outline: 1px solid rgba(23,61,53,.18); transition: transform .15s, background .15s;
    `;
    button.addEventListener("mouseenter", () => { button.style.transform = "translateY(-1px)"; });
    button.addEventListener("mouseleave", () => { button.style.transform = ""; });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!target.isConnected) {
        showToast("This page changed. Open the transcript and try again.", "error");
        return;
      }
      const content = normalizeText(target.innerText);
      if (!content) {
        showToast("This region does not contain visible text.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Scooping…";
      const response = await chrome.runtime.sendMessage({
        type: "ADD_CAPTURE",
        capture: {
          title: document.title,
          url: location.href,
          content,
          ruleId: rule.id,
          timestampRange: globalThis.PageScooperUtils?.extractTimestampRange(content) || null
        }
      });

      if (response?.ok) {
        button.textContent = "Added to collection ✓";
        button.style.background = "#dff3df";
        showToast(`${response.count} ${response.count === 1 ? "scoop" : "scoops"} in your collection.`);
        resetTimer = setTimeout(reset, 1800);
      } else {
        button.textContent = "Try again";
        showToast(response?.error || "That content could not be added.", "error");
      }
      button.disabled = false;
    });
    shadow.append(button);
    document.documentElement.append(host);
    extensionHosts.add(host);

    let resetTimer = null;

    const position = () => {
      if (!target.isConnected || !host.isConnected) return;
      const rect = target.getBoundingClientRect();
      const width = host.getBoundingClientRect().width;
      const left = Math.min(
        window.innerWidth - width - 8,
        Math.max(8, rect.right - width - 12)
      );
      host.style.left = `${left}px`;
      host.style.top = `${Math.max(8, rect.top + 12)}px`;
      host.style.display = rect.width > 0 && rect.height > 0 ? "block" : "none";
    };

    const resizeObserver = new ResizeObserver(position);

    const reset = () => {
      clearTimeout(resetTimer);
      resetTimer = null;
      button.textContent = "Scoop this page";
      button.style.background = "#fff8e8";
    };

    const destroy = () => {
      clearTimeout(resetTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      extensionHosts.delete(host);
      host.remove();
      if (activeMount?.host === host) activeMount = null;
    };

    requestAnimationFrame(position);
    window.addEventListener("resize", position, { passive: true });
    window.addEventListener("scroll", position, { passive: true, capture: true });
    resizeObserver.observe(target);

    activeMount = { host, target, destroy, reset };
    return activeMount;
  }

  function watchSavedRule(rule) {
    stopRuleWatcher?.();

    let lastUrl = location.href;
    let attemptedAutoOpenUrl = null;
    let refreshTimer = null;
    let stopped = false;

    const refresh = () => {
      refreshTimer = null;
      if (stopped) return;

      const urlChanged = location.href !== lastUrl;
      if (urlChanged) lastUrl = location.href;

      if (!matchesRuleScope(rule)) {
        activeMount?.destroy();
        return;
      }

      const target = resolveVisibleLocator(rule.locator);
      if (!target) {
        activeMount?.destroy();
        if (
          rule.autoOpen
          && rule.openerSteps?.length
          && attemptedAutoOpenUrl !== location.href
        ) {
          attemptedAutoOpenUrl = location.href;
          runOpeningSteps(rule).finally(scheduleRefresh);
        }
        return;
      }

      if (activeMount?.target === target && target.isConnected) {
        if (urlChanged) activeMount.reset();
        return;
      }

      mountScoopButton(target, rule);
    };

    const scheduleRefresh = () => {
      if (refreshTimer || stopped) return;
      refreshTimer = setTimeout(refresh, 120);
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
    const urlTimer = setInterval(() => {
      if (location.href !== lastUrl) scheduleRefresh();
    }, 500);

    stopRuleWatcher = () => {
      stopped = true;
      clearTimeout(refreshTimer);
      clearInterval(urlTimer);
      observer.disconnect();
      activeMount?.destroy();
    };

    refresh();
  }

  function runOpeningSteps(rule, { announce = false } = {}) {
    if (!rule?.openerSteps?.length) {
      if (announce) showToast("No opening steps are configured for this site.", "error");
      return Promise.resolve(false);
    }
    if (openingRun) return openingRun;

    openingRun = (async () => {
      try {
        if (resolveVisibleLocator(rule.locator)) return true;

        let index = 0;
        while (index < rule.openerSteps.length) {
          if (resolveVisibleLocator(rule.locator)) break;

          // If a later control is already visible, skip earlier toggle steps.
          let selectedIndex = index;
          for (let later = rule.openerSteps.length - 1; later > index; later -= 1) {
            if (resolveVisibleLocator(rule.openerSteps[later].locator)) {
              selectedIndex = later;
              break;
            }
          }

          const step = rule.openerSteps[selectedIndex];
          const control = await waitForLocator(step.locator, 6500);
          if (!control) throw new Error(`Could not find “${step.label}”.`);
          control.click();
          index = selectedIndex + 1;
          await delay(350);
        }

        const target = resolveVisibleLocator(rule.locator) || await waitForLocator(rule.locator, 8000);
        if (!target) throw new Error("The saved content did not appear after running the opening steps.");
        if (announce) showToast("Saved content opened.");
        return true;
      } catch (error) {
        if (announce) showToast(error.message || "The opening steps could not finish.", "error");
        return false;
      } finally {
        openingRun = null;
      }
    })();

    return openingRun;
  }

  async function waitForLocator(locator, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = resolveVisibleLocator(locator);
      if (element) return element;
      await delay(150);
    }
    return null;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function resolveVisibleLocator(locator) {
    const element = resolveLocator(locator);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      ? element
      : null;
  }

  function matchesRuleScope(rule) {
    return PageScooperUtils.matchesPageScope(rule.origin, rule.scope, location.href);
  }

  function buildLocator(element) {
    const attributes = {};
    for (const name of ["data-testid", "data-test-id", "aria-label", "role", "name"]) {
      const value = element.getAttribute(name);
      if (value && value.length < 100) attributes[name] = value;
    }

    return {
      selector: buildUniqueSelector(element),
      tag: element.tagName.toLowerCase(),
      id: isStableToken(element.id) ? element.id : "",
      attributes,
      classes: [...element.classList].filter(isStableToken).slice(0, 4)
    };
  }

  function resolveLocator(locator) {
    if (locator.id) {
      const byId = document.getElementById(locator.id);
      if (byId) return byId;
    }

    for (const name of ["data-testid", "data-test-id", "aria-label", "name"]) {
      const value = locator.attributes?.[name];
      if (!value) continue;
      const candidates = document.querySelectorAll(`${locator.tag || "*"}[${CSS.escape(name)}="${cssString(value)}"]`);
      if (candidates.length === 1) return candidates[0];
    }

    if (locator.selector) {
      try {
        const bySelector = document.querySelector(locator.selector);
        if (bySelector) return bySelector;
      } catch {
        // Fall through to the class-based recovery below.
      }
    }

    if (locator.classes?.length) {
      const selector = `${locator.tag || "*"}${locator.classes.map((name) => `.${CSS.escape(name)}`).join("")}`;
      return document.querySelector(selector);
    }
    return null;
  }

  function buildUniqueSelector(element) {
    if (isStableToken(element.id)) return `#${CSS.escape(element.id)}`;

    for (const name of ["data-testid", "data-test-id", "aria-label"]) {
      const value = element.getAttribute(name);
      if (!value || value.length >= 100) continue;
      const selector = `${element.tagName.toLowerCase()}[${name}="${cssString(value)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }

    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      const stableClasses = [...node.classList].filter(isStableToken).slice(0, 2);
      if (stableClasses.length) part += stableClasses.map((name) => `.${CSS.escape(name)}`).join("");

      const parent = node.parentElement;
      if (parent) {
        const peers = [...parent.children].filter((peer) => peer.tagName === node.tagName);
        if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const selector = parts.join(" > ");
      if (document.querySelectorAll(selector).length === 1) return selector;
      node = parent;
    }
    return parts.join(" > ");
  }

  function isStableToken(value) {
    return Boolean(value) && value.length < 64 && !/\d{5,}|^[a-f0-9]{8,}$/i.test(value);
  }

  function cssString(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isExtensionElement(element) {
    return [...extensionHosts].some((host) => host === element || host.contains(element));
  }

  function showToast(message, type = "success") {
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647"
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
      max-width: 340px; padding: 12px 15px; border-radius: 12px;
      background: ${type === "error" ? "#7a2828" : "#173d35"}; color: white;
      font: 600 13px/1.35 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.2);
    `;
    shadow.append(toast);
    document.documentElement.append(host);
    setTimeout(() => host.remove(), 3200);
  }
})();
