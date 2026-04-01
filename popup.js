// popup.js - UI交互逻辑

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadBookmarkCount();
  await loadRemoteBookmarkCount();
  await loadSyncStatus();
  await loadAutoSyncStatus();
  await checkUnsyncedBookmarks();
  await loadConfigSettings();
  await loadUserInfo();
  setupEventListeners();

  // 监听书签变化
  chrome.bookmarks.onCreated.addListener(handleBookmarkChange);
  chrome.bookmarks.onRemoved.addListener(handleBookmarkChange);
  chrome.bookmarks.onChanged.addListener(handleBookmarkChange);
  chrome.bookmarks.onMoved.addListener(handleBookmarkChange);
});

// 加载书签数量
async function loadBookmarkCount() {
  try {
    const bookmarks = await chrome.bookmarks.getTree();
    const count = countBookmarks(bookmarks[0]);
    document.getElementById('bookmarkCount').textContent = count;
  } catch (error) {
    console.error('加载书签数量失败:', error);
    document.getElementById('bookmarkCount').textContent = '0';
  }
}

// 加载远程书签数量
async function loadRemoteBookmarkCount() {
  try {
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'githubGistId',
      'giteeGistId',
      'githubRemoteCount',
      'giteeRemoteCount'
    ]);

    // 显示/隐藏 GitHub 信息卡和按钮组
    const githubInfoItem = document.getElementById('githubInfoItem');
    const githubCountEl = document.getElementById('githubBookmarkCount');
    const githubSyncGroup = document.getElementById('githubSyncGroup');

    if (config.githubToken) {
      githubInfoItem.style.display = 'flex';
      githubCountEl.textContent = config.githubRemoteCount !== undefined ? config.githubRemoteCount : '-';
      githubSyncGroup.style.display = 'flex';
    } else {
      githubInfoItem.style.display = 'none';
      githubSyncGroup.style.display = 'none';
    }

    // 显示/隐藏 Gitee 信息卡和按钮组
    const giteeInfoItem = document.getElementById('giteeInfoItem');
    const giteeCountEl = document.getElementById('giteeBookmarkCount');
    const giteeSyncGroup = document.getElementById('giteeSyncGroup');

    if (config.giteeToken) {
      giteeInfoItem.style.display = 'flex';
      giteeCountEl.textContent = config.giteeRemoteCount !== undefined ? config.giteeRemoteCount : '-';
      giteeSyncGroup.style.display = 'flex';
    } else {
      giteeInfoItem.style.display = 'none';
      giteeSyncGroup.style.display = 'none';
    }
  } catch (error) {
    console.error('加载远程书签数量失败:', error);
  }
}

// 从远程获取书签数量
async function fetchRemoteBookmarkCount(platform) {
  try {
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'githubGistId',
      'giteeGistId'
    ]);

    const token = platform === 'github' ? config.githubToken : config.giteeToken;
    const gistId = platform === 'github' ? config.githubGistId : config.giteeGistId;

    if (!token || !gistId) {
      return;
    }

    // 发送消息到后台获取远程书签数据
    const response = await chrome.runtime.sendMessage({
      action: 'getRemoteBookmarkCount',
      platform: platform
    });

    if (response.success) {
      // 保存远程书签数量
      const storageKey = platform === 'github' ? 'githubRemoteCount' : 'giteeRemoteCount';
      await chrome.storage.local.set({ [storageKey]: response.count });

      // 更新显示
      const countEl = document.getElementById(platform === 'github' ? 'githubBookmarkCount' : 'giteeBookmarkCount');
      countEl.textContent = response.count;
    }
  } catch (error) {
    console.error(`获取${platform}远程书签数量失败:`, error);
  }
}

// 递归计算书签数量
function countBookmarks(node) {
  let count = 0;
  if (node.url) {
    count = 1;
  }
  if (node.children) {
    for (const child of node.children) {
      count += countBookmarks(child);
    }
  }
  return count;
}

