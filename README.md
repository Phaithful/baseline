# Baseline Helper 

**Baseline Helper** is a **Manifest V3 Chrome Extension** that overlays an **evidence-driven assistant** on **Baseline rating workflows**.  
It’s designed to help you collect signals (e.g., search links, popularity data, references) and keep your rating process **consistent, fast, and well-documented**.

---

## Key Features

- **Baseline overlay UI** (in-page assistant experience)
- **Evidence capture** with sources + notes (e.g., YouTube, Spotify, Genius, Google, Apple Music)
- **Best-effort popularity scraping**
  - Example signals: **top video views**, **monthly listeners**, **top result metadata**
- **Storage support** via `chrome.storage` for saving session/rating data
- **MV3 architecture** using a **service worker background script**
- **Scoped host permissions** for Baseline + supported sources

---

## How It Works (High Level)

1. You open **Baseline** in your browser.
2. The extension injects a **content script overlay** on Baseline pages.
3. The overlay can trigger helper logic (background/service worker + scripts).
4. The helper collects “signals” from supported sources and logs them as **evidence**:
   - Source name
   - Title/description of the signal
   - URL
   - Notes (e.g., extracted view count, listener count)

---

## Tech Stack

- **Chrome Extension** (Manifest V3)
- **TypeScript** 
- **Service Worker** background script
- Content scripts injected into Baseline pages

---

## Requirements

- **Google Chrome / Chromium-based browser**
- Developer mode enabled for loading unpacked extensions

---

## Installation (Load Unpacked)

1. Clone this repository:
   ```bash
   git clone https://github.com/Phaithful/baseline.git
   cd baseline-helper

   ```npm run build

2. Open Chrome Extensions page:

   Go to: chrome://extensions

3. Enable:

   Developer mode

3. Click:

   Load unpacked

   Select the project folder (where manifest.json is)

4. Pin the extension (optional):

   Click Extensions icon → Pin Apple Baseline Helper