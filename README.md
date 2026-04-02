# SyncMark

 [![GitHub stars](https://img.shields.io/github/stars/11477872997/SyncMark?style=social)](https://github.com/11477872997/SyncMark)
 [![GitHub license](https://img.shields.io/github/license/11477872997/SyncMark)](https://github.com/11477872997/SyncMark/blob/main/LICENSE)

 项目地址 / Project URL: https://github.com/11477872997/SyncMark

 如果你觉得这个项目有用，欢迎到 GitHub 点个 Star 支持一下！

中文 | 简介
---
SyncMark 是一款轻量的浏览器书签同步扩展，支持将本地书签与远程托管（如 GitHub Gist / Gitee Gist）进行备份与恢复。插件核心追求简单、免费与隐私优先：所有个人 Token 仅保存在本地浏览器存储，不会上传到第三方服务器。

主要功能：
- 本地书签计数与未同步提醒
- 手动上传（本地 → 远程）和恢复（远程 → 本地）
- 支持 GitHub Gist 与 Gitee Gist（通过 Personal Access Token）
- 自动/定时同步配置
- 简洁的 UI 与本地化提示（中/英）

## 📖 使用说明

**快速开始（中文）**
1. 安装扩展：在 Chrome/Edge 扩展页面（chrome://extensions/ 或 edge://extensions/）开启”开发者模式”，点击”加载已解压的扩展程序”，选择本仓库根目录。
2. 打开扩展弹窗，点击”设置”填写 GitHub/Gitee 的 Personal Access Token（仅需 gist/gists 权限）。
3. 点击”保存配置”，保存会立即生效，后台会异步校验并更新远端信息。
4. 使用”本地同步到 GitHub/Gitee”或”GitHub/Gitee 同步到本地”按钮完成手动同步。

**📚 详细使用指南：[点击查看完整图文教程](./doc/使用指南.md)**

包含详细的安装步骤、Token 配置、同步操作和常见问题解答。

隐私与安全
- Token 只保存在浏览器本地存储（chrome.storage.local），不会发回本扩展的任何服务器。
- 强烈建议为 Token 设置最小权限（仅 gist/gists），并在不使用时撤销或删除 Token。

English | Overview
---
SyncMark is a lightweight browser extension that helps you back up and restore bookmarks using remote gist services such as GitHub Gist or Gitee Gist. It focuses on simplicity, free usage and local-first privacy: personal tokens are stored only in your local browser storage and are never sent to any third-party server operated by this project.

Key features:
- Local bookmark counting and unsynced reminders
- Manual upload (local → remote) and restore (remote → local)
- Support for GitHub Gist and Gitee Gist via Personal Access Token
- Configurable automatic/periodic sync
- Clean UI with Chinese and English hints

## 📖 How to use

**Quick Start (English)**
1. Install the extension: open Chrome/Edge extensions page (chrome://extensions/ or edge://extensions/), enable Developer Mode, click "Load unpacked" and select this repository's root folder.
2. Open the popup, click "Settings" and paste your GitHub/Gitee Personal Access Token (only gist/gists scope required).
3. Click "Save" — the UI will show immediate feedback and background validation will run asynchronously.
4. Use the "Upload to GitHub/Gitee" or "Download from GitHub/Gitee" buttons to perform manual sync operations.

**📚 Detailed Guide: [View Complete Tutorial](./doc/使用指南.md)** (Chinese)

Includes detailed installation steps, token configuration, sync operations and FAQ.

Privacy & Security
- Tokens are stored locally using chrome.storage.local and are not transmitted to any external servers.
- Create tokens with minimal scopes (gist/gists) and revoke them when they are no longer needed.

Developer notes
- Project structure (key files):
	- `popup.html`, `popup.js`, `popup.css` — the extension popup UI and logic
	- `background.js` — background script handling remote API calls and long-running tasks
	- `manifest.json` — extension manifest
	- `icons/` — extension icons
- To run locally: load unpacked extension as described above. When modifying code, reload the extension in the extensions page.
- This project expects a modern Chromium-based browser (Chrome, Edge).

Troubleshooting
- If "Save" seems slow: the extension now provides immediate UI feedback and runs remote checks in the background. If you still see delays, check the browser console for errors (right-click popup → Inspect).
- If remote sync fails: verify the token has gist/gists permission, and that your network allows requests to api.github.com or gitee.com.

Contributing
- 欢迎提交 Issues 和 Pull Requests。请遵循仓库的编码风格并附带可复现的描述。

License
- 本项目采用 MIT 许可证 (MIT)。

---

如果需要我可以把 README 翻译得更详细（例如添加界面截图、示例 Token 创建步骤、API 调用示例或自动化 CI 发布说明），告诉我你想要补充的部分。

