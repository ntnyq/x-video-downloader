# HLS download feasibility

Assessment date: 2026-10-05. Status: evaluation complete; HLS downloading is not implemented.

## Decision

Keep the current release limited to direct HTTPS MP4 downloads from `video.twimg.com`. An HLS-only item remains visible with its unsupported-format explanation and cannot enter a download batch. Segment downloading and merging are technically feasible for a restricted set of unencrypted, completed videos, but require a separate pipeline, media permissions, storage limits, and real browser validation. Renaming a playlist or concatenating arbitrary segments into an `.mp4` file would not meet that requirement.

The proposed work below is a future implementation design. It does not change the current URL allowlist, add permissions or dependencies, or claim that X currently publishes any particular playlist shape.

## Current implementation boundary

- `entrypoints/capture.content.ts` observes JSON responses from page-initiated X/Twitter fetch and XHR requests. It excludes direct-message endpoints and forwards normalized post metadata. It does not initiate authenticated API requests.
- `utils/video.ts` recognizes a validated `.m3u8` variant only to set `VideoMedia.hasHls`. The actual playlist URL is discarded. `VideoMedia.variants` contains MP4 URLs only.
- `utils/download.ts` validates the runtime sender and each download request. `normalizeDownloadRequest()` calls `normalizeMediaUrl()` with its MP4 default, so an HLS URL cannot use the existing download message.
- `entrypoints/background/index.ts` delegates file transfer to `browser.downloads`. The native browser owns those transfers; the extension currently does not fetch or assemble media bytes.
- `wxt.config.ts` declares `storage`, `activeTab`, and `downloads`, with no `video.twimg.com` fetch permission or offscreen document permission. The configured minimum versions are Chrome 111 and Firefox 140.

These distinctions matter: a successful MP4 transfer does not demonstrate that extension-origin playlist fetching, media processing, or generated-file export works.

## Protocol constraints and proposed first scope

