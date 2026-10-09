# X Video Downloader

<img src="assets/images/downloader.svg" width="80" height="80" alt="X Video Downloader icon" />

> Save videos from X / Twitter as MP4 files, with quality selection, batch downloads, and a persistent queue.

Built with **WXT + Vue 3 + TypeScript + Tailwind CSS + shadcn-vue**. Supports English, 简体中文, 繁體中文, 日本語, and 한국어.

## 📦 Install

[**Install from the Chrome Web Store**][chrome-store] · Chrome, Edge, and other Chromium browsers (111+)

[![Chrome Web Store version](https://img.shields.io/chrome-web-store/v/jpialchpmmppdegagfhibhmpfaocjiep?label=Chrome%20Web%20Store)][chrome-store]

After installing or updating, **reload any open X pages**.

<details>
<summary>Build from source · Chrome / Edge and Firefox</summary>

Use Node.js LTS and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm build
```

For **Chrome / Edge**, enable **Developer mode** on the browser's extensions page, select **Load unpacked**, and choose `dist/chrome-mv3`.

For **Firefox 140+**, run `pnpm build:firefox`, then load `dist/firefox-mv3/manifest.json` at `about:debugging#/runtime/this-firefox`. This is a temporary installation and is removed when Firefox restarts; permanent installation requires Mozilla signing.

After changing the source, rebuild, reload the extension, and refresh X. Disable older copies if duplicate download buttons appear.

Use `pnpm zip` or `pnpm zip:firefox` to create distributable archives in `dist/`.

</details>

## ✨ Features

- **Download where you browse** — use the button below a video post, the floating panel, or the toolbar popup. Press `Alt + O` to toggle the page panel.
- **Choose your quality** — download the best available MP4, prefer 1080p or 720p, save space, or choose a quality for each video. GIFs stored as video are saved as MP4.
- **Download in batches** — select videos across posts, with up to 100 videos per batch.
- **Manage your queue** — run 1–6 transfers at once (default: 3), follow progress, and pause, resume, cancel, or retry downloads.
- **Find past downloads** — search by filename, post ID, or author, filter by author, and get a reminder before downloading completed videos again.
- **Make it yours** — customize filename templates, save-location prompts, appearance, and the floating button's position. The interface follows your browser's language.

## 🚀 Quick Start

1. Open X and let a video load. Play it if needed.
2. Click **Download best quality** below the post for a single download.
3. For a batch, open **Select videos**, select the videos, and choose **Download selected videos**.
4. Open **Quality / progress**, the floating **Download videos** button, or the toolbar popup to choose quality and manage downloads.

Files go to your browser's download folder by default. Enable **Choose a save location for each download** in extension settings to choose a folder each time.

<details>
<summary>Selection, queue, and history</summary>

- **Page videos** shares selections across the page, post, and individual video checkboxes. Opening the panel from a post limits selection to that post until you choose **Show all**. Reduce selections above 100 before downloading.
- Manual quality choices apply to both individual and batch downloads. Portrait resolution is measured by the shorter edge. HLS-only entries stay visible but cannot be selected.
- Waiting tasks survive background restarts. Paused transfers release a queue slot; resuming waits for an available slot. Closing the panel does not stop downloads, and lowering concurrency leaves existing transfers running.
- **History & queue** is also available from the popup on non-X tabs. Controls only affect downloads created by this extension.
- **Clear finished records** removes records matching the current filters and their duplicate reminders. It keeps saved files, browser download history, and queued, active, or paused tasks. Individual finished records can also be removed.
- Duplicate reminders identify videos by post ID and media position, even when quality or URLs change. Confirming a repeat does not submit successful new downloads from the same selection again. Concurrent clicks reuse an existing active or queued task.

</details>

<details>
<summary>Filenames and save locations</summary>

Filename templates support `{author}`, `{date}`, `{postId}`, `{index}`, and `{quality}`, with instant previews and validation.

`{date}` uses the post's UTC date. Missing authors and dates become `unknown` and `undated`. The `.mp4` extension is added automatically, and duplicate filenames receive a numeric suffix from the browser.

Change the default download folder in your browser's settings. If save-location prompts are enabled, dialogs open one at a time; cancelling one does not prevent subsequent downloads. Updates preserve saved preferences.

</details>

## 📸 Preview

<details>
<summary>View the download panel and settings</summary>

These screenshots use mocked pages and browser APIs; they illustrate the interface rather than verify real X downloads or Firefox runtime behavior.

![Download panel on a mocked X page](docs/screenshots/shadcn-shadow-panel.png)

![Settings at a narrow width in dark mode](docs/screenshots/shadcn-settings-narrow-dark.png)

</details>

## 🔒 Privacy and Permissions

No API key, backend, or third-party video extraction service is required. Preferences and extension download records stay in local storage. Download requests accept only HTTPS MP4 URLs on `video.twimg.com`.

Read the [privacy policy](docs/PRIVACY.md) for details.

<details>
<summary>Permissions and how video detection works</summary>

| Permission / Site scope                        | Purpose                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `downloads`                                    | Save selected MP4 files with the browser's download manager          |
| `storage`                                      | Save preferences, filename templates, and extension download records |
| `activeTab`                                    | Identify the current tab for the popup or keyboard shortcut          |
| `https://*.x.com/*`, `https://*.twitter.com/*` | Detect videos and add download controls on X / Twitter               |

The capture script observes fetch / XHR responses already initiated by X and extracts video variants. It does not call X's private APIs or read or forward authentication tokens. Direct MP4 URLs exposed by the page's video player can also be used.

The isolated content script validates captured records and mounts the Vue interface inside a Shadow DOM. The background script validates the sender, post ID, and download URL again before using the browser's downloads API.

Detected videos stay in the current page's memory, limited to 250 posts. Local storage retains preferences, the floating button's position, the newest 200 finished download records, and up to 1,000 queued, paused, or active tasks. Records include video URLs, filenames, and post metadata to restore progress and support retries. Downloads from other sources are neither read nor displayed.

While a panel is open, progress is polled once per second. When the total size is unknown, the interface shows downloaded bytes without a percentage.

</details>

## 💡 Troubleshooting

**No videos found?** Play the video and choose **Scan again**. If it still does not appear, reload X: requests completed before installation cannot be captured.

**HLS-only video?** Only direct MP4 downloads are supported. HLS segments and HLS-only live streams cannot be merged or downloaded.

<details>
<summary>More limitations and recovery tips</summary>

- A `blob:` URL belongs to the player and is not a complete video download URL. The extension looks for the original MP4 in page responses.
- Restricted posts must already be accessible in your signed-in session. The extension does not bypass access restrictions.
- X may change response formats or page structure, requiring parser or selector updates.
- Retry uses the original video URL. If it has expired, reload the original post and scan again.
- A task marked **Paused** can be resumed or cancelled from the panel.
- If the background stops during an uncertain native download handoff, the task fails with `START_INTERRUPTED`. Check the browser's download list before retrying to avoid a duplicate transfer.
- See the [HLS feasibility notes](docs/hls-feasibility.md) for future implementation considerations.

</details>

## 🛠️ Development

<details>
<summary>Development commands and checks</summary>

Use Node.js LTS and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
pnpm dev:firefox
```

Before submitting changes, run:

```sh
pnpm test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

Tests use `node:test`, `node:assert/strict`, and `tsx`. Coverage includes video capture and parsing, URL and message validation, queue recovery, concurrency, batching, duplicate reminders, history cleanup, filename safety, localization, and download lifecycle behavior.

For UI changes, check popup and content interactions at narrow widths. Distinguish mocked browser checks from real signed-in X downloads and Firefox runtime verification.

</details>

<details>
<summary>Translations and shared assets</summary>

Translations live in `locales/`: `en`, `zh_CN`, `zh_TW`, `ja`, and `ko`. The extension uses the browser's language and falls back to English. After changing the browser's interface language, reopen extension pages and reload X.

To add a language, copy `locales/en.yaml`, keeping all keys and placeholders such as `$1`. Do not translate filename template variables. Tests check translation keys, placeholders, document language declarations, and error message completeness. Browser error codes are preserved for troubleshooting.

`assets/images/downloader.svg` is the icon source; WXT generates the required PNG sizes. General utilities use `@ntnyq/utils`, while domain-specific functions handle video source and download request validation.

</details>

## 📄 License

[MIT](./LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq)

[chrome-store]: https://chromewebstore.google.com/detail/x-video-downloader/jpialchpmmppdegagfhibhmpfaocjiep