// 加载同步状态
async function loadSyncStatus() {
  try {
    const result = await chrome.storage.local.get(['lastSyncTime', 'syncStatus']);

    // 更新同步时间
    if (result.lastSyncTime) {
      document.getElementById('lastSyncTime').textContent = formatTime(result.lastSyncTime);
    } else {
      document.getElementById('lastSyncTime').textContent = '从未同步';
    }

    // 更新同步状态
    const statusBadge = document.getElementById('statusBadge');
    const noticeText = document.getElementById('noticeText');

    if (result.syncStatus === 'success') {
      statusBadge.textContent = '同步成功';
      statusBadge.className = 'status-badge success';
      noticeText.textContent = '首次同步完成，已上传本书签至远端';
    } else if (result.syncStatus === 'error') {
      statusBadge.textContent = '同步失败';
      statusBadge.className = 'status-badge error';
      noticeText.textContent = '同步失败，请检查网络或配置';
    } else {
      statusBadge.textContent = '未同步';
      statusBadge.className = 'status-badge';
      noticeText.textContent = '请先在设置中配置同步方式';
    }
  } catch (error) {
    console.error('加载同步状态失败:', error);
  }
}

// 加载自动同步状态
async function loadAutoSyncStatus() {
  try {
    const result = await chrome.storage.local.get(['autoSync', 'syncInterval']);
    const autoSyncToggle = document.getElementById('autoSyncToggle');
    const autoSyncBadge = document.getElementById('autoSyncBadge');

    autoSyncToggle.checked = result.autoSync || false;

    const interval = result.syncInterval || 1440; // 默认每天
    if (interval === 60) {
      autoSyncBadge.textContent = '每小时';
    } else if (interval === 1440) {
      autoSyncBadge.textContent = '每天一次';
    } else {
      autoSyncBadge.textContent = `每${Math.floor(interval / 60)}小时`;
    }
  } catch (error) {
    console.error('加载自动同步状态失败:', error);
  }
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// 处理自动同步开关
async function handleAutoSyncToggle(event) {
  const enabled = event.target.checked;

  try {
    await chrome.storage.local.set({ autoSync: enabled });

    // 通知后台更新定时任务
    await chrome.runtime.sendMessage({
      action: 'updateAutoSync',
      enabled: enabled
    });

    console.log('自动同步已', enabled ? '启用' : '禁用');
  } catch (error) {
    console.error('更新自动同步状态失败:', error);
    event.target.checked = !enabled; // 恢复原状态
  }
}

// 检查未同步的书签
async function checkUnsyncedBookmarks() {
  try {
    const result = await chrome.storage.local.get(['lastSyncCount', 'lastSyncTime']);
    const bookmarks = await chrome.bookmarks.getTree();
    const currentCount = countBookmarks(bookmarks[0]);

    const unsyncBadge = document.getElementById('unsyncBadge');
    const unsyncCount = document.getElementById('unsyncCount');

    if (result.lastSyncCount !== undefined && result.lastSyncTime) {
      const diff = currentCount - result.lastSyncCount;

      if (diff > 0) {
        unsyncCount.textContent = `+${diff}`;
        unsyncBadge.style.display = 'block';

        // 更新提示文本
        const noticeText = document.getElementById('noticeText');
        noticeText.textContent = `有 ${diff} 个新书签未同步`;
      } else if (diff < 0) {
        unsyncCount.textContent = `${diff}`;
        unsyncBadge.style.display = 'block';

        const noticeText = document.getElementById('noticeText');
        noticeText.textContent = `有 ${Math.abs(diff)} 个书签已删除未同步`;
      } else {
        unsyncBadge.style.display = 'none';
      }
    } else {
      // 首次使用，显示所有书签未同步
      if (currentCount > 0) {
        unsyncCount.textContent = currentCount;
        unsyncBadge.style.display = 'block';

        const noticeText = document.getElementById('noticeText');
        noticeText.textContent = `有 ${currentCount} 个书签待首次同步`;
      }
    }
  } catch (error) {
    console.error('检查未同步书签失败:', error);
  }
}

// 处理书签变化
async function handleBookmarkChange() {
  await loadBookmarkCount();
  await checkUnsyncedBookmarks();
}

// 加载配置设置
async function loadConfigSettings() {
  try {
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'syncInterval'
    ]);

    // 设置 GitHub Token
    if (config.githubToken) {
      document.getElementById('githubTokenInput').value = config.githubToken;
    }

    // 设置 Gitee Token
    if (config.giteeToken) {
      document.getElementById('giteeTokenInput').value = config.giteeToken;
    }

    // 设置同步间隔
    if (config.syncInterval) {
      document.getElementById('syncIntervalSelect').value = config.syncInterval;
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// 加载用户信息
async function loadUserInfo() {
  try {
    const config = await chrome.storage.local.get([
      'syncPlatform',
      'githubToken',
      'giteeToken',
      'userInfo'
    ]);

    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');

    // 如果已有缓存的用户信息，直接显示
    if (config.userInfo) {
      userNameEl.textContent = config.userInfo.name || '未登录';
      userEmailEl.textContent = config.userInfo.email || '';
      return;
    }

    // 优先使用 GitHub，如果没有则使用 Gitee
    let token = config.githubToken;
    let platform = 'github';

    if (!token && config.giteeToken) {
      token = config.giteeToken;
      platform = 'gitee';
    }

    if (!token) {
      userNameEl.textContent = '未登录';
      userEmailEl.textContent = '请先配置 Token';
      return;
    }

    // 获取用户信息
    let userInfo;
    if (platform === 'github') {
      userInfo = await fetchGitHubUserInfo(token);
    } else {
      userInfo = await fetchGiteeUserInfo(token);
    }

    // 保存用户信息
    await chrome.storage.local.set({ userInfo });

    // 显示用户信息
    userNameEl.textContent = userInfo.name || userInfo.login || '未知用户';
    userEmailEl.textContent = userInfo.email || '';
  } catch (error) {
    console.error('加载用户信息失败:', error);
    document.getElementById('userName').textContent = '未登录';
    document.getElementById('userEmail').textContent = '';
  }
}

// 获取 GitHub 用户信息
async function fetchGitHubUserInfo(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error('获取 GitHub 用户信息失败');
  }

  return await response.json();
}

// 获取 Gitee 用户信息
async function fetchGiteeUserInfo(token) {
  const response = await fetch(`https://gitee.com/api/v5/user?access_token=${token}`);

  if (!response.ok) {
    throw new Error('获取 Gitee 用户信息失败');
  }

  return await response.json();
}

// 快速获取 Token
function handleQuickOAuth(platform) {
  // 显示提示（在打开新标签页之前）
  const steps = platform === 'github'
    ? '1. 点击 "Generate token"\n2. 复制生成的 Token\n3. 粘贴到输入框'
    : '1. 输入令牌描述\n2. 勾选 "gists" 权限\n3. 复制生成的 Token\n4. 粘贴到输入框';

  showAlert(`Token 创建步骤：\n\n${steps}`, '获取 Token', 'info');

  let url;
  if (platform === 'github') {
    url = 'https://github.com/settings/tokens/new?scopes=gist&description=SyncMark';
  } else {
    url = 'https://gitee.com/profile/personal_access_tokens/new';
  }

  chrome.tabs.create({ url });
}

// 保存配置
async function handleSaveConfig() {
  try {
    const githubToken = document.getElementById('githubTokenInput').value.trim();
    const giteeToken = document.getElementById('giteeTokenInput').value.trim();
    const syncInterval = parseInt(document.getElementById('syncIntervalSelect').value);

    if (!githubToken && !giteeToken) {
      await showAlert('请至少配置一个平台的 Token', '提示', 'warning');
      return;
    }

    // 保存配置
    const config = {
      syncInterval: syncInterval
    };

    if (githubToken) {
      config.githubToken = githubToken;
    }

    if (giteeToken) {
      config.giteeToken = giteeToken;
    }

    await chrome.storage.local.set(config);

    // 查找已存在的 Gist（GitHub）
    if (githubToken) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'findExistingGist',
          platform: 'github'
        });
        if (response.success && response.gistId) {
          console.log('找到 GitHub Gist:', response.gistId, '书签数量:', response.count);
          await fetchRemoteBookmarkCount('github');
        }
      } catch (error) {
        console.warn('查找 GitHub Gist 失败:', error);
      }
    }

    // 查找已存在的 Gist（Gitee）
    if (giteeToken) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'findExistingGist',
          platform: 'gitee'
        });
        if (response.success && response.gistId) {
          console.log('找到 Gitee Gist:', response.gistId, '书签数量:', response.count);
          await fetchRemoteBookmarkCount('gitee');
        }
      } catch (error) {
        console.warn('查找 Gitee Gist 失败:', error);
      }
    }

    // 更新显示
    await loadSyncStatus();
    await loadUserInfo();
    await loadRemoteBookmarkCount();

    await showAlert('配置已保存！', '成功', 'success');

    // 关闭配置侧边栏
    closeConfigSidebar();
  } catch (error) {
    console.error('保存配置失败:', error);
    await showAlert('保存失败: ' + error.message, '错误', 'error');
  }
}
// OAuth 授权登录 (已废弃，保留以防兼容性问题)
async function handleOAuthLogin() {
  const platform = document.querySelector('.platform-tab.active').dataset.platform;

  if (platform === 'github') {
    await loginWithGitHub();
  } else {
    // Gitee 暂不支持 OAuth，使用手动方式
    await showAlert('Gitee 暂不支持自动授权，请使用"快速获取"按钮手动创建 Token', '提示', 'info');
    handleQuickOAuth();
  }
}

