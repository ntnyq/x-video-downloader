# Pending release data

Store drafts at `docs/changelog/unreleased.yaml`, relative to the repository
root. The extension does not import this file.

```yaml
baseTag: v0.0.3
changes:
  - id: bundled-changelog
    type: changelogFeature
    messages:
      en: View release notes after updates or from Settings, in five languages.
      zh_CN: 更新后自动展示更新日志，也可从设置页查看，支持五种语言。
      zh_TW: 更新後自動顯示更新日誌，也可從設定頁查看，支援五種語言。
      ja: 更新後に更新履歴を表示し、設定画面からも確認できます。5言語に対応しています。
      ko: 업데이트 후 변경 내역을 표시하며 설정에서도 확인할 수 있습니다. 5개 언어를 지원합니다.
    paths:
      - entrypoints/background/index.ts
      - entrypoints/changelog/App.vue
      - components/video/ExtensionGuide.vue
    commits: []
```

- `baseTag`: verified release tag for the pending changes; use `null` only
  when there are no releases. Reconcile previously released items before
  changing an existing base.
- `id`: stable lowercase hyphenated name for the user-visible behavior,
  independent of the eventual version.
- `type`: `changelogFeature`, `changelogImprovement`, or `changelogFix`.
- `messages`: exactly `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, with non-empty
  plain text. Quote YAML scalars when punctuation requires it.
- `paths`: repository-relative changed paths supporting the note. Deleted paths
  may be evidence; inspect their diff instead of requiring them to exist.
- `commits`: verified IDs for history-derived notes. Uncommitted work uses an
  empty array and can be matched by paths and behavior later.

At release time, map each included `id` to a unique release translation key,
move its messages to the locale files, and add the key and type to the release's
changes. Only `version`, `date`, and `changes` belong in the runtime release
array; draft evidence stays outside it.
