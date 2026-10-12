# 验证记录

日期：2026-10-12。验证对象为本地 HTML 设计预览与未修改的扩展基线。

## 设计预览

- Chromium 实际渲染六个视图：workspace、context、settings、welcome、states、details。
- 六个视图分别在 1440px 和 320px 视口检查；十二组结果均无文档级横向溢出。
- 十二组结果的无名称按钮数量均为 0（按可见文字或 `aria-label` 检查）。这是基础检查，不等于完整的可访问性审计。
- 全选结果为「已选 3 个」，HLS 视频未被计入。
- 取消全选后，批量下载按钮禁用。
- 搜索不存在的视频后，显示无匹配状态。
- 选择作者 `@slow_frames` 后，显示 2 条记录。
- 清理操作打开确认对话框；Esc 可关闭对话框。
- 目视检查下载面板、页内场景、设置、欢迎、异常状态与展开细节；修正底部裁切、单视频重复下载入口和欢迎示意图遮挡。

预览中的任务动作与设置持久化只显示演示提示。未执行真实下载，未验证 X 在线页面或 Firefox 内的扩展交互。生产版本仍需验证 Reka UI 的弹层定位、键盘顺序、Shadow DOM 事件边界与多语言长文案。

## 仓库检查

| 命令                 | 结果                 |
| -------------------- | -------------------- |
| `pnpm test`          | 123 项通过，0 失败   |
| `pnpm lint`          | 通过                 |
| `pnpm typecheck`     | 通过                 |
| `pnpm format:check`  | 通过                 |
| `pnpm build`         | Chrome MV3 构建通过  |
| `pnpm build:firefox` | Firefox MV3 构建通过 |

所有 pnpm 调用均将 `/Users/ntnyq/Library/pnpm/bin` 前置到原 PATH；除 typecheck 外通过 `rtk proxy` 执行。用户管理的 pnpm 实际报告 12.11.2，与 package.json 中的 12.10.1 有版本提示，但以上检查均成功。未修改 pnpm、运行时缓存或 packageManager 字段。

改动只新增 `docs/design/2026-10-redesign/` 设计资产。生成的 dist、.wxt、Playwright 中间输出均未作为本次交付源码。
