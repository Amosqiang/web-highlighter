# Web Highlighter

This is a replacement Chrome extension for local text highlighting on any website.

## Features

- Highlight selected text in 4 colors
- Save highlights automatically with `chrome.storage.local`
- Restore highlights when the page is revisited
- Sidebar with search, tags, notes, recolor, copy, and delete
- Popup with cross-page browsing plus JSON, Markdown, CSV, and Text export
- Keyboard shortcuts handled in-page:
  - `Ctrl+Shift+H` / `Cmd+Shift+H`: highlight using the last color for this site
  - `Alt+S`: toggle the sidebar
  - `Delete`: delete the currently selected highlight
  - `Escape`: clear selection

## Load locally

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select this folder:
   - `/Users/amos/Documents/chrome`

## Notes

- All data is stored locally in the current Chrome profile.
- Overlapping highlights are intentionally blocked in this version to avoid corrupted markup.
- `chrome://` pages and some protected browser pages cannot be modified by content scripts.