// GitHub OAuth 登录
async function loginWithGitHub() {
  try {
    const clientId = 'Ov23liIpwMYbKqJqvJXE'; // 你需要在 GitHub 创建 OAuth App 获取
    const redirectUri = chrome.identity.getRedirectURL();
    const scope = 'gist';

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

    // 使用 chrome.identity.launchWebAuthFlow 进行 OAuth 授权
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          console.error('OAuth 授权失败:', chrome.runtime.lastError);
          await showAlert('授权失败: ' + chrome.runtime.lastError.message, '错误', 'error');
          return;
        }

        if (redirectUrl) {
          // 从重定向 URL 中提取 code
          const url = new URL(redirectUrl);
          const code = url.searchParams.get('code');

          if (code) {
            // 使用 code 换取 access token
            // 注意：这需要后端服务器来完成，因为需要 client_secret
            await showAlert('授权成功！\n\n由于安全原因，需要配置后端服务器来完成 Token 交换。\n\n建议使用"快速获取"按钮手动创建 Personal Access Token。', '提示', 'info');
          }
        }
      }
    );
  } catch (error) {
    console.error('OAuth 登录失败:', error);
    await showAlert('OAuth 登录失败，请使用"快速获取"按钮手动创建 Token', '错误', 'error');
  }
}

