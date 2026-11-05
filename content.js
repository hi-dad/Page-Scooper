(() => {
  if (globalThis.__pageScooperLoaded) return;
  globalThis.__pageScooperLoaded = true;

  const extensionHosts = new Set();
  let activePicker = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "START_PICKER") {
      startPicker();
      sendResponse({ ok: true });
    }
  });

  initializeSavedButton();

  async function initializeSavedButton() {
    const { rules = [] } = await chrome.storage.local.get("rules");
    const rule = rules.find((item) => item.origin === location.origin);
    if (!rule) return;

    const target = resolveLocator(rule.locator);
    if (target) mountScoopButton(target, rule);
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
        sampleText: normalizeText(target.innerText).slice(0, 160)
      };

      const response = await chrome.runtime.sendMessage({ type: "SAVE_RULE", rule });
      if (!response?.ok) {
        showToast(response?.error || "Page Scooper could not save that region.", "error");
        return;
      }

      mountScoopButton(target, response.rule);
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

  function mountScoopButton(target, rule) {
    document.querySelectorAll('[data-page-scooper="button"]').forEach((node) => node.remove());

    const host = document.createElement("div");
    host.dataset.pageScooper = "button";
    Object.assign(host.style, {
      position: "absolute",
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
      const content = normalizeText(target.innerText);
      if (!content) {
        showToast("This region does not contain visible text.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Scooping…";
      const response = await chrome.runtime.sendMessage({
        type: "ADD_CAPTURE",
        capture: { title: document.title, url: location.href, content, ruleId: rule.id }
      });

      if (response?.ok) {
        button.textContent = `Scooped · ${response.count} saved`;
        button.style.background = "#dff3df";
      } else {
        button.textContent = "Try again";
        showToast(response?.error || "That content could not be added.", "error");
      }
      button.disabled = false;
    });
    shadow.append(button);
    document.documentElement.append(host);
    extensionHosts.add(host);

    const position = () => {
      if (!target.isConnected || !host.isConnected) return;
      const rect = target.getBoundingClientRect();
      host.style.left = `${Math.max(8, window.scrollX + rect.right - host.offsetWidth)}px`;
      host.style.top = `${Math.max(8, window.scrollY + rect.top - 38)}px`;
    };

    position();
    window.addEventListener("resize", position, { passive: true });
    window.addEventListener("scroll", position, { passive: true });
    new ResizeObserver(position).observe(target);
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
