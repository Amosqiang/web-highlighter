(function attachWebHighlighterShared(globalScope) {
  const STORAGE_KEY = "webHighlighterData";
  const DEFAULT_COLOR = "yellow";
  const COLORS = [
    { id: "yellow", label: "Yellow", hex: "#ffd84f" },
    { id: "green", label: "Green", hex: "#64d37b" },
    { id: "blue", label: "Blue", hex: "#4a8fe2" },
    { id: "pink", label: "Pink", hex: "#ed1f72" }
  ];

  function getPageKey(rawUrl) {
    try {
      const url = new URL(rawUrl || globalScope.location?.href || "");
      url.hash = "";
      return url.toString();
    } catch (error) {
      return String(rawUrl || "").split("#")[0];
    }
  }

  function getSiteLabel(rawUrl) {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function sanitizeTags(input) {
    if (Array.isArray(input)) {
      return Array.from(
        new Set(
          input
            .map((tag) => String(tag || "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 20)
        )
      );
    }

    return Array.from(
      new Set(
        String(input || "")
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20)
      )
    );
  }

  function sanitizeNote(note) {
    return String(note || "").slice(0, 500);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tokenizeQuery(query) {
    return String(query || "")
      .match(/"[^"]+"|\S+/g)?.map((token) => token.replace(/^"|"$/g, "")) || [];
  }

  function parseSearchQuery(query) {
    const filters = {
      terms: [],
      tag: [],
      site: [],
      color: [],
      text: [],
      note: [],
      from: null,
      to: null
    };

    tokenizeQuery(query).forEach((token) => {
      const [rawKey, ...rest] = token.split(":");
      const value = rest.join(":").trim();
      const key = rawKey.toLowerCase();

      if (!value) {
        filters.terms.push(token.toLowerCase());
        return;
      }

      if (key === "tag" || key === "site" || key === "color" || key === "text" || key === "note") {
        filters[key].push(value.toLowerCase());
        return;
      }

      if (key === "from" || key === "to") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          filters[key] = date;
          if (key === "to") {
            filters.to.setHours(23, 59, 59, 999);
          }
        }
        return;
      }

      filters.terms.push(token.toLowerCase());
    });

    return filters;
  }

  function matchesHighlight(highlight, query) {
    const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
    const haystack = [
      highlight.text,
      highlight.note,
      highlight.title,
      highlight.url,
      highlight.siteLabel,
      ...(highlight.tags || [])
    ]
      .join("\n")
      .toLowerCase();

    if (parsed.tag.length && !parsed.tag.every((tag) => (highlight.tags || []).includes(tag))) {
      return false;
    }

    if (parsed.site.length) {
      const siteHaystack = `${highlight.siteLabel || ""} ${highlight.url || ""}`.toLowerCase();
      if (!parsed.site.every((site) => siteHaystack.includes(site))) {
        return false;
      }
    }

    if (parsed.color.length && !parsed.color.includes(String(highlight.color || "").toLowerCase())) {
      return false;
    }

    if (parsed.text.length) {
      const textHaystack = String(highlight.text || "").toLowerCase();
      if (!parsed.text.every((term) => textHaystack.includes(term))) {
        return false;
      }
    }

    if (parsed.note.length) {
      const noteHaystack = String(highlight.note || "").toLowerCase();
      if (!parsed.note.every((term) => noteHaystack.includes(term))) {
        return false;
      }
    }

    const createdAt = new Date(highlight.createdAt || 0);
    if (parsed.from && createdAt < parsed.from) {
      return false;
    }

    if (parsed.to && createdAt > parsed.to) {
      return false;
    }

    return parsed.terms.every((term) => haystack.includes(term));
  }

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(timestamp));
    } catch (error) {
      return String(timestamp || "");
    }
  }

  function formatShortDate(timestamp) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(new Date(timestamp));
    } catch (error) {
      return String(timestamp || "");
    }
  }

  function formatRelativeTime(timestamp) {
    const diffMs = Number(timestamp || 0) - Date.now();
    const absMs = Math.abs(diffMs);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const units = [
      { unit: "year", value: 1000 * 60 * 60 * 24 * 365 },
      { unit: "month", value: 1000 * 60 * 60 * 24 * 30 },
      { unit: "week", value: 1000 * 60 * 60 * 24 * 7 },
      { unit: "day", value: 1000 * 60 * 60 * 24 },
      { unit: "hour", value: 1000 * 60 * 60 },
      { unit: "minute", value: 1000 * 60 },
      { unit: "second", value: 1000 }
    ];

    for (const item of units) {
      if (absMs >= item.value || item.unit === "second") {
        return formatter.format(Math.round(diffMs / item.value), item.unit);
      }
    }

    return formatter.format(0, "second");
  }

  function toMarkdown(highlights) {
    return highlights
      .map((highlight) => {
        const tagLine = highlight.tags?.length ? `Tags: ${highlight.tags.join(", ")}` : "Tags: none";
        const noteLine = highlight.note ? `Note: ${highlight.note}` : "Note:";
        return [
          `## ${highlight.title || highlight.siteLabel || "Untitled page"}`,
          `- Site: ${highlight.siteLabel || "unknown"}`,
          `- URL: ${highlight.url || ""}`,
          `- Color: ${highlight.color || DEFAULT_COLOR}`,
          `- Saved: ${formatDate(highlight.createdAt)}`,
          `- ${tagLine}`,
          `- ${noteLine}`,
          "",
          `> ${String(highlight.text || "").replace(/\n/g, "\n> ")}`
        ].join("\n");
      })
      .join("\n\n");
  }

  function toPlainText(highlights) {
    return highlights
      .map((highlight) =>
        [
          highlight.title || highlight.siteLabel || "Untitled page",
          `URL: ${highlight.url || ""}`,
          `Color: ${highlight.color || DEFAULT_COLOR}`,
          `Saved: ${formatDate(highlight.createdAt)}`,
          `Tags: ${(highlight.tags || []).join(", ") || "none"}`,
          `Note: ${highlight.note || ""}`,
          `Text: ${highlight.text || ""}`
        ].join("\n")
      )
      .join("\n\n---\n\n");
  }

  function toCsvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function toCsv(highlights) {
    const header = ["id", "title", "site", "url", "color", "tags", "note", "text", "createdAt"];
    const rows = highlights.map((highlight) => [
      highlight.id,
      highlight.title,
      highlight.siteLabel,
      highlight.url,
      highlight.color,
      (highlight.tags || []).join("|"),
      highlight.note,
      highlight.text,
      new Date(highlight.createdAt || 0).toISOString()
    ]);

    return [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
  }

  async function downloadTextFile(filename, contents, mimeType) {
    const blob = new Blob([contents], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    if (chrome?.downloads?.download) {
      try {
        const downloadId = await chrome.downloads.download({
          url,
          filename,
          saveAs: true
        });
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return Boolean(downloadId);
      } catch (error) {
        // Fall back to anchor click if the downloads API fails.
      }
    }

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall back to the legacy selection approach below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = String(text || "");
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  function colorHex(colorId) {
    return COLORS.find((color) => color.id === colorId)?.hex || COLORS[0].hex;
  }

  function summarizeStats(highlights) {
    const pages = new Set();
    const tags = new Set();
    const colors = {};

    highlights.forEach((highlight) => {
      if (highlight.pageKey) {
        pages.add(highlight.pageKey);
      }

      (highlight.tags || []).forEach((tag) => tags.add(tag));
      colors[highlight.color] = (colors[highlight.color] || 0) + 1;
    });

    return {
      total: highlights.length,
      pageCount: pages.size,
      tagCount: tags.size,
      colors
    };
  }

  globalScope.WebHighlighterShared = {
    STORAGE_KEY,
    DEFAULT_COLOR,
    COLORS,
    colorHex,
    copyText,
    downloadTextFile,
    escapeHtml,
    formatDate,
    formatRelativeTime,
    formatShortDate,
    getPageKey,
    getSiteLabel,
    matchesHighlight,
    parseSearchQuery,
    sanitizeNote,
    sanitizeTags,
    summarizeStats,
    toCsv,
    toMarkdown,
    toPlainText
  };
})(globalThis);
