(function attachWebHighlighterStorage(globalScope) {
  const shared = globalScope.WebHighlighterShared;
  const DEFAULT_DATA = {
    highlights: [],
    preferences: {
      siteColors: {},
      sitePrefs: {}
    }
  };

  function sanitizeHighlight(rawHighlight) {
    const highlight = rawHighlight || {};
    return {
      id: String(highlight.id || crypto.randomUUID()),
      pageKey: shared.getPageKey(highlight.pageKey || highlight.url || ""),
      url: String(highlight.url || ""),
      title: String(highlight.title || ""),
      siteLabel: String(highlight.siteLabel || shared.getSiteLabel(highlight.url || "")),
      color: shared.COLORS.some((item) => item.id === highlight.color) ? highlight.color : shared.DEFAULT_COLOR,
      text: String(highlight.text || ""),
      note: shared.sanitizeNote(highlight.note || ""),
      tags: shared.sanitizeTags(highlight.tags || []),
      createdAt: Number(highlight.createdAt || Date.now()),
      updatedAt: Number(highlight.updatedAt || Date.now()),
      startOffset: Number(highlight.startOffset || 0),
      endOffset: Number(highlight.endOffset || 0),
      occurrence: Number(highlight.occurrence || 0)
    };
  }

  function sanitizeData(rawData) {
    const data = rawData && typeof rawData === "object" ? rawData : {};
    const preferences = data.preferences && typeof data.preferences === "object" ? data.preferences : {};
    return {
      highlights: Array.isArray(data.highlights)
        ? data.highlights.map(sanitizeHighlight).sort((left, right) => left.createdAt - right.createdAt)
        : [],
      preferences: {
        siteColors:
          preferences.siteColors && typeof preferences.siteColors === "object" ? { ...preferences.siteColors } : {},
        sitePrefs:
          preferences.sitePrefs && typeof preferences.sitePrefs === "object" ? { ...preferences.sitePrefs } : {}
      }
    };
  }

  async function load() {
    const stored = await chrome.storage.local.get(shared.STORAGE_KEY);
    return sanitizeData(stored[shared.STORAGE_KEY] || DEFAULT_DATA);
  }

  async function save(data) {
    const sanitized = sanitizeData(data);
    await chrome.storage.local.set({ [shared.STORAGE_KEY]: sanitized });
    return sanitized;
  }

  async function getAllHighlights() {
    const data = await load();
    return data.highlights;
  }

  async function getHighlightsForPage(pageUrl) {
    const pageKey = shared.getPageKey(pageUrl || globalScope.location?.href || "");
    const data = await load();
    return data.highlights.filter((highlight) => highlight.pageKey === pageKey);
  }

  async function createHighlight(highlightInput) {
    const data = await load();
    const highlight = sanitizeHighlight(highlightInput);
    data.highlights.push(highlight);
    await save(data);
    return highlight;
  }

  async function updateHighlight(id, patch) {
    const data = await load();
    const index = data.highlights.findIndex((highlight) => highlight.id === id);

    if (index === -1) {
      return null;
    }

    data.highlights[index] = sanitizeHighlight({
      ...data.highlights[index],
      ...patch,
      updatedAt: Date.now()
    });

    await save(data);
    return data.highlights[index];
  }

  async function deleteHighlight(id) {
    const data = await load();
    const nextHighlights = data.highlights.filter((highlight) => highlight.id !== id);
    data.highlights = nextHighlights;
    await save(data);
    return true;
  }

  async function deleteHighlightsForPage(pageUrl) {
    const pageKey = shared.getPageKey(pageUrl || globalScope.location?.href || "");
    const data = await load();
    const removedCount = data.highlights.filter((highlight) => highlight.pageKey === pageKey).length;
    data.highlights = data.highlights.filter((highlight) => highlight.pageKey !== pageKey);
    await save(data);
    return removedCount;
  }

  async function deleteAllHighlights() {
    const data = await load();
    const removedCount = data.highlights.length;
    data.highlights = [];
    await save(data);
    return removedCount;
  }

  async function setSiteColor(origin, color) {
    const data = await load();
    data.preferences.siteColors[String(origin || "")] = shared.COLORS.some((item) => item.id === color)
      ? color
      : shared.DEFAULT_COLOR;
    await save(data);
    return data.preferences.siteColors[String(origin || "")];
  }

  async function getSiteColor(origin) {
    const data = await load();
    return data.preferences.siteColors[String(origin || "")] || shared.DEFAULT_COLOR;
  }

  async function getSitePrefs(origin) {
    const data = await load();
    const rawPrefs = data.preferences.sitePrefs[String(origin || "")] || {};
    return {
      disabled: Boolean(rawPrefs.disabled),
      hideToggle: Object.prototype.hasOwnProperty.call(rawPrefs, "hideToggle") ? Boolean(rawPrefs.hideToggle) : true
    };
  }

  async function updateSitePrefs(origin, patch) {
    const data = await load();
    const key = String(origin || "");
    const current = data.preferences.sitePrefs[key] || {};
    data.preferences.sitePrefs[key] = {
      disabled: Boolean(Object.prototype.hasOwnProperty.call(patch || {}, "disabled") ? patch.disabled : current.disabled),
      hideToggle: Boolean(Object.prototype.hasOwnProperty.call(patch || {}, "hideToggle") ? patch.hideToggle : current.hideToggle)
    };
    await save(data);
    return data.preferences.sitePrefs[key];
  }

  globalScope.WebHighlighterStorage = {
    createHighlight,
    deleteAllHighlights,
    deleteHighlight,
    deleteHighlightsForPage,
    getAllHighlights,
    getHighlightsForPage,
    getSiteColor,
    getSitePrefs,
    load,
    save,
    setSiteColor,
    updateSitePrefs,
    updateHighlight
  };
})(globalThis);