// 切换密码显示/隐藏
function togglePasswordVisibility(platform) {
  const tokenInput = document.getElementById(platform === 'github' ? 'githubTokenInput' : 'giteeTokenInput');
  const eyeIcon = document.getElementById(platform === 'github' ? 'githubEyeIcon' : 'giteeEyeIcon');

  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    // 切换为"隐藏"图标（眼睛带斜线）
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    tokenInput.type = 'password';
    // 切换为"显示"图标（正常眼睛）
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

// 设置事件监听器
function setupEventListeners() {
  // GitHub 上传/下载按钮
  document.getElementById('githubUploadButton').addEventListener('click', () => handleUpload('github'));
  document.getElementById('githubDownloadButton').addEventListener('click', () => handleDownload('github'));

  // Gitee 上传/下载按钮
  document.getElementById('giteeUploadButton').addEventListener('click', () => handleUpload('gitee'));
  document.getElementById('giteeDownloadButton').addEventListener('click', () => handleDownload('gitee'));

  // 自动同步开关
  document.getElementById('autoSyncToggle').addEventListener('change', handleAutoSyncToggle);

  // 用户头像点击
  document.getElementById('userAvatar').addEventListener('click', toggleUserDropdown);

  // 退出登录按钮
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // 设置按钮
  document.getElementById('settingsBtn').addEventListener('click', openConfigSidebar);

  // 更多按钮
  document.getElementById('moreBtn').addEventListener('click', toggleMoreDropdown);

  // 清空本地书签
  document.getElementById('clearLocalBtn').addEventListener('click', handleClearLocal);

  // 配置侧边栏关闭
  document.getElementById('configCloseBtn').addEventListener('click', closeConfigSidebar);
  document.getElementById('configOverlay').addEventListener('click', closeConfigSidebar);

  // GitHub 密码显示/隐藏
  document.getElementById('toggleGithubPasswordBtn').addEventListener('click', () => togglePasswordVisibility('github'));

  // Gitee 密码显示/隐藏
  document.getElementById('toggleGiteePasswordBtn').addEventListener('click', () => togglePasswordVisibility('gitee'));

  // GitHub 快速获取 Token
  document.getElementById('githubQuickBtn').addEventListener('click', () => handleQuickOAuth('github'));

  // Gitee 快速获取 Token
  document.getElementById('giteeQuickBtn').addEventListener('click', () => handleQuickOAuth('gitee'));

  // 保存配置按钮
  document.getElementById('saveConfigBtn').addEventListener('click', handleSaveConfig);

  // 点击外部关闭用户下拉菜单
  document.addEventListener('click', (e) => {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('userDropdown');
    if (!userMenu.contains(e.target) && dropdown.classList.contains('show')) {
      dropdown.classList.remove('show');
    }

    // 点击外部关闭更多菜单
    const moreBtn = document.getElementById('moreBtn');
    const moreDropdown = document.getElementById('moreDropdown');
    if (!moreBtn.contains(e.target) && !moreDropdown.contains(e.target) && moreDropdown.classList.contains('show')) {
      moreDropdown.classList.remove('show');
    }
  });
}

// 切换用户下拉菜单
function toggleUserDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('show');
}

