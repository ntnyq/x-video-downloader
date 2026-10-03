# X Video Downloader

<img src="assets/images/downloader.svg" width="80" height="80" alt="X Video Downloader icon" />

A browser extension for downloading videos from X / Twitter, built with **WXT + Vue 3 + TypeScript + UnoCSS**.

## Features

- Automatically adds download buttons below video posts, with a persistent download button in the bottom-right corner.
- Lists videos detected on the current page in the toolbar popup, including multiple videos and GIFs stored as video.
- Downloads a single video with one click. Uses the best quality by default, with options to prefer 1080p, 720p, or smaller files. Portrait video resolution is measured by the shorter edge.
- Supports selecting all or individual videos from the same post for batch downloads, automatically excluding HLS-only videos.
- Custom filename templates with `{author}`, `{date}`, `{postId}`, `{index}`, and `{quality}`, plus instant previews and validation.
- Displays actual downloaded bytes, percentages, and completion or failure status, with cancellation and retry support.
- Uses the browser's download manager and saves directly to its download folder by default. Optionally prompts for a save location for each download. Duplicate filenames receive a numeric suffix automatically.
- Keeps videos associated with their original posts across dynamic loading, post navigation, and quoted posts. Captured data can be replayed regardless of script startup order.
- Opens or closes the download panel with `Alt + O`.
- Supports English, Simplified Chinese, Traditional Chinese, Japanese, and Korean, automatically following the browser's language.

## Installation and Usage

### Chrome / Edge

Requires Chromium 111 or later.

1. Run `pnpm install` and `pnpm build`.
2. Enable **Developer mode** on your browser's extensions page.
3. Select **Load unpacked** and load **`dist/chrome-mv3`**.
4. **Reload any open X pages** and play the video if needed.
5. For a single video, click **Download best quality**. For multiple videos, click **Select videos**, choose the videos, and download them together.
6. Click **Quality / progress** or **Download videos** in the bottom-right corner to view progress, cancel downloads, or retry them.

After updating the code, rebuild the extension, reload it on the extensions page, and refresh X. If an older prototype is enabled alongside this extension, duplicate buttons may appear; disable the older prototype.

`pnpm zip` creates an extension archive in `dist/` that can be extracted and loaded as an unpacked extension.

### Firefox

Requires Firefox 140 or later. Run `pnpm build:firefox`, then load `dist/firefox-mv3/manifest.json` at `about:debugging#/runtime/this-firefox` for temporary testing. Temporary extensions are removed when Firefox restarts. Distribution requires signing by Mozilla.

## How It Works

`capture.content.ts` runs in the MAIN world when the page starts loading. It only observes fetch / XHR responses initiated by X itself and extracts `video_info.variants` from post media data. It does not call X's private APIs or read or forward authentication tokens. No API key, backend, or third-party video extraction service is required.

The isolated content script validates these records and mounts the Vue interface inside a Shadow DOM to avoid affecting X's styles. Direct MP4 URLs exposed by the page's video player can serve as an additional source. When the user saves a video, the background script validates the sender, post ID, and download URL again before calling the native downloads API.

Detected videos are cached only in the current page's memory, with a limit of 250 posts. Quality, save location, and filename preferences are saved in local extension storage. To restore progress and support retries, the extension also stores the download IDs, video URLs, filenames, and post metadata for downloads it creates. Once the cleanup threshold is reached, older finished tasks are removed while active downloads are retained. Download history from other sources is neither read nor displayed.

While the panel is open, native download progress is polled once per second. When the total size is unknown, the interface shows downloaded bytes without inventing a percentage. Closing the panel or popup does not affect browser downloads already in progress. Single and batch downloads save directly to the browser's download folder by default. You can change this folder in browser settings (Chrome: `chrome://settings/downloads`). Batch downloads are created sequentially. Enabling **Choose a save location for each download** in the extension settings opens a separate dialog for each video; cancelling one does not prevent subsequent downloads. Updates preserve saved preferences. If a save dialog still appears for every download, turn this option off.

The `{date}` filename variable uses the post's UTC date. Missing authors and dates fall back to `unknown` and `undated`, respectively. The `.mp4` extension is added automatically, and the browser handles duplicate filenames.

