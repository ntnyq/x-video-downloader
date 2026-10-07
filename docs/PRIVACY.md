# Privacy Policy / 隐私政策

X Video Downloader / X 视频下载器  
Last updated / 最后更新：2026-10-05

## English

### What the extension does

X Video Downloader is an independent browser extension maintained by ntnyq. It helps you save MP4 videos from X / Twitter posts you can already access. It does not bypass login or access restrictions.

### Information processed on your device

The extension processes information from the current X / Twitter page to find videos and provide download controls. This includes the page or post URL, post ID, post text, the author's username, the post's creation date when available, media identifiers, MP4 URLs, resolutions, bitrates, and the presence of HLS variants. Author usernames may identify individuals. The extension does not use them to identify or profile the person who installed the extension.

A script observes eligible responses to requests that the X page already makes. It does not make its own requests to X's private API. It extracts video-related post data and excludes direct-message API paths. A direct MP4 URL exposed by a page video player may also be used. The extension does not extract or store passwords, authentication cookies, or login tokens.

Detected posts are held in page memory, with a cache of up to 250 posts. The extension does not create a general history of websites you visit.

### Information stored locally

The extension uses local extension storage for your preferred quality, concurrency limit, save-location prompt preference, filename template, and appearance setting. It also stores records of downloads it initiated: queue identifiers, task creation times, queue states, byte counts, browser download IDs, requested filenames, video URLs, post IDs, media indexes, and author/date metadata when available. These records reflect download actions you requested and allow history search, duplicate reminders, queue restoration, pause/resume, cancellation, and retry after the background service worker restarts.

The extension queries the browser for the state, filename, and byte counts of its own recorded download IDs. It does not enumerate or display unrelated browser download history. Settings and records are not synchronized through the extension's storage.sync API.

### Network requests and sharing

The extension has no developer-operated data collection server and contains no advertising or analytics tracking. It does not upload post information, local preferences, or download records to the developer or to third-party parsing/download services. The developer does not sell this data or use it for advertising, profiling, or credit decisions.

When you request a download, the browser connects directly to video.twimg.com over HTTPS to retrieve the selected MP4. As with a normal connection, the destination receives the requested URL and network information such as your IP address, along with any request metadata the browser sends. X handles those requests under its own policies. Opening X or a post link from the extension also navigates to X. The extension does not add authentication credentials extracted from the page to download requests.

Downloaded files are stored in the location selected by you or your browser. Normal browser download history is managed by the browser separately from the extension's local records.

### Retention and deletion

In-memory detected-post data is discarded when the page is reloaded or closed. Local preferences and download records can remain across browser sessions. The extension retains the newest 200 finished records alongside up to 1,000 queued, active, or paused tasks; older finished records are automatically removed. This is a count-based cleanup mechanism, not a fixed time-based expiration.

You can search and clear finished records under History & queue. Clearing records does not delete saved files or native browser history, and removed records no longer trigger duplicate-download reminders. You can change preferences in Settings. Removing the extension removes its local extension storage through the browser. Removing the extension does not delete downloaded video files, erase the browser's own download history, or necessarily stop a download already handled by the browser. Manage those separately using your file manager and browser download controls. Clearing browser download history is not a substitute for clearing extension storage.

### Limited use and security

The extension uses the information described above only to provide its video detection, saving, customization, and download management features. Its use of information received from Google APIs follows the Chrome Web Store User Data Policy, including the Limited Use requirements. It does not sell or transfer user data for unrelated purposes or use it to determine creditworthiness or eligibility for lending.

Download requests are validated to accept only HTTPS MP4 URLs on video.twimg.com. Local data is stored using browser extension storage; the extension does not add its own encryption layer to that storage. Access to your browser profile and downloaded files depends on your device and browser security.

### Changes and contact

This policy may be updated when the extension's behavior changes. The revision date appears above. For questions about privacy or data handling, contact the developer through the Support section of this extension's Chrome Web Store listing. Do not post passwords, authentication tokens, or private post contents in public support messages.

## 简体中文

### 扩展用途