// 打开控制台
function handleConsole() {
  const platform = document.querySelector('.platform-tab.active')?.dataset.platform || 'github';
  const url = platform === 'github'
    ? 'https://gist.github.com/'
    : 'https://gitee.com/gists';
  chrome.tabs.create({ url });
}

// 退出登录
async function handleLogout() {
  const confirmed = await showConfirm('确定要退出登录吗？这将清除所有配置信息。', '退出登录', {
    type: 'warning',
    danger: true,
    confirmText: '退出',
    cancelText: '取消'
  });

  if (confirmed) {
    try {
      await chrome.storage.local.clear();

      // 重置用户信息显示
      document.getElementById('userName').textContent = '未登录';
      document.getElementById('userEmail').textContent = '';

      await showAlert('已退出登录', '成功', 'success');
      window.location.reload();
    } catch (error) {
      console.error('退出登录失败:', error);
      await showAlert('退出失败: ' + error.message, '错误', 'error');
    }
  }
}

// 打开配置侧边栏
function openConfigSidebar() {
  console.log('Opening config sidebar...');
  const sidebar = document.getElementById('configSidebar');
  if (sidebar) {
    sidebar.classList.add('show');
    console.log('Sidebar class added');
  } else {
    console.error('Sidebar element not found');
  }
}

// 关闭配置侧边栏
function closeConfigSidebar() {
  document.getElementById('configSidebar').classList.remove('show');
}

// 更多功能
function toggleMoreDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('moreDropdown');
  dropdown.classList.toggle('show');
}

// 清空本地书签
async function handleClearLocal() {
  // 关闭更多菜单
  document.getElementById('moreDropdown').classList.remove('show');

  // 获取当前书签数量
  const bookmarks = await chrome.bookmarks.getTree();
  const count = countBookmarks(bookmarks[0]);

  if (count === 0) {
    await showAlert('本地没有书签', '提示', 'info');
    return;
  }

  // 警告确认
  const confirmed1 = await showConfirm(
    `⚠️ 警告：即将清空本地所有 ${count} 个书签！\n\n此操作不可恢复，建议先上传到远程备份。\n\n确定要继续吗？`,
    '危险操作',
    { type: 'warning', danger: true, confirmText: '继续', cancelText: '取消' }
  );

  if (!confirmed1) {
    return;
  }

  // 二次确认
  const confirmed2 = await showConfirm(
    `再次确认：这将永久删除本地所有 ${count} 个书签！\n\n确定要继续吗？`,
    '最后确认',
    { type: 'error', danger: true, confirmText: '确定清空', cancelText: '取消' }
  );

  if (!confirmed2) {
    return;
  }

  try {
    // 清空书签
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];

    if (root.children) {
      for (const folder of root.children) {
        if (folder.children) {
          for (const child of folder.children) {
            try {
              if (child.children) {
                await chrome.bookmarks.removeTree(child.id);
              } else {
                await chrome.bookmarks.remove(child.id);
              }
            } catch (e) {
              console.warn('删除书签失败:', e);
            }
          }
        }
      }
    }

    // 更新显示
    await loadBookmarkCount();
    await checkUnsyncedBookmarks();

    await showAlert('已成功清空本地书签', '清空成功', 'success');
  } catch (error) {
    console.error('清空书签失败:', error);
    await showAlert('清空失败: ' + error.message, '错误', 'error');
  }
}