Related official documentation: [WXT Content Scripts](https://wxt.dev/guide/essentials/content-scripts), [downloads.download](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download), [Firefox MAIN world](https://blog.mozilla.org/addons/2024/07/10/manifest-v3-updates-landed-in-firefox-128/), and [Firefox data collection declarations](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Permissions

| Permission / Site Scope                        | Purpose                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `downloads`                                    | Add selected MP4 files to the browser's download list                  |
| `storage`                                      | Save download preferences, filename templates, and extension task data |
| `activeTab`                                    | Identify the current tab when the popup or keyboard shortcut is used   |
| `https://*.x.com/*`, `https://*.twitter.com/*` | Inject video capture scripts and download buttons                      |

Downloads accept only MP4 URLs under `https://video.twimg.com/`. The template's all-site injection, `tabs`, `contextMenus`, and optional notification permissions have been removed. The Firefox manifest declares that no personal data is collected.

## Known Limitations and Troubleshooting

- Currently supports direct MP4 files. **HLS segments are not merged**, and live streams available only through HLS cannot be downloaded. The interface explains this when such a video is detected.
- A `blob:` URL is a temporary object URL used by the player, not a complete video download URL. The extension looks for the original MP4 in page responses.
- Requests completed before installation cannot be captured. Reload X after installing or updating the extension.
- If no videos are found, play the video and click **Scan again**. If there are still no results, reload the page.
- Restricted posts must already be accessible in your signed-in session. The extension does not bypass access restrictions.
- X's response formats and page structure are not stable interfaces. Changes may require updates to the parser and selectors.
- Actual progress is displayed once a download task is created. Retrying a failed download reuses the original video URL. If it has expired, reload the original post and scan again. Tasks marked **Paused** can be cancelled in the panel; use the browser's download manager to resume them.

## Languages and Icon

| Language            | Locale  |
| ------------------- | ------- |
| English             | `en`    |
| Simplified Chinese  | `zh_CN` |
| Traditional Chinese | `zh_TW` |
| Japanese            | `ja`    |
| Korean              | `ko`    |

All five languages cover the extension name, description, keyboard shortcut description, popup, post buttons, download panel, settings, welcome page, and application error messages. Language selection uses the browser's native [i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n) API, falling back to English for unsupported languages. After changing the browser's interface language, reopen extension pages and reload X. Original error codes returned by the browser are preserved for troubleshooting.

Translation source files are in `locales/`. To add a language, copy `en.yaml` and preserve all keys and placeholders such as `$1`. Do not translate filename template variables. `pnpm test` checks translation keys, placeholders, document language declarations, and error message completeness.

The icon combines a dark rounded background, a white play symbol, and a blue download arrow. `assets/images/downloader.svg` is the single source file, and WXT automatically generates the PNG sizes required by browsers. The popup, download panel, settings, welcome page, and favicon share this icon.

## Development and Checks

Use the pnpm version pinned in `package.json`.

General sorting, deduplication, JSON parsing, byte formatting, and sequential batch tasks use `@ntnyq/utils`. Domain-specific functions handle video source and download request validation. When save dialogs are enabled, batch downloads prompt for one video at a time and continue with subsequent videos after a cancellation or failure.

```sh
pnpm dev
pnpm dev:firefox

pnpm test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

Tests use the existing `tsx` dependency and Node.js's built-in test runner, with no additional test framework. Coverage includes URL and message validation, startup of the actual capture entrypoint, preserving fetch response bodies, replay across scripts, nested quoted posts, authors and dates, multiple videos, quality selection, filename safety, batch requests, HLS fallback behavior, download progress recovery, cancellation, retries, and partial failures.

Localization changes were also checked locally with mocked browser APIs: saving settings and validating filenames in Japanese, batch selection and download feedback in Korean, and the Traditional Chinese content panel at narrow widths. The following screenshots show mocked pages and do not establish that real X video downloads or behavior in Firefox have been verified.

![Japanese settings page](docs/screenshots/settings-ja.png)

![Korean download popup](docs/screenshots/popup-ko.png)

![Traditional Chinese content panel at a narrow width](docs/screenshots/content-zh-TW.png)

The built extension has been checked in a local browser using **mocked posts and browser APIs**, covering buttons, panels, one-click downloads, batch selection, quality preferences, filename validation and saving, progress recovery, cancellation, retries, error states, post navigation, settings, and the welcome page. Access to the target X page timed out, so **video downloads in a real signed-in session and behavior in Firefox still need verification**.

![Batch download panel on a locally mocked post](docs/screenshots/batch-progress-preview.png)

![Download preferences and filename template](docs/screenshots/settings-preview.png)

## License

[MIT](./LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq)
