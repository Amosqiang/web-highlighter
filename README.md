# Web Highlighter

Web Highlighter is a Chrome extension for saving text highlights directly on webpages. Highlights are stored locally in the current browser profile and restored when you revisit the page.

## What It Does

- Highlight selected text in 4 colors
- Save highlights automatically with `chrome.storage.local`
- Restore highlights on reload
- Add tags and notes to highlights
- Search highlights in the popup and sidebar
- Export highlights as JSON, Markdown, CSV, or plain text
- Open an on-page sidebar for filtering, reviewing, and deleting highlights

## Current UI

- Compact in-page color toolbar for quick highlighting
- Popup for cross-page browsing and export
- Sidebar with:
  - `All`, `This Page`, `Today`, `This Week` filters
  - Color filters
  - Search
  - Per-item delete
  - Bulk delete for current page or all saved highlights
  - Site settings

## Privacy

- No account required
- No cloud sync
- No external API calls
- All highlight data stays in local browser storage

## Install Locally

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder:

```text
/Users/amos/Documents/chrome/web highlighter
```

## How To Use

1. Select text on any supported webpage
2. Click one of the color buttons in the floating toolbar
3. Open the extension popup to review all saved highlights
4. Click `Open Sidebar` from the popup when you want the on-page sidebar

## Keyboard Shortcuts

- `Ctrl+Shift+H` / `Cmd+Shift+H`: highlight selection using the last color for the current site
- `Alt+S`: toggle the sidebar
- `Delete`: delete the currently selected highlight
- `Escape`: clear the current selection

## Project Structure

```text
.
|-- manifest.json
`-- src/
    |-- content.css
    |-- content.js
    |-- popup.css
    |-- popup.html
    |-- popup.js
    |-- shared.js
    `-- storage.js
```

## Technical Notes

- Manifest version: `v3`
- Permissions: `storage`, `tabs`, `downloads`
- Host access: `<all_urls>`
- Content scripts cannot run on restricted browser pages such as `chrome://*`
- Overlapping highlights are intentionally blocked to avoid broken page markup

## Status

This project is an independent replacement for an abandoned highlighter extension workflow. It is usable now, but still under active iteration on UI polish and edge-case handling.