// 处理上传（本地 → 远程）
async function handleUpload(platform) {
  const uploadButton = document.getElementById(platform === 'github' ? 'githubUploadButton' : 'giteeUploadButton');
  const statusBadge = document.getElementById('statusBadge');
  const noticeText = document.getElementById('noticeText');

  // 检查是否已配置
  const config = await chrome.storage.local.get(['githubToken', 'giteeToken']);
  const token = platform === 'github' ? config.githubToken : config.giteeToken;

  if (!token) {
    await showAlert(`请先在设置中配置 ${platform === 'github' ? 'GitHub' : 'Gitee'} Token`, '提示', 'warning');
    return;
  }

  // 确认上传
  const bookmarks = await chrome.bookmarks.getTree();
  const localCount = countBookmarks(bookmarks[0]);

  const platformName = platform === 'github' ? 'GitHub' : 'Gitee';
  const confirmed = await showConfirm(
    `确定要上传 ${localCount} 个本地书签到 ${platformName} 吗？\n\n这将覆盖远程的书签数据。`,
    '上传确认',
    { type: 'info', confirmText: '上传', cancelText: '取消' }
  );

  if (!confirmed) {
    return;
  }

  // 开始上传
  uploadButton.classList.add('syncing');
  uploadButton.disabled = true;
  statusBadge.textContent = '上传中...';
  statusBadge.className = 'status-badge';
  noticeText.textContent = `正在上传书签到 ${platformName}...`;

  try {
    // 发送上传消息到后台
    const response = await chrome.runtime.sendMessage({
      action: 'uploadToRemote',
      platform: platform
    });

    if (response.success) {
      statusBadge.textContent = '上传成功';
      statusBadge.className = 'status-badge success';
      noticeText.textContent = `已成功上传 ${localCount} 个书签到 ${platformName}`;

      // 显示成功提示
      await showAlert(`已成功上传 ${localCount} 个书签到 ${platformName}`, '上传成功', 'success');

      // 更新显示
      await loadSyncStatus();
      await fetchRemoteBookmarkCount(platform);
      await checkUnsyncedBookmarks();
    } else {
      throw new Error(response.error || '上传失败');
    }
  } catch (error) {
    console.error('上传失败:', error);
    statusBadge.textContent = '上传失败';
    statusBadge.className = 'status-badge error';

    let errorMsg = error.message || '上传失败，请检查网络或配置';
    noticeText.textContent = errorMsg;

    await showAlert(
      `${errorMsg}\n\n请检查：\n1. Token 是否正确\n2. Token 是否有 gist 权限\n3. 网络连接是否正常`,
      '上传失败',
      'error'
    );
  } finally {
    uploadButton.classList.remove('syncing');
    uploadButton.disabled = false;
  }
}

