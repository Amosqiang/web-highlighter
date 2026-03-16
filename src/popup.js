(function bootstrapPopup(globalScope) {
  const shared = globalScope.WebHighlighterShared;
  const storage = globalScope.WebHighlighterStorage;

  if (!shared || !storage) {
    return;
  }

  const state = {
    allHighlights: [],
    currentPageKey: null,
    mode: "all",
    search: ""
  };

  const elements = {
    results: document.getElementById("results"),
    search: document.getElementById("search"),
    status: document.getElementById("status"),
    stats: document.getElementById("stats"),
    openSidebar: document.getElementById("open-sidebar"),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
    exportButtons: Array.from(document.querySelectorAll("[data-export]"))
  };

  function setStatus(message) {
    if (!elements.status) {
      return;
    }

    elements.status.textContent = message || "";
    elements.status.hidden = !message;
  }

  async function detectCurrentPageKey() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        state.currentPageKey = shared.getPageKey(tab.url);
      }
    } catch (error) {
      state.currentPageKey = null;
    }
  }

  function getVisibleHighlights() {
    const scoped =
      state.mode === "current" && state.currentPageKey
        ? state.allHighlights.filter((highlight) => highlight.pageKey === state.currentPageKey)
        : state.allHighlights;

    return state.search ? scoped.filter((highlight) => shared.matchesHighlight(highlight, state.search)) : scoped;
  }

  function renderStats(highlights) {
    const stats = shared.summarizeStats(highlights);
    elements.stats.innerHTML = `
      <div class="stat"><strong>${stats.total}</strong><span>Visible</span></div>
      <div class="stat"><strong>${stats.pageCount}</strong><span>Pages</span></div>
      <div class="stat"><strong>${stats.tagCount}</strong><span>Tags</span></div>
    `;
  }

  function renderList() {
    const highlights = getVisibleHighlights().sort((left, right) => right.createdAt - left.createdAt);
    renderStats(highlights);

    if (!highlights.length) {
      elements.results.innerHTML = `
        <article class="empty">
          <p>No highlights found.</p>
          <span>Try a different filter or create a new highlight on the current page.</span>
        </article>
      `;
      return;
    }

    elements.results.innerHTML = highlights
      .map((highlight) => {
        const tags = (highlight.tags || []).map((tag) => `<span class="chip">${shared.escapeHtml(tag)}</span>`).join("");
        return `
          <article class="item" data-id="${highlight.id}">
            <div class="item__title">
              <div>
                <h2>${shared.escapeHtml(highlight.title || highlight.siteLabel || "Untitled page")}</h2>
              </div>
              <button type="button" data-action="open" data-id="${highlight.id}">Open</button>
            </div>
            <div class="item__meta">
              <p>${shared.escapeHtml(highlight.siteLabel || "")}</p>
              <p>${shared.escapeHtml(shared.formatDate(highlight.createdAt))}</p>
              <p>${shared.escapeHtml(highlight.color)}</p>
            </div>
            <div class="item__quote">${shared.escapeHtml(highlight.text)}</div>
            ${highlight.note ? `<div>${shared.escapeHtml(highlight.note)}</div>` : ""}
            <div class="chips">${tags}</div>
            <div class="item__actions">
              <button type="button" data-action="copy" data-id="${highlight.id}">Copy</button>
              <button type="button" data-action="delete" data-id="${highlight.id}" class="is-danger">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function refresh() {
    state.allHighlights = await storage.getAllHighlights();
    renderList();
  }

  async function exportHighlights(format) {
    const highlights = getVisibleHighlights();
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.json`,
        JSON.stringify(highlights, null, 2),
        "application/json"
      );
      return;
    }

    if (format === "md") {
      await shared.downloadTextFile(
        `web-highlights-${dateStamp}.md`,
        shared.toMarkdown(highlights),
        "text/markdown;charset=utf-8"
      );
      return;
    }

    if (format === "csv") {
      await shared.downloadTextFile(`web-highlights-${dateStamp}.csv`, shared.toCsv(highlights), "text/csv;charset=utf-8");
      return;
    }

    await shared.downloadTextFile(`web-highlights-${dateStamp}.txt`, shared.toPlainText(highlights), "text/plain;charset=utf-8");
  }

  async function handleClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const modeButton = target.closest("[data-mode]");
    if (modeButton) {
      state.mode = modeButton.dataset.mode || "all";
      elements.modeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.mode === state.mode);
      });
      renderList();
      return;
    }

    if (target.closest("#open-sidebar")) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          setStatus("No active tab.");
          return;
        }
        await chrome.tabs.sendMessage(tab.id, { type: "web-highlighter/open-sidebar" });
        globalScope.close();
      } catch (error) {
        setStatus("Sidebar is unavailable on this page.");
      }
      return;
    }

    const exportButton = target.closest("[data-export]");
    if (exportButton) {
      await exportHighlights(exportButton.dataset.export);
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const id = actionButton.dataset.id;
    const highlight = state.allHighlights.find((item) => item.id === id);
    if (!highlight) {
      return;
    }

    if (actionButton.dataset.action === "copy") {
      await shared.copyText(highlight.text);
      return;
    }

    if (actionButton.dataset.action === "open") {
      await chrome.tabs.create({ url: highlight.url });
      return;
    }

    if (actionButton.dataset.action === "delete") {
      await storage.deleteHighlight(id);
      await refresh();
    }
  }

  async function init() {
    await detectCurrentPageKey();
    await refresh();

    elements.search.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      renderList();
    });

    document.addEventListener("click", (event) => {
      void handleClick(event);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[shared.STORAGE_KEY]) {
        void refresh();
      }
    });
  }

  void init();
})(globalThis);