X 视频下载器是由 ntnyq 维护的独立浏览器扩展，用于保存你已有权限访问的 X / Twitter 帖子中的 MP4 视频，不绕过登录或访问限制。

### 在设备上处理的信息

扩展读取当前 X / Twitter 页面中的视频相关信息，以检测视频并提供下载入口，包括页面或帖子链接、帖子 ID、帖子文字、作者用户名、可用的发帖日期、媒体 ID、MP4 地址、分辨率、码率和是否存在 HLS 版本。作者用户名可能识别个人；扩展不会据此识别安装者或建立安装者画像。

捕获脚本观察 X 页面本身已发起请求的符合条件的响应，不自行请求 X 私有 API，只提取视频相关帖子信息，并排除直接消息 API 路径。页面播放器暴露的直接 MP4 地址也可能作为补充来源。扩展不提取或保存密码、认证 Cookie 或登录令牌。

已检测帖子保存在当前页面内存中，最多缓存 250 条，不建立全站浏览历史。

### 本地保存的信息

扩展在本地扩展存储中保存画质偏好、并发数量、是否每次选择保存位置、文件名模板和外观设置。还会保存本扩展发起的下载记录，包括队列标识、任务创建时间、队列状态、字节数、浏览器下载 ID、请求的文件名、视频 URL、帖子 ID、视频序号以及可用的作者和日期信息。这些记录反映你发起的下载操作，用于搜索记录、重复下载提醒、后台服务重启后恢复队列及进度、暂停、继续、取消和重试。

扩展只按自身记录的下载 ID 向浏览器查询状态、文件名和字节数，不遍历或显示其他来源的下载历史。设置和任务记录不会通过扩展的 storage.sync API 同步。

### 网络请求与信息共享

扩展没有开发者运营的数据收集服务器，不包含广告或分析追踪。不将帖子信息、偏好或下载记录上传给开发者或第三方解析、下载服务；开发者不出售这些数据，也不将其用于广告、画像或信贷决策。

你点击下载后，由浏览器通过 HTTPS 直接连接 video.twimg.com 获取 MP4。与普通网络连接相同，目标服务器会接收请求 URL、IP 地址等网络信息以及浏览器发送的请求元数据。X 根据其自身政策处理这些请求。从扩展打开 X 或帖子链接也会导航到 X。扩展不会从页面提取认证凭据并添加到下载请求中。

视频文件保存到你或浏览器选择的位置。浏览器自身的下载历史由浏览器独立管理，不等同于扩展的本地任务记录。

### 保存期限与删除

刷新或关闭页面后，页面内存中的帖子缓存会被释放。本地设置和下载记录可能跨浏览器会话保留。扩展保留最新 200 条已结束记录及最多 1,000 个等待、下载中或暂停的任务，较早的已结束记录会自动清理。这是按数量触发的清理，不是按固定天数到期。

你可以在“记录与队列”中搜索和清理已结束的记录。清理记录不会删除已保存文件或浏览器下载历史，被清理的记录也不再触发重复下载提醒。你可以在设置页修改偏好。卸载扩展会通过浏览器移除该扩展的本地存储，但不会删除已下载视频、清除浏览器自身的下载历史，也不一定会终止已经交给浏览器执行的下载。请分别使用文件管理器及浏览器下载管理功能处理这些内容。清除浏览器下载历史不等于清除扩展存储。

### 有限使用与安全

上述信息仅用于视频检测、保存、设置定制和下载管理。扩展对从 Google API 获得信息的使用遵循 Chrome Web Store 用户数据政策及有限使用要求，不为无关用途出售或转让数据，不用于判断信用状况或贷款资格。

下载请求经过校验，只接受 video.twimg.com 的 HTTPS MP4 地址。本地数据使用浏览器扩展存储保存，扩展未额外实现存储加密。浏览器配置及下载文件的访问保护依赖你的设备和浏览器安全措施。

### 更新与联系

当扩展行为发生变化时，本政策可能更新，修订日期见文首。如有隐私或数据处理问题，请通过本扩展 Chrome Web Store 页面中的支持入口联系开发者。请勿在公开支持信息中发布密码、认证令牌或私人帖子内容。