// 处理下载（远程 → 本地）
async function handleDownload(platform) {
  const downloadButton = document.getElementById(platform === 'github' ? 'githubDownloadButton' : 'giteeDownloadButton');
  const statusBadge = document.getElementById('statusBadge');
  const noticeText = document.getElementById('noticeText');

  // 检查是否已配置
  const config = await chrome.storage.local.get(['githubToken', 'giteeToken', 'githubGistId', 'giteeGistId']);
  const token = platform === 'github' ? config.githubToken : config.giteeToken;
  const gistId = platform === 'github' ? config.githubGistId : config.giteeGistId;

  if (!token) {
    await showAlert(`请先在设置中配置 ${platform === 'github' ? 'GitHub' : 'Gitee'} Token`, '提示', 'warning');
    return;
  }

  if (!gistId) {
    await showAlert('没有找到远程备份\n\n请先上传书签到远程', '提示', 'warning');
    return;
  }

  const platformName = platform === 'github' ? 'GitHub' : 'Gitee';

  // 警告确认
  const confirmed1 = await showConfirm(
    `⚠️ 警告：从 ${platformName} 恢复将会覆盖本地所有书签！\n\n建议先导出本地书签备份。\n\n确定要继续吗？`,
    '危险操作',
    { type: 'warning', danger: true, confirmText: '继续', cancelText: '取消' }
  );

  if (!confirmed1) {
    return;
  }

  // 二次确认
  const confirmed2 = await showConfirm(
    '再次确认：这将删除本地所有书签并从远程恢复！\n\n确定要继续吗？',
    '最后确认',
    { type: 'error', danger: true, confirmText: '确定恢复', cancelText: '取消' }
  );

  if (!confirmed2) {
    return;
  }

  // 开始下载
  downloadButton.classList.add('syncing');
  downloadButton.disabled = true;
  statusBadge.textContent = '恢复中...';
  statusBadge.className = 'status-badge';
  noticeText.textContent = `正在从 ${platformName} 恢复书签...`;

  try {
    // 发送下载消息到后台
    const response = await chrome.runtime.sendMessage({
      action: 'downloadFromRemote',
      platform: platform
    });

    if (response.success) {
      statusBadge.textContent = '恢复成功';
      statusBadge.className = 'status-badge success';
      noticeText.textContent = `已成功从 ${platformName} 恢复 ${response.count || 0} 个书签`;

      // 更新显示
      await loadBookmarkCount();
      await loadSyncStatus();
      await checkUnsyncedBookmarks();

      await showAlert(`已成功从 ${platformName} 恢复 ${response.count || 0} 个书签`, '恢复成功', 'success');
    } else {
      throw new Error(response.error || '恢复失败');
    }
  } catch (error) {
    console.error('恢复失败:', error);
    statusBadge.textContent = '恢复失败';
    statusBadge.className = 'status-badge error';

    let errorMsg = error.message || '恢复失败，请检查网络或配置';
    noticeText.textContent = errorMsg;

    await showAlert(errorMsg, '恢复失败', 'error');
  } finally {
    downloadButton.classList.remove('syncing');
    downloadButton.disabled = false;
  }
}

// 处理同步按钮点击（保留旧函数以兼容）
async function handleSync() {
  // 默认执行上传操作
  await handleUpload();
}

// ========== 自定义弹框函数 ==========

// 显示提示框（只有确定按钮）
function showAlert(message, title = '提示', type = 'info') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    const icon = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    // 设置图标
    icon.className = 'modal-icon ' + type;
    icon.innerHTML = getIconByType(type);

    // 设置内容
    titleEl.textContent = title;
    messageEl.textContent = message;

    // 只显示确定按钮
    cancelBtn.style.display = 'none';
    confirmBtn.style.display = 'block';
    confirmBtn.className = 'modal-btn modal-btn-confirm';
    confirmBtn.textContent = '确定';

    // 点击确定
    const handleConfirm = () => {
      overlay.classList.remove('show');
      confirmBtn.removeEventListener('click', handleConfirm);
      resolve(true);
    };

    confirmBtn.addEventListener('click', handleConfirm);

    // 显示弹框
    overlay.classList.add('show');
  });
}

// 显示确认框（有取消和确定按钮）
function showConfirm(message, title = '确认', options = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    const icon = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    const type = options.type || 'warning';
    const confirmText = options.confirmText || '确定';
    const cancelText = options.cancelText || '取消';
    const danger = options.danger || false;

    // 设置图标
    icon.className = 'modal-icon ' + type;
    icon.innerHTML = getIconByType(type);

    // 设置内容
    titleEl.textContent = title;
    messageEl.textContent = message;

    // 显示两个按钮
    cancelBtn.style.display = 'block';
    confirmBtn.style.display = 'block';
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;

    // 设置按钮样式
    if (danger) {
      confirmBtn.className = 'modal-btn modal-btn-confirm danger';
    } else {
      confirmBtn.className = 'modal-btn modal-btn-confirm primary';
    }

    // 点击确定
    const handleConfirm = () => {
      overlay.classList.remove('show');
      cleanup();
      resolve(true);
    };

    // 点击取消
    const handleCancel = () => {
      overlay.classList.remove('show');
      cleanup();
      resolve(false);
    };

    // 点击遮罩层
    const handleOverlay = (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      overlay.removeEventListener('click', handleOverlay);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('click', handleOverlay);

    // 显示弹框
    overlay.classList.add('show');
  });
}

// 根据类型获取图标
function getIconByType(type) {
  const icons = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕'
  };
  return icons[type] || icons.info;
}
