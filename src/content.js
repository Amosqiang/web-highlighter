(function bootstrapContentScript(globalScope) {
  const shared = globalScope.WebHighlighterShared;
  const storage = globalScope.WebHighlighterStorage;

  if (!shared || !storage || globalScope.top !== globalScope.self) {
    return;
  }

  const VIEW_MODES = ["all", "current", "today", "week"];

  const state = {
    pageKey: shared.getPageKey(globalScope.location.href),
    pageUrl: shared.getPageKey(globalScope.location.href),
    allHighlights: [],
    pageHighlights: [],
    selectedHighlightId: null,
    hoveredHighlightId: null,
    siteColor: shared.DEFAULT_COLOR,
    sitePrefs: {
      disabled: false,
      hideToggle: true
    },
    viewMode: "current",
    colorFilter: "",
    restoreVersion: 0,
    noteTimers: new Map(),
    lastKnownHref: globalScope.location.href,
    activeModal: null,
    ui: {}
  };

  function getRootNode() {
    return document.body || document.documentElement;
  }

  function createUi() {
    if (document.querySelector("[data-web-highlighter-ui='true']")) {
      return;
    }

    const root = document.createElement("div");
    root.dataset.webHighlighterUi = "true";
    root.className = "wh-ui-root";

    root.innerHTML = `
      <div class="wh-toolbar" hidden>
        <div class="wh-toolbar__colors">
          ${shared.COLORS.map(
            (color) => `
              <button type="button" class="wh-color-button" data-color="${color.id}" aria-label="${color.label}">
                <span style="background:${color.hex}"></span>
              </button>
            `
          ).join("")}
        </div>
      </div>
      <aside class="wh-sidebar" hidden>
        <header class="wh-sidebar__header">
          <div class="wh-search-shell">
            <span class="wh-search-shell__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-3.5-3.5"></path>
              </svg>
            </span>
            <input type="search" class="wh-search-input" placeholder="Search highlights..." />
            <button type="button" class="wh-search-shell__clear" data-action="clear-search" hidden aria-label="Clear search">×</button>
          </div>
          <button type="button" class="wh-icon-button" data-action="close-sidebar" aria-label="Close sidebar">×</button>
        </header>
        <div class="wh-filter-strip" role="tablist" aria-label="Highlight filters">
          <button type="button" class="wh-filter-button" data-action="set-view" data-view="all">All</button>
          <button type="button" class="wh-filter-button" data-action="set-view" data-view="current">This Page</button>
          <button type="button" class="wh-filter-button" data-action="set-view" data-view="today">Today</button>
          <button type="button" class="wh-filter-button" data-action="set-view" data-view="week">This Week</button>
        </div>
        <div class="wh-color-strip">
          ${shared.COLORS.map(
            (color) => `
              <button
                type="button"
                class="wh-filter-color"
                data-action="toggle-color-filter"
                data-color="${color.id}"
                aria-label="Filter ${color.label} highlights"
                title="Filter ${color.label} highlights"
              >
                <span style="background:${color.hex}"></span>
              </button>
            `
          ).join("")}
        </div>
        <div class="wh-sidebar__summary"></div>
        <div class="wh-sidebar__list"></div>
        <section class="wh-inspector" hidden></section>
        <footer class="wh-bottom-bar">
          <button type="button" class="wh-bottom-button" data-action="open-stats">Statistics</button>
          <button type="button" class="wh-bottom-button" data-action="open-export">Export</button>
          <button type="button" class="wh-bottom-button is-delete" data-action="delete-page">Page</button>
          <button type="button" class="wh-bottom-button is-delete" data-action="delete-all">All</button>
          <button type="button" class="wh-bottom-button" data-action="open-settings">Settings</button>
        </footer>
      </aside>
      <div class="wh-modal-backdrop" hidden>
        <div class="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-modal-title">
          <div class="wh-modal__header">
            <h3 id="wh-modal-title" class="wh-modal__title"></h3>
            <button type="button" class="wh-icon-button" data-action="close-modal" aria-label="Close dialog">×</button>
          </div>
          <div class="wh-modal__body"></div>
          <div class="wh-modal__footer"></div>
        </div>
      </div>
      <div class="wh-toast" hidden></div>
    `;

    getRootNode().appendChild(root);

    state.ui.root = root;
    state.ui.toolbar = root.querySelector(".wh-toolbar");
    state.ui.sidebar = root.querySelector(".wh-sidebar");
    state.ui.sidebarList = root.querySelector(".wh-sidebar__list");
    state.ui.sidebarSearch = root.querySelector(".wh-search-input");
    state.ui.sidebarSummary = root.querySelector(".wh-sidebar__summary");
    state.ui.searchClear = root.querySelector(".wh-search-shell__clear");
    state.ui.toast = root.querySelector(".wh-toast");
    state.ui.inspector = root.querySelector(".wh-inspector");
    state.ui.modalBackdrop = root.querySelector(".wh-modal-backdrop");
    state.ui.modalTitle = root.querySelector(".wh-modal__title");
    state.ui.modalBody = root.querySelector(".wh-modal__body");
    state.ui.modalFooter = root.querySelector(".wh-modal__footer");
    state.ui.viewButtons = Array.from(root.querySelectorAll('[data-action="set-view"]'));
    state.ui.colorButtons = Array.from(root.querySelectorAll('[data-action="toggle-color-filter"]'));
    state.ui.toolbarButtons = Array.from(root.querySelectorAll(".wh-color-button"));
  }

  function showToast(message) {
    const toast = state.ui.toast;
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("is-visible");
    clearTimeout(toast._timerId);
    toast._timerId = setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function clearSelection() {
    const selection = globalScope.getSelection();
    selection?.removeAllRanges();
  }

  function hideToolbar() {
    if (state.ui.toolbar) {
      state.ui.toolbar.hidden = true;
    }
  }

  function syncToolbarColors() {
    if (!state.ui.toolbarButtons) {
      return;
    }

    state.ui.toolbarButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.color === state.siteColor);
    });
  }

  function getAllowedTextNodes() {
    const root = getRootNode();
    if (!root) {
      return [];
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.length) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          parent.closest("[data-web-highlighter-ui='true']") ||
          parent.closest("script, style, noscript, textarea, input, select, option, button") ||
          parent.isContentEditable
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function computeSelectionPayload(range) {
    const nodes = getAllowedTextNodes();
    const segments = [];
    let pageText = "";
    let cursor = 0;
    let startOffset = null;
    let endOffset = null;

    nodes.forEach((node) => {
      const nodeText = node.nodeValue;
      const nodeLength = nodeText.length;
      pageText += nodeText;

      if (!range.intersectsNode(node)) {
        cursor += nodeLength;
        return;
      }

      let start = 0;
      let end = nodeLength;

      if (node === range.startContainer) {
        start = range.startOffset;
      }

      if (node === range.endContainer) {
        end = range.endOffset;
      }

      if (start >= end) {
        cursor += nodeLength;
        return;
      }

      if (startOffset === null) {
        startOffset = cursor + start;
      }
      endOffset = cursor + end;

      segments.push({
        node,
        start,
        end
      });

      cursor += nodeLength;
    });

    if (!segments.length || startOffset === null || endOffset === null) {
      return null;
    }

    const selectedText = segments.map((segment) => segment.node.nodeValue.slice(segment.start, segment.end)).join("");
    if (!selectedText.trim()) {
      return null;
    }

    const overlap = segments.some((segment) => segment.node.parentElement?.closest(".wh-highlight"));
    const beforeText = pageText.slice(0, startOffset);
    let occurrence = 0;
    let searchFrom = 0;

    while (true) {
      const index = beforeText.indexOf(selectedText, searchFrom);
      if (index === -1) {
        break;
      }
      occurrence += 1;
      searchFrom = index + selectedText.length;
    }

    return {
      segments,
      selectedText,
      startOffset,
      endOffset,
      occurrence,
      overlap
    };
  }

  function positionToolbar(range) {
    const toolbar = state.ui.toolbar;
    if (!toolbar) {
      return;
    }

    const rect = range.getBoundingClientRect();
    toolbar.hidden = false;
    const width = toolbar.offsetWidth || 120;
    const top = Math.max(globalScope.scrollY + rect.top - 32, 12);
    const left = Math.max(
      12,
      Math.min(globalScope.scrollX + rect.left + rect.width / 2 - width / 2, globalScope.scrollX + globalScope.innerWidth - width - 12)
    );

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
  }

  function getCurrentSelectionRange() {
    const selection = globalScope.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const container =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;

    if (!container || container.closest("[data-web-highlighter-ui='true']")) {
      return null;
    }

    if (!range.toString().trim()) {
      return null;
    }

    return range.cloneRange();
  }

  function wrapSegment(segment, highlight) {
    let target = segment.node;
    if (segment.start > 0) {
      target = target.splitText(segment.start);
    }

    if (segment.end - segment.start < target.nodeValue.length) {
      target.splitText(segment.end - segment.start);
    }

    const wrapper = document.createElement("span");
    wrapper.className = `wh-highlight wh-color-${highlight.color}`;
    wrapper.dataset.whId = highlight.id;
    wrapper.dataset.whColor = highlight.color;
    wrapper.tabIndex = 0;
    wrapper.title = highlight.note ? `Note: ${highlight.note}` : "Click to manage this highlight";
    wrapper.setAttribute("role", "mark");

    target.parentNode.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    return wrapper;
  }

  function unwrapHighlightElement(element) {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parent.normalize();
  }

  function removeInjectedHighlights() {
    document.querySelectorAll(".wh-highlight[data-wh-id]").forEach((element) => {
      unwrapHighlightElement(element);
    });
  }

  function computeSegmentsForOffsets(startOffset, endOffset) {
    const nodes = getAllowedTextNodes();
    const segments = [];
    let cursor = 0;

    nodes.forEach((node) => {
      const length = node.nodeValue.length;
      const nodeStart = cursor;
      const nodeEnd = cursor + length;
      const overlapStart = Math.max(startOffset, nodeStart);
      const overlapEnd = Math.min(endOffset, nodeEnd);

      if (overlapStart < overlapEnd) {
        segments.push({
          node,
          start: overlapStart - nodeStart,
          end: overlapEnd - nodeStart
        });
      }

      cursor = nodeEnd;
    });

    return segments;
  }

  function findNthOccurrence(haystack, needle, occurrenceCount) {
    if (!needle) {
      return -1;
    }

    let fromIndex = 0;
    let seen = 0;

    while (true) {
      const index = haystack.indexOf(needle, fromIndex);
      if (index === -1) {
        return -1;
      }

      if (seen === occurrenceCount) {
        return index;
      }

      seen += 1;
      fromIndex = index + needle.length;
    }
  }

  function resolveHighlightOffsets(highlight) {
    const pageText = getAllowedTextNodes().map((node) => node.nodeValue).join("");

    if (
      Number.isFinite(highlight.startOffset) &&
      Number.isFinite(highlight.endOffset) &&
      highlight.startOffset >= 0 &&
      highlight.endOffset <= pageText.length &&
      pageText.slice(highlight.startOffset, highlight.endOffset) === highlight.text
    ) {
      return {
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset
      };
    }

    const occurrenceIndex = Number.isFinite(highlight.occurrence) ? highlight.occurrence : 0;
    const fallbackStart = findNthOccurrence(pageText, highlight.text, occurrenceIndex);
    if (fallbackStart !== -1) {
      return {
        startOffset: fallbackStart,
        endOffset: fallbackStart + highlight.text.length
      };
    }

    const firstMatch = pageText.indexOf(highlight.text);
    if (firstMatch !== -1) {
      return {
        startOffset: firstMatch,
        endOffset: firstMatch + highlight.text.length
      };
    }

    return null;
  }

  function applyStoredHighlight(highlight) {
    const resolved = resolveHighlightOffsets(highlight);
    if (!resolved) {
      return false;
    }

    const segments = computeSegmentsForOffsets(resolved.startOffset, resolved.endOffset);
    if (!segments.length || segments.some((segment) => segment.node.parentElement?.closest(".wh-highlight"))) {
      return false;
    }

    segments.forEach((segment) => wrapSegment(segment, highlight));
    return true;
  }

  function selectedHighlight() {
    return state.allHighlights.find((highlight) => highlight.id === state.selectedHighlightId) || null;
  }

  function getCurrentOrigin() {
    return globalScope.location.origin;
  }

  function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function startOfWeek() {
    const date = new Date();
    const offset = (date.getDay() + 6) % 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    return date.getTime();
  }

  function getScopedHighlights() {
    switch (state.viewMode) {
      case "current":
        return state.allHighlights.filter((highlight) => highlight.pageKey === state.pageKey);
      case "today": {
        const threshold = startOfToday();
        return state.allHighlights.filter((highlight) => highlight.createdAt >= threshold);
      }
      case "week": {
        const threshold = startOfWeek();
        return state.allHighlights.filter((highlight) => highlight.createdAt >= threshold);
      }
      default:
        return state.allHighlights.slice();
    }
  }

  function getFilteredHighlights() {
    const query = state.ui.sidebarSearch?.value.trim() || "";
    let results = getScopedHighlights();

    if (state.colorFilter) {
      results = results.filter((highlight) => highlight.color === state.colorFilter);
    }

    if (query) {
      results = results.filter((highlight) => shared.matchesHighlight(highlight, query));
    }

    return results.sort((left, right) => right.createdAt - left.createdAt);
  }

  function truncateText(text, maxLength) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function highlightLabel(highlight) {
    return truncateText(highlight.text, 48) || "Untitled highlight";
  }

  function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  }

  function syncSelectedHighlightUi() {
    document.querySelectorAll(".wh-highlight.is-selected").forEach((element) => {
      element.classList.remove("is-selected");
    });

    if (!state.selectedHighlightId) {
      return;
    }

    document.querySelectorAll(`.wh-highlight[data-wh-id="${CSS.escape(state.selectedHighlightId)}"]`).forEach((element) => {
      element.classList.add("is-selected");
    });
  }

  function clearSelectedHighlight() {
    if (!state.selectedHighlightId) {
      return;
    }

    state.selectedHighlightId = null;
    renderSidebar();
    syncSelectedHighlightUi();
  }

  function renderSummary(visibleHighlights) {
    if (!state.ui.sidebarSummary) {
      return;
    }

    const scopedCount = getScopedHighlights().length;
    const colorText = state.colorFilter ? ` • ${state.colorFilter}` : "";
    state.ui.sidebarSummary.innerHTML = `
      <span>${pluralize(visibleHighlights.length, "highlight")} shown</span>
      <span>${pluralize(scopedCount, "highlight")} in this scope${colorText}</span>
    `;
  }

  function renderInspector() {
    if (!state.ui.inspector) {
      return;
    }

    const highlight = selectedHighlight();
    if (!highlight) {
      state.ui.inspector.hidden = true;
      state.ui.inspector.innerHTML = "";
      return;
    }

    const isOnCurrentPage = highlight.pageKey === state.pageKey;
    state.ui.inspector.hidden = false;
    state.ui.inspector.innerHTML = `
      <div class="wh-inspector__header">
        <div>
          <p class="wh-inspector__eyebrow">Selected Highlight</p>
          <h3>${shared.escapeHtml(highlightLabel(highlight))}</h3>
          <p class="wh-inspector__meta">
            ${shared.escapeHtml(shared.formatRelativeTime(highlight.createdAt))}
            ${isOnCurrentPage ? "" : ` • ${shared.escapeHtml(highlight.siteLabel || "another page")}`}
          </p>
        </div>
      </div>
      <div class="wh-inspector__palette">
        ${shared.COLORS.map(
          (color) => `
            <button
              type="button"
              class="wh-mini-color ${highlight.color === color.id ? "is-active" : ""}"
              data-action="set-selected-color"
              data-id="${highlight.id}"
              data-color="${color.id}"
              aria-label="Set color to ${color.label}"
            >
              <span style="background:${color.hex}"></span>
            </button>
          `
        ).join("")}
      </div>
      <label class="wh-field">
        <span>Tags</span>
        <input type="text" data-action="edit-tags" data-id="${highlight.id}" value="${shared.escapeHtml(
          (highlight.tags || []).join(", ")
        )}" placeholder="comma, separated, tags" />
      </label>
      <label class="wh-field">
        <span>Note</span>
        <textarea data-action="edit-note" data-id="${highlight.id}" maxlength="500" placeholder="Add a note">${shared.escapeHtml(
          highlight.note || ""
        )}</textarea>
      </label>
      <div class="wh-inspector__actions">
        <button type="button" data-action="copy-selected" data-id="${highlight.id}">Copy</button>
        ${
          isOnCurrentPage
            ? ""
            : `<button type="button" data-action="open-source" data-id="${highlight.id}">Open Source</button>`
        }
        <button type="button" data-action="delete-selected" data-id="${highlight.id}" class="is-danger">Delete</button>
      </div>
    `;
  }

  function renderSidebar() {
    if (!state.ui.sidebarList || !state.ui.sidebarSearch) {
      return;
    }

    const visibleHighlights = getFilteredHighlights();
    const query = state.ui.sidebarSearch.value.trim();

    state.ui.searchClear.hidden = !query;

    state.ui.viewButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === state.viewMode);
    });

    state.ui.colorButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.color === state.colorFilter);
    });

    renderSummary(visibleHighlights);

    if (!visibleHighlights.length) {
      const disabledText = state.sitePrefs.disabled && state.viewMode === "current"
        ? "Highlighting is disabled on this site. Open Settings to turn it back on."
        : "No highlights match this view.";

      state.ui.sidebarList.innerHTML = `
        <div class="wh-empty-state">
          <p>${shared.escapeHtml(disabledText)}</p>
          <span>Select text, choose a color, then come back here to manage everything.</span>
        </div>
      `;
      renderInspector();
      syncSelectedHighlightUi();
      return;
    }

    state.ui.sidebarList.innerHTML = visibleHighlights
      .map((highlight) => {
        const isSelected = highlight.id === state.selectedHighlightId;
        const metaBits = [shared.formatRelativeTime(highlight.createdAt)];

        if (highlight.pageKey !== state.pageKey) {
          metaBits.push(highlight.siteLabel || "another page");
        }

        return `
          <article class="wh-card ${isSelected ? "is-selected" : ""}" data-highlight-card="${highlight.id}" style="--wh-card-accent:${shared.colorHex(
            highlight.color
          )}">
            <button type="button" class="wh-card__summary" data-action="select-highlight" data-id="${highlight.id}">
              <span class="wh-card__title">${shared.escapeHtml(highlightLabel(highlight))}</span>
              <span class="wh-card__meta">${shared.escapeHtml(metaBits.join(" • "))}</span>
            </button>
            <button type="button" class="wh-card__delete" data-action="delete-highlight" data-id="${highlight.id}" aria-label="Delete highlight">Delete</button>
          </article>
        `;
      })
      .join("");

    renderInspector();
    syncSelectedHighlightUi();
  }

  async function rerenderPageHighlights() {
    state.restoreVersion += 1;
    const restoreVersion = state.restoreVersion;
    state.pageKey = shared.getPageKey(globalScope.location.href);
    state.pageUrl = state.pageKey;
    state.pageHighlights = (await storage.getHighlightsForPage(state.pageUrl)).sort(
      (left, right) => left.startOffset - right.startOffset || left.createdAt - right.createdAt
    );

    if (restoreVersion !== state.restoreVersion) {
      return;
    }

    removeInjectedHighlights();

    if (!state.sitePrefs.disabled) {
      state.pageHighlights.forEach((highlight) => applyStoredHighlight(highlight));
    }

    if (!state.allHighlights.some((highlight) => highlight.id === state.selectedHighlightId)) {
      state.selectedHighlightId = null;
    }

    renderSidebar();
  }

  async function refreshAllHighlights() {
    state.allHighlights = await storage.getAllHighlights();
    state.siteColor = await storage.getSiteColor(getCurrentOrigin());
    state.sitePrefs = await storage.getSitePrefs(getCurrentOrigin());
    syncToolbarColors();

    await rerenderPageHighlights();
  }

  async function createHighlightFromSelection(color) {
    if (state.sitePrefs.disabled) {
      showToast("Highlighting is disabled on this site.");
      return;
    }

    const range = getCurrentSelectionRange();
    if (!range) {
      showToast("Select some text first.");
      return;
    }

    const payload = computeSelectionPayload(range);
    if (!payload) {
      showToast("This selection could not be highlighted.");
      return;
    }

    if (payload.overlap) {
      showToast("Overlapping highlights are not supported yet.");
      hideToolbar();
      return;
    }

    const highlight = {
      id: crypto.randomUUID(),
      pageKey: shared.getPageKey(globalScope.location.href),
      url: globalScope.location.href,
      title: document.title,
      siteLabel: shared.getSiteLabel(globalScope.location.href),
      color,
      text: payload.selectedText,
      note: "",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startOffset: payload.startOffset,
      endOffset: payload.endOffset,
      occurrence: payload.occurrence
    };

    payload.segments.forEach((segment) => wrapSegment(segment, highlight));
    await storage.createHighlight(highlight);
    await storage.setSiteColor(getCurrentOrigin(), color);
    state.selectedHighlightId = highlight.id;
    state.viewMode = "current";
    hideToolbar();
    clearSelection();
    await refreshAllHighlights();
    showToast("Highlight saved.");
  }

  function openSidebar() {
    if (!state.ui.sidebar) {
      return;
    }
    state.ui.sidebar.hidden = false;
  }

  function closeSidebar() {
    if (!state.ui.sidebar) {
      return;
    }
    state.ui.sidebar.hidden = true;
    closeModal();
  }

  function toggleSidebar() {
    if (state.ui.sidebar?.hidden) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }

  async function deleteHighlight(id) {
    await storage.deleteHighlight(id);
    if (state.selectedHighlightId === id) {
      state.selectedHighlightId = null;
    }
    await refreshAllHighlights();
    showToast("Highlight deleted.");
  }

  async function deletePageHighlights() {
    const count = state.allHighlights.filter((highlight) => highlight.pageKey === state.pageKey).length;
    if (!count) {
      showToast("This page has no highlights.");
      return;
    }

    if (!globalScope.confirm(`Delete ${pluralize(count, "highlight")} from this page?`)) {
      return;
    }

    await storage.deleteHighlightsForPage(state.pageUrl);
    if (selectedHighlight()?.pageKey === state.pageKey) {
      state.selectedHighlightId = null;
    }
    await refreshAllHighlights();
    showToast(`Deleted ${pluralize(count, "highlight")} from this page.`);
  }

  async function deleteEverything() {
    const count = state.allHighlights.length;
    if (!count) {
      showToast("There are no saved highlights.");
      return;
    }

    if (!globalScope.confirm(`Delete all ${pluralize(count, "highlight")} across every site?`)) {
      return;
    }

    await storage.deleteAllHighlights();
    state.selectedHighlightId = null;
    await refreshAllHighlights();
    showToast("All highlights deleted.");
  }

  async function updateHighlight(id, patch) {
    await storage.updateHighlight(id, patch);
    await refreshAllHighlights();
  }

  function scheduleNoteSave(id, note) {
    const key = `note:${id}`;
    const existing = state.noteTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timerId = setTimeout(async () => {
      state.noteTimers.delete(key);
      await updateHighlight(id, { note: shared.sanitizeNote(note) });
      showToast("Note saved.");
    }, 350);

    state.noteTimers.set(key, timerId);
  }

  function scheduleTagsSave(id, value) {
    const key = `tags:${id}`;
    const existing = state.noteTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timerId = setTimeout(async () => {
      state.noteTimers.delete(key);
      await updateHighlight(id, { tags: shared.sanitizeTags(value) });
      showToast("Tags saved.");
    }, 300);

    state.noteTimers.set(key, timerId);
  }

  function focusHighlight(id) {
    const highlight = state.allHighlights.find((item) => item.id === id);
    if (!highlight) {
      return;
    }

    if (state.selectedHighlightId === id) {
      clearSelectedHighlight();
      return;
    }

    state.selectedHighlightId = id;
    renderSidebar();
    openSidebar();

    const card = state.ui.sidebarList?.querySelector(`[data-highlight-card="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function exportHighlights(format) {
    const highlights = getFilteredHighlights();
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (!highlights.length) {
      showToast("No highlights to export in this view.");
      return;
    }

    if (format === "json") {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.json`,
        JSON.stringify(highlights, null, 2),
        "application/json"
      );
    } else if (format === "md") {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.md`,
        shared.toMarkdown(highlights),
        "text/markdown;charset=utf-8"
      );
    } else if (format === "csv") {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.csv`,
        shared.toCsv(highlights),
        "text/csv;charset=utf-8"
      );
    } else {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.txt`,
        shared.toPlainText(highlights),
        "text/plain;charset=utf-8"
      );
    }

    closeModal();
    showToast(`Exported ${pluralize(highlights.length, "highlight")}.`);
  }

  function openExternalUrl(url) {
    if (!url) {
      return;
    }

    globalScope.open(url, "_blank", "noopener,noreferrer");
  }

  function renderStatsModal() {
    const stats = shared.summarizeStats(state.allHighlights);
    const visible = getFilteredHighlights();
    const visibleStats = shared.summarizeStats(visible);
    const colorRows = shared.COLORS.map((color) => {
      const count = stats.colors[color.id] || 0;
      return `
        <div class="wh-modal__row">
          <span class="wh-modal__swatch" style="background:${color.hex}"></span>
          <span>${shared.escapeHtml(color.label)}</span>
          <strong>${count}</strong>
        </div>
      `;
    }).join("");

    state.ui.modalTitle.textContent = "Statistics";
    state.ui.modalBody.innerHTML = `
      <div class="wh-modal__stats-grid">
        <div class="wh-modal__stat"><strong>${visibleStats.total}</strong><span>Visible now</span></div>
        <div class="wh-modal__stat"><strong>${stats.total}</strong><span>Total saved</span></div>
        <div class="wh-modal__stat"><strong>${stats.pageCount}</strong><span>Pages</span></div>
        <div class="wh-modal__stat"><strong>${stats.tagCount}</strong><span>Tags</span></div>
      </div>
      <div class="wh-modal__section">
        <h4>Colors</h4>
        <div class="wh-modal__rows">${colorRows}</div>
      </div>
    `;
    state.ui.modalFooter.innerHTML = `
      <button type="button" class="wh-modal__button" data-action="close-modal">Close</button>
    `;
  }

  function renderExportModal() {
    const count = getFilteredHighlights().length;
    state.ui.modalTitle.textContent = "Export Highlights";
    state.ui.modalBody.innerHTML = `
      <p class="wh-modal__text">Export the ${pluralize(count, "highlight")} currently visible in this view.</p>
      <div class="wh-modal__action-grid">
        <button type="button" class="wh-modal__button" data-action="download-export" data-format="json">JSON</button>
        <button type="button" class="wh-modal__button" data-action="download-export" data-format="md">Markdown</button>
        <button type="button" class="wh-modal__button" data-action="download-export" data-format="csv">CSV</button>
        <button type="button" class="wh-modal__button" data-action="download-export" data-format="txt">Text</button>
      </div>
    `;
    state.ui.modalFooter.innerHTML = `
      <button type="button" class="wh-modal__button" data-action="close-modal">Cancel</button>
    `;
  }

  function renderSettingsModal() {
    state.ui.modalTitle.textContent = "Site Settings";
    state.ui.modalBody.innerHTML = `
      <p class="wh-modal__text">${shared.escapeHtml(shared.getSiteLabel(globalScope.location.href) || globalScope.location.hostname)}</p>
      <label class="wh-check-row">
        <input type="checkbox" id="wh-setting-disabled" ${state.sitePrefs.disabled ? "checked" : ""} />
        <span>Disable extension on this site</span>
      </label>
    `;
    state.ui.modalFooter.innerHTML = `
      <button type="button" class="wh-modal__button" data-action="close-modal">Cancel</button>
      <button type="button" class="wh-modal__button is-primary" data-action="save-settings">Save</button>
    `;
  }

  function openModal(type) {
    state.activeModal = type;

    if (type === "stats") {
      renderStatsModal();
    } else if (type === "export") {
      renderExportModal();
    } else if (type === "settings") {
      renderSettingsModal();
    }

    state.ui.modalBackdrop.hidden = false;
  }

  function closeModal() {
    state.activeModal = null;
    if (state.ui.modalBackdrop) {
      state.ui.modalBackdrop.hidden = true;
    }
  }

  async function saveSettingsFromModal() {
    const disabledInput = state.ui.modalBody.querySelector("#wh-setting-disabled");

    await storage.updateSitePrefs(getCurrentOrigin(), {
      disabled: Boolean(disabledInput?.checked)
    });

    await refreshAllHighlights();
    closeModal();
    showToast("Site settings saved.");
  }

  async function handleUiClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionElement = target.closest("[data-action]");
    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;
    const id = actionElement.dataset.id;

    if (action === "close-sidebar") {
      closeSidebar();
      return;
    }

    if (action === "clear-search") {
      state.ui.sidebarSearch.value = "";
      renderSidebar();
      return;
    }

    if (action === "set-view") {
      const view = actionElement.dataset.view;
      if (VIEW_MODES.includes(view)) {
        state.viewMode = view;
        renderSidebar();
      }
      return;
    }

    if (action === "toggle-color-filter") {
      const color = actionElement.dataset.color || "";
      state.colorFilter = state.colorFilter === color ? "" : color;
      renderSidebar();
      return;
    }

    if (action === "select-highlight" && id) {
      focusHighlight(id);
      return;
    }

    if (action === "delete-highlight" && id) {
      await deleteHighlight(id);
      return;
    }

    if (action === "delete-selected" && id) {
      await deleteHighlight(id);
      return;
    }

    if (action === "copy-selected" && id) {
      const highlight = state.allHighlights.find((item) => item.id === id);
      if (highlight) {
        const copied = await shared.copyText(highlight.text);
        showToast(copied ? "Highlight copied." : "Copy failed in this page context.");
      }
      return;
    }

    if (action === "open-source" && id) {
      const highlight = state.allHighlights.find((item) => item.id === id);
      if (highlight?.url) {
        openExternalUrl(highlight.url);
      }
      return;
    }

    if (action === "set-selected-color" && id) {
      const color = actionElement.dataset.color || shared.DEFAULT_COLOR;
      const highlight = state.allHighlights.find((item) => item.id === id);
      await updateHighlight(id, { color });

      if (highlight?.pageKey === state.pageKey) {
        await storage.setSiteColor(getCurrentOrigin(), color);
        state.siteColor = color;
      }

      showToast("Color updated.");
      return;
    }

    if (action === "open-stats") {
      openModal("stats");
      return;
    }

    if (action === "open-export") {
      openModal("export");
      return;
    }

    if (action === "open-settings") {
      openModal("settings");
      return;
    }

    if (action === "delete-page") {
      await deletePageHighlights();
      return;
    }

    if (action === "delete-all") {
      await deleteEverything();
      return;
    }

    if (action === "close-modal") {
      closeModal();
      return;
    }

    if (action === "download-export") {
      await exportHighlights(actionElement.dataset.format || "txt");
      return;
    }

    if (action === "save-settings") {
      await saveSettingsFromModal();
    }
  }

  function handleUiInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target === state.ui.sidebarSearch) {
      renderSidebar();
      return;
    }

    if (target.matches('[data-action="edit-note"]')) {
      scheduleNoteSave(target.dataset.id, target.value);
      return;
    }

    if (target.matches('[data-action="edit-tags"]')) {
      scheduleTagsSave(target.dataset.id, target.value);
    }
  }

  function handleSelectionChange() {
    if (state.sitePrefs.disabled) {
      hideToolbar();
      return;
    }

    const range = getCurrentSelectionRange();
    if (!range) {
      hideToolbar();
      return;
    }

    positionToolbar(range);
  }

  async function handleShortcut(event) {
    const isEditableTarget =
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || /^(input|textarea|select)$/i.test(event.target.tagName));

    if (isEditableTarget) {
      return;
    }

    const key = String(event.key || "").toLowerCase();

    if (event.altKey && key === "s") {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "h") {
      event.preventDefault();
      await createHighlightFromSelection(state.siteColor || shared.DEFAULT_COLOR);
      return;
    }

    if (key === "escape") {
      if (!state.ui.modalBackdrop?.hidden) {
        closeModal();
        return;
      }

      if (!state.ui.sidebar?.hidden) {
        closeSidebar();
      }
      hideToolbar();
      clearSelection();
      return;
    }

    if (key === "delete" && state.selectedHighlightId) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && /^(input|textarea)$/i.test(active.tagName)) {
        return;
      }
      await deleteHighlight(state.selectedHighlightId);
    }
  }

  async function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      hideToolbar();
      return;
    }

    if (target.closest("[data-web-highlighter-ui='true']")) {
      return;
    }

    const highlightElement = target.closest(".wh-highlight[data-wh-id]");
    if (highlightElement) {
      event.preventDefault();
      event.stopPropagation();
      focusHighlight(highlightElement.dataset.whId);
      return;
    }

    clearSelectedHighlight();
    hideToolbar();
  }

  async function handleToolbarClick(event) {
    const button = event.target instanceof HTMLElement ? event.target.closest(".wh-color-button") : null;
    if (!button) {
      return;
    }

    state.siteColor = button.dataset.color || shared.DEFAULT_COLOR;
    syncToolbarColors();
    await createHighlightFromSelection(button.dataset.color || shared.DEFAULT_COLOR);
  }

  async function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[shared.STORAGE_KEY]) {
      return;
    }
    await refreshAllHighlights();
  }

  function monitorLocationChanges() {
    setInterval(async () => {
      if (globalScope.location.href === state.lastKnownHref) {
        return;
      }

      state.lastKnownHref = globalScope.location.href;
      state.selectedHighlightId = null;
      hideToolbar();
      await refreshAllHighlights();
    }, 1000);
  }

  function scheduleRestoreRetries() {
    [600, 1600, 3200].forEach((delay) => {
      setTimeout(() => {
        void rerenderPageHighlights();
      }, delay);
    });

    globalScope.addEventListener(
      "load",
      () => {
        void rerenderPageHighlights();
      },
      { once: true }
    );
  }

  function bindEvents() {
    document.addEventListener("mouseup", () => setTimeout(handleSelectionChange, 0), true);
    document.addEventListener("keyup", () => setTimeout(handleSelectionChange, 0), true);
    document.addEventListener("keydown", handleShortcut, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("mouseover", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const element = target.closest(".wh-highlight[data-wh-id]");
      state.hoveredHighlightId = element?.dataset.whId || null;
    });

    state.ui.toolbar?.addEventListener("click", (event) => {
      void handleToolbarClick(event);
    });
    state.ui.root?.addEventListener("click", (event) => {
      void handleUiClick(event);
    });
    state.ui.root?.addEventListener("input", handleUiInput);
    state.ui.modalBackdrop?.addEventListener("click", (event) => {
      if (event.target === state.ui.modalBackdrop) {
        closeModal();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "web-highlighter/open-sidebar") {
        openSidebar();
        sendResponse({ ok: true });
      }
    });
  }

  async function init() {
    createUi();
    bindEvents();
    chrome.storage.onChanged.addListener(handleStorageChange);
    monitorLocationChanges();
    scheduleRestoreRetries();
    await refreshAllHighlights();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void init();
    });
  } else {
    void init();
  }
})(globalThis);
