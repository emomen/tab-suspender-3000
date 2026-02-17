# Window & Tab Manager (Chrome extension)

This small Chrome extension lists all browser windows and their tabs, lets you check windows or individual tabs, and suspend (discard) checked tabs.

Installation

1. Open `chrome://extensions` (or `edge://extensions` in Edge).
2. Enable "Developer mode".
3. Click "Load unpacked" and select this folder.

Usage

- Click the extension icon to open the UI in a new tab.
- Use "Refresh" to reload the list of windows and tabs.
- Check windows to select/deselect all their tabs, or check individual tabs.
- Click "Suspend selected" to discard (suspend) the checked tabs.

Permissions

The extension uses the `tabs` and `windows` permissions to list tabs and to call `chrome.tabs.discard()`.

Notes

- Suspending a tab with `chrome.tabs.discard()` unloads its content but leaves the tab visible in the browser.
- Some tabs (e.g., the active tab in the active window) may not be discardable by the browser.
