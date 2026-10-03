# Themes

Open **Settings → Appearance** from the toolbar popup or the floating panel.
Grok is the default: neutral surfaces and an adaptive black/white primary button.
The 12 presets change the accent; custom RGB colors also work. Choices are saved
locally and synchronized across open extension surfaces. Custom button text
automatically uses black or white, whichever has the higher contrast.

Accepted input: `rgb(29, 155, 240)`, `rgb(29 155 240)`, or `29, 155, 240`.
Channels must be integers between 0 and 255; alpha and arbitrary CSS are rejected.
Click **Apply color** to save a custom color. Click **Grok · Default** to reset.

Panels and inline controls on X follow its visible light, dim, or black background.
The toolbar popup, settings, and welcome page follow the system color scheme.

## CSS overrides

Public variables override the saved accent and built-in surface defaults. Set them
on `:root` for extension pages, or on the shadow hosts with a user stylesheet on X:

```css
x-video-downloader,
x-video-download-button {
  --xvd-accent: rgb(29, 155, 240);
  --xvd-on-accent: #000;
  --xvd-background: #fff;
  --xvd-input: #eff3f4;
  --xvd-ink: #0f1419;
  --xvd-line: #eff3f4;
}
```

| Variable             | Role                                     |
| -------------------- | ---------------------------------------- |
| `--xvd-accent`       | Primary actions, selection and progress  |
| `--xvd-on-accent`    | Text and icons on the accent background  |
| `--xvd-background`   | Panel and page background                |
| `--xvd-surface`      | Secondary surfaces and previews          |
| `--xvd-input`        | Input background and selected theme tile |
| `--xvd-ink`          | Main text and icon buttons               |
| `--xvd-muted`        | Secondary text                           |
| `--xvd-line`         | Dividers and panel outline               |
| `--xvd-control-line` | Input and secondary button borders       |
| `--xvd-hover`        | Neutral button hover background          |
| `--xvd-danger`       | Error text                               |
| `--xvd-shadow`       | Floating panel and launcher shadow       |

When overriding the accent in CSS, also set `--xvd-on-accent` to a readable color;
automatic foreground selection applies to colors saved through Settings.
Variables prefixed `--xvd-default-*` and `--xvd-theme-*` are internal fallbacks.