HLS separates master playlists, which describe variants and alternative renditions, from media playlists, which enumerate segments. `EXT-X-ENDLIST` marks the end; `EXT-X-PLAYLIST-TYPE:VOD` describes an immutable playlist. Relative URIs resolve against the playlist URL. fMP4 needs initialization data supplied through `EXT-X-MAP`; MPEG-TS is a different container. Audio can be supplied separately through rendition groups. Byte ranges, discontinuities, and encryption tags affect interpretation. See [RFC 8216, sections 3, 4, and 6](https://www.rfc-editor.org/rfc/rfc8216.html).

The following restrictions are product design choices, stricter than the protocol:

| Input                         | Proposed initial behavior                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completed on-demand video     | Require `EXT-X-ENDLIST`; accept an absent playlist type or `VOD`, reject `EVENT` and unfinished playlists. Never poll for new segments.                                                                                                                |
| Master playlist               | Choose one compatible variant using existing quality preferences; resolve one video media playlist and, when needed, one audio media playlist. Reject nested masters, cycles, missing groups, and ambiguous audio choices.                             |
| Direct media playlist         | Support only when media inspection establishes a compatible complete track set; never assume that a video-looking URL includes audio.                                                                                                                  |
| fMP4, H.264 with optional AAC | First prototype target. Validate initialization, track IDs, decode timestamps, duration, and fragment order before assembling a playable fragmented MP4.                                                                                               |
| MPEG-TS, H.264/AAC            | Later stage: demultiplex and remux to MP4. Appending TS bytes does not produce MP4. No transcoding.                                                                                                                                                    |
| Separate audio                | Later stage: choose a supported rendition, align timelines, and mux audio/video together. Reject in the first prototype rather than silently exporting a silent file.                                                                                  |
| Encrypted media               | Reject any encryption method other than `NONE`, session-key declarations, DRM signaling, and encrypted sample entries found in media bytes. Never request keys or license servers.                                                                     |
| Other features                | Initially reject byte ranges, discontinuities, changing initialization data, gaps, alternate codecs, I-frame-only variants, low-latency parts, and unknown tags that affect media interpretation. Ignore only explicitly classified harmless metadata. |

Synthetic fixtures can cover these branches without asserting that they describe actual X traffic. A later compatibility survey must use playlists already exposed by permitted public page responses, with query values redacted from retained reports.

## A separate job pipeline

1. Add a distinct HLS candidate type containing a validated source URL and post/media identity. Continue passive response observation; never search private APIs or synthesize guest/authentication tokens.
2. Add a separate versioned start message and strict validator. Preserve sender checks, bind jobs to a captured media identity, and keep MP4 validation unchanged. A page message must never become a general URL-fetch service.
3. Fetch a bounded playlist snapshot, resolve allowed child resources, and build an immutable job manifest. Select a rendition once; do not adapt quality while downloading.
4. Download approved resources through a small scheduler. Store completed segments in IndexedDB by job ID and sequence. Send only progress and job references across extension runtime messages, rather than duplicating segment buffers.
5. Inspect and remux inside a packaged worker owned by an extension document. Treat malformed media as an error. Produce an output only after every required track and segment is complete.
6. Let an extension document own the output Blob URL. The background validates that document and job, starts the native download, and records its download ID. Retain the Blob until completion or interruption, then revoke it and remove temporary data. User-provided `blob:` URLs remain invalid input.

Persist job state transitions such as `validating`, `fetching`, `assembling`, `saving`, `complete`, `interrupted`, and `canceled`. A restored job must reconcile its owner, persisted segments, and browser download ID before continuing. An absent owner or changed/expired source must produce a recoverable interruption, not success. Start the prototype with explicit restart support; resumable downloads require a later test matrix for snapshot identity and expired URLs.

## Network and resource controls

Extension-origin cross-origin fetching requires appropriate host access; content-script requests remain subject to the page's cross-origin restrictions. `activeTab` does not establish access to a separate media CDN. Chrome also recommends limiting what a content script can cause an extension to fetch. See [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

Proposed controls for any future implementation:

- Request only `https://video.twimg.com/*` as optional host access when the user starts the feature. A denied permission leaves MP4 downloads usable. Do not add wildcard CDN permissions based on playlist contents.
- Validate every master, child playlist, initialization resource, and segment after URL resolution: exact host, HTTPS, no embedded credentials, no custom port, and at most 8,192 characters. Use resource-specific validators; do not broaden the current MP4 validator.
- Start with `redirect: 'error'`. Checking the final response URL alone would happen after contacting a redirect target. If same-host redirects become necessary, introduce them only with a browser-tested mechanism that validates each destination before following it; otherwise retain rejection.
- Use `credentials: 'omit'` and no authentication headers. Preserve a captured CDN query only when necessary for the fetch, never log it, and remove it with job data. A 401/403 response ends the attempt; it does not trigger credential collection or API replay.
- Reject unexpected response status or media structure. Enforce streaming byte limits even when `Content-Length` is absent or incorrect. Do not load remote JavaScript, WASM, workers, or code from a playlist.

Initial engineering limits below are proposed acceptance limits, not performance measurements:

| Resource            | Initial limit                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Playlist bodies     | 1 MiB per decompressed response; at most one master and two selected media playlists                                                          |
| Playlist complexity | 32 variants, 32 renditions, 2,048 total selected segments; no recursive playlist graph                                                        |
| Duration and output | 30 minutes and 256 MiB of media input; separately stop output growth above 256 MiB                                                            |
| Transfers           | One assembly job, three segment requests at a time, two retries for transient failures only                                                   |
| Individual request  | 16 MiB segment/init body; 20-second request timeout; immediate shared abort on cancellation                                                   |
| Whole job           | 15-minute deadline including retries and assembly                                                                                             |
| Temporary storage   | 512 MiB across jobs, quota checked before writing, cleanup after success/cancel and on startup; stale interrupted data expires after 24 hours |
| In-flight buffers   | Target at most 64 MiB excluding browser-managed Blob storage; measure peak process memory before accepting the Blob export design             |

Retry only network failures and selected transient server statuses. Honor a bounded `Retry-After` without exceeding the deadline. Missing segments, invalid playlists, resource-limit errors, authentication failures, and unsupported formats are terminal. Limits apply to audio and video together. Quota failure must abort and clean up; do not request unlimited storage for the prototype.

## Chrome MV3 and Firefox execution

Chrome service workers can be terminated while idle or during long operations, and globals are lost on shutdown. Therefore the background should coordinate persisted jobs rather than own a long in-memory merge. See [Chrome service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Use a dedicated visible extension job page for the first cross-browser prototype. Its worker performs fetch/processing and its document owns output URLs. Closing the page interrupts unfinished work explicitly. This offers a clear lifecycle that can be tested in both browsers before promising background assembly.

A later Chrome adapter could use a bundled offscreen document with the `BLOBS` reason and the additional `offscreen` permission. Offscreen documents expose extension `runtime` messaging rather than the full extension API, and only one can be open per profile. `runtime.getContexts()` requires Chrome 116, so the existing Chrome 111 minimum needs the documented earlier discovery approach or an explicit minimum-version change. See [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

Firefox MV3 uses nonpersistent background event pages. Do not assume the Chrome offscreen architecture or a persistent Firefox background page. Retain the dedicated job page adapter until an equivalent lifecycle is demonstrated. Save state before acknowledging transitions and register background listeners synchronously. See [Firefox MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/).

## Dependency choices

| Candidate                           | Benefit                                                                                                                                                                             | Cost and decision                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded parser around `m3u8-parser` | Existing playlist parsing; [Apache-2.0 license](https://github.com/videojs/m3u8-parser/blob/main/LICENSE).                                                                          | Parsing alone provides neither network safety nor supported-feature enforcement. Prototype behind a strict schema and input limits; retain license/notice files as applicable.                                                                                                                                              |
| `mux.js`                            | Provides [MPEG-TS to fMP4 transmuxing utilities](https://github.com/videojs/mux.js/blob/main/README.md); [Apache-2.0 license](https://github.com/videojs/mux.js/blob/main/LICENSE). | Candidate for the TS stage. It does not replace playlist selection, audio alignment, durable jobs, or final-file validation. Measure bundled worker size and supported codec behavior.                                                                                                                                      |
| `ffmpeg.wasm`                       | Broader remuxing/transcoding capability.                                                                                                                                            | Defer. Its wrapper is MIT, while its core inherits FFmpeg and bundled-library licensing. It also introduces WASM startup, memory, packaging, and worker/CSP considerations. Audit the exact core build instead of assuming the wrapper license covers it. See the [upstream FAQ](https://ffmpegwasm.netlify.app/docs/faq/). |
| Small custom fMP4 path              | Potentially small first-stage bundle and narrow attack surface.                                                                                                                     | Only consider after fixtures establish a limited layout. Container validation, timestamps, and track compatibility remain substantial maintenance work; do not ship a generic concatenator.                                                                                                                                 |

No new dependency is selected by this assessment. Compare exact pinned candidate versions in an isolated prototype: compressed extension size delta, worker startup time, assembly time, peak memory, and playback/seeking correctness in both browsers. Package all executable code locally. A WASM candidate must also demonstrate a compatible extension CSP and, if threaded, the necessary isolation support. Document its full license inventory before adoption.

## Staged acceptance criteria

| Stage                      | Required evidence before proceeding                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Current release        | Existing MP4 security and HLS-only UI tests continue to pass. No HLS URL reaches native downloads; no media permissions or processing dependencies are added. This assessment completes the roadmap's feasibility item.                                                       |
| 1 — Offline prototype      | Owned synthetic unencrypted fMP4 fixtures produce seekable MP4 with correct duration and audio when present. Malformed, encrypted, unfinished, oversized, and unsupported playlists fail deterministically. Record dependency and memory measurements.                        |
| 2 — Bounded browser fetch  | Actual extension-origin fetching in Chrome and Firefox passes grant/deny, redirects, malicious relative URLs, timeout, cancellation, quota, and owner-close cases. Verify native saving and Blob cleanup in each browser.                                                     |
| 3 — Broader media coverage | TS and separate-audio fixtures pass timestamp, channel, duration, and A/V synchronization checks. Unsupported codecs or discontinuities remain explicit errors until individually tested.                                                                                     |
| 4 — Real X verification    | With legitimately accessible public videos, capture the source through normal page activity and verify download/playback. Exercise SPA navigation, popup closure, background restart, partial failure, retry, and output-file cleanup. Label unavailable cases as unverified. |
| 5 — Product enablement     | Review permission wording, privacy documentation, translations, bundle growth, and minimum-browser behavior using the recorded results. Enable only the supported subset; retain MP4 as the preferred path where available.                                                   |

## Current browser verification guidance

The assessment checked local executable availability only: Firefox 154.0 and Chrome 154.0.8037.95 are installed, and cached Playwright browser builds are present. No browser session, account, or live X response was inspected for this assessment. Installed browser availability is not evidence of successful extension operation.

Use an isolated temporary profile and the built Firefox extension through `about:debugging` → **This Firefox** → **Load Temporary Add-on**, selecting `dist/firefox-mv3/manifest.json`. Mozilla documents this workflow in [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). Test against a public post that is actually accessible without login. If X shows a login wall or fails to return media, record that limitation; do not replace the live result with a fixture and call it real X verification.

A controlled page with recorded or synthetic responses is useful for popup layout, Shadow DOM interactions, capture replay, and download-state tests. Report those as fixture-based browser checks. Firefox packaging, actual Firefox extension execution, real X response capture, and a saved playable file are separate evidence items.
