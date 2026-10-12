# 界面重构落地记录

2026-10-12，依据 `docs/design/2026-10-redesign/` 的设计图重构生产 Vue 界面。

## 页面与组件

- 工具栏弹窗和 X 页内面板共用 `SurfaceHeader`、`DownloadWorkspace`、`PageVideoList` 和 `BatchDownloadBar`。标题、标签页、全选与底部动作固定，列表独立滚动。
- `VideoPostCard` 保留作者、摘要、帖子勾选；`VideoMediaRow` 负责视频勾选、画质和单条下载。单视频帖子视图隐藏重复的行内下载按钮。
- `DownloadProgress` 同时用于对应视频的任务反馈与下载历史。状态、原帖、完整文件名、日期、进度和任务操作共用一套实现。
- `IconButton` 统一按钮尺寸、可访问名称、提示与焦点恢复；`EmptyState` 统一检测中、未连接、无视频与空记录的展示。
- `SettingsSection` 和 `HelpDisclosure` 统一设置分区与低频说明。欢迎页使用独立 `WelcomeGuide`，不再包含设置表单。
- `DialogConfirm` 基于 Reka UI AlertDialog，复用 `useOverlayTarget`。确认时快照记录 ID；失败保留弹窗及错误。清理只影响筛选范围内已结束的扩展记录。
- 保留五种语言、全部画质/并发选项、12 个主题及自定义 RGB。文件名恢复默认只修改草稿，显式保存后生效；离开未保存表单会触发浏览器提示。

## 截图

以下为实际生产构建在 Chromium 中渲染，扩展 API 和视频/任务数据使用本地模拟。

| 页面     | 截图                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| 下载面板 | [浅色](screenshots/redesign-popup.png)、[深色](screenshots/redesign-popup-dark.png) |
| 下载记录 | [记录与任务操作](screenshots/redesign-history.png)                                  |
| 设置     | [320px 窄屏](screenshots/redesign-settings-narrow.png)                              |
| 欢迎页   | [桌面](screenshots/redesign-welcome.png)                                            |

## 验证

- 123 项现有 Node 测试通过，包含下载边界、选择、队列、重复确认、偏好和生命周期覆盖。
- lint、类型检查、格式检查与 Chrome / Firefox 构建通过。
- Chromium 真实点击验证全选/清空、HLS 排除、批量提交保留画质、记录搜索与作者筛选、清理确认和筛选范围。
- 表单非法路径显示关联错误并聚焦输入；合法模板可保存。
- 320px 设置/欢迎页、360px 弹窗、1200px 欢迎页检查中，英文浅色/深色的八组布局均无文档横向溢出。
- 生产 content 脚本在本地帖子夹具中创建真实 Shadow DOM。画质菜单第一次 Esc 关闭菜单、第二次关闭面板并聚焦浮动入口；确认弹窗的 Esc 只关闭弹窗并聚焦触发按钮。
- 图标操作保留可访问名称，复选框通过标签或 aria-label 命名。触摸指针下图标按钮扩大至 44px。

未执行在线 X、真实文件下载或 Firefox 扩展交互验证；上述界面测试使用模拟浏览器 API，不能替代这些环境的实测。后台权限、下载域名和发送方/载荷校验未改动。
