// popup.js - UI交互逻辑

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadBookmarkCount();
  await loadRemoteBookmarkCount();
  await loadSyncStatus();
  await loadSyncHistory();
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
      githubInfoItem.classList.remove('hidden');
      githubInfoItem.classList.add('visible');
      githubCountEl.textContent = config.githubRemoteCount !== undefined ? config.githubRemoteCount : '-';
      githubSyncGroup.classList.remove('hidden');
      githubSyncGroup.classList.add('visible');
    } else {
      githubInfoItem.classList.remove('visible');
      githubInfoItem.classList.add('hidden');
      githubSyncGroup.classList.remove('visible');
      githubSyncGroup.classList.add('hidden');
    }

    // 显示/隐藏 Gitee 信息卡和按钮组
    const giteeInfoItem = document.getElementById('giteeInfoItem');
    const giteeCountEl = document.getElementById('giteeBookmarkCount');
    const giteeSyncGroup = document.getElementById('giteeSyncGroup');

    if (config.giteeToken) {
      giteeInfoItem.classList.remove('hidden');
      giteeInfoItem.classList.add('visible');
      giteeCountEl.textContent = config.giteeRemoteCount !== undefined ? config.giteeRemoteCount : '-';
      giteeSyncGroup.classList.remove('hidden');
      giteeSyncGroup.classList.add('visible');
    } else {
      giteeInfoItem.classList.remove('visible');
      giteeInfoItem.classList.add('hidden');
      giteeSyncGroup.classList.remove('visible');
      giteeSyncGroup.classList.add('hidden');
    }

    // 处理单个按钮组时占满宽度
    const githubVisible = config.githubToken;
    const giteeVisible = config.giteeToken;

    if (githubVisible && !giteeVisible) {
      githubSyncGroup.classList.add('full-width');
      giteeSyncGroup.classList.remove('full-width');
    } else if (!githubVisible && giteeVisible) {
      giteeSyncGroup.classList.add('full-width');
      githubSyncGroup.classList.remove('full-width');
    } else {
      githubSyncGroup.classList.remove('full-width');
      giteeSyncGroup.classList.remove('full-width');
    }

    // 控制分隔线显示：使用 class 切换以支持过渡动画
    try {
      const div1 = document.getElementById('dividerLocalToGithub');
      const div2 = document.getElementById('dividerGithubToGitee');

      const ghVisible = githubInfoItem.classList.contains('visible');
      const geVisible = giteeInfoItem.classList.contains('visible');

      if (div1) {
        div1.classList.toggle('visible', ghVisible || geVisible);
        div1.classList.toggle('hidden', !(ghVisible || geVisible));
        div1.classList.add('fade-transition');
      }
      if (div2) {
        div2.classList.toggle('visible', ghVisible && geVisible);
        div2.classList.toggle('hidden', !(ghVisible && geVisible));
        div2.classList.add('fade-transition');
      }
    } catch (e) {
      console.warn('无法更新分隔线显示:', e);
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
    // 读取通用和平台级别的同步状态
    const result = await chrome.storage.local.get([
      'lastSyncTime', 'syncStatus',
      'githubLastSyncTime', 'githubSyncStatus',
      'giteeLastSyncTime', 'giteeSyncStatus',
      'githubToken', 'giteeToken'
    ]);

    // 更新通用同步时间（保留兼容）
    if (result.lastSyncTime) {
      document.getElementById('lastSyncTime').textContent = formatTime(result.lastSyncTime);
    } else {
      document.getElementById('lastSyncTime').textContent = '从未同步';
    }

    // 更新通用状态 badge（兼容旧逻辑）
    const statusBadge = document.getElementById('statusBadge');
    const noticeText = document.getElementById('noticeText');
    if (result.syncStatus === 'success') {
      statusBadge.textContent = '同步成功';
      statusBadge.className = 'status-badge success';
    } else if (result.syncStatus === 'error') {
      statusBadge.textContent = '同步失败';
      statusBadge.className = 'status-badge error';
    } else {
      statusBadge.textContent = '未同步';
      statusBadge.className = 'status-badge';
    }

    // 平台级别显示：如果已配置 token 则显示对应行并填充状态
    try {
      const ghRow = document.getElementById('githubStatusRow');
      const geRow = document.getElementById('giteeStatusRow');
      const ghBadge = document.getElementById('githubStatusBadge');
      const geBadge = document.getElementById('giteeStatusBadge');
      const ghTime = document.getElementById('githubLastSyncTime');
      const geTime = document.getElementById('giteeLastSyncTime');

      const ghLogged = !!result.githubToken;
      const geLogged = !!result.giteeToken;

      if (ghRow) {
        if (ghLogged) {
          ghRow.classList.remove('hidden');
          ghRow.classList.add('visible');
        } else {
          ghRow.classList.remove('visible');
          ghRow.classList.add('hidden');
        }
      }
      if (geRow) {
        if (geLogged) {
          geRow.classList.remove('hidden');
          geRow.classList.add('visible');
        } else {
          geRow.classList.remove('visible');
          geRow.classList.add('hidden');
        }
      }

      if (ghBadge) {
        if (result.githubSyncStatus === 'success') {
          ghBadge.textContent = '同步成功';
          ghBadge.className = 'status-badge success';
        } else if (result.githubSyncStatus === 'error') {
          ghBadge.textContent = '同步失败';
          ghBadge.className = 'status-badge error';
        } else {
          ghBadge.textContent = '未同步';
          ghBadge.className = 'status-badge';
        }
      }

      if (geBadge) {
        if (result.giteeSyncStatus === 'success') {
          geBadge.textContent = '同步成功';
          geBadge.className = 'status-badge success';
        } else if (result.giteeSyncStatus === 'error') {
          geBadge.textContent = '同步失败';
          geBadge.className = 'status-badge error';
        } else {
          geBadge.textContent = '未同步';
          geBadge.className = 'status-badge';
        }
      }

  if (ghTime) ghTime.textContent = result.githubLastSyncTime ? formatTime(result.githubLastSyncTime) : '-';
  if (geTime) geTime.textContent = result.giteeLastSyncTime ? formatTime(result.giteeLastSyncTime) : '-';
  // 显示上次同步数量
  const ghCountEl = document.getElementById('githubLastSyncCount');
  const geCountEl = document.getElementById('giteeLastSyncCount');
  if (ghCountEl) ghCountEl.textContent = result.githubLastSyncCount !== undefined ? `上次: ${result.githubLastSyncCount}` : '-';
  if (geCountEl) geCountEl.textContent = result.giteeLastSyncCount !== undefined ? `上次: ${result.giteeLastSyncCount}` : '-';

      // 更新 notice 文本：如果有未同步数量或平台错误更明显显示
      if (result.syncStatus === 'error' || result.githubSyncStatus === 'error' || result.giteeSyncStatus === 'error') {
        noticeText.textContent = '部分平台同步失败，请检查配置或网络';
      }
    } catch (e) {
      console.warn('更新平台同步状态失败:', e);
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

// ========== 同步历史操作 ==========
async function addSyncHistory(entry) {
  try {
    const result = await chrome.storage.local.get(['syncHistory']);
    const list = result.syncHistory || [];
    // 最新放前面
    list.unshift(entry);
    // 限制最大保存条数
    const max = 50;
    const newList = list.slice(0, max);
    await chrome.storage.local.set({ syncHistory: newList });
  } catch (e) {
    console.warn('追加同步历史失败:', e);
  }
}

async function loadSyncHistory() {
  try {
    // state
    window._historyState = window._historyState || { page: 1, pageSize: 10, platform: 'all', status: 'all', search: '' };
    const st = window._historyState;

    const result = await chrome.storage.local.get(['syncHistory']);
    const list = result.syncHistory || [];
    const el = document.getElementById('syncHistoryList');
    if (!el) return;

    // 筛选
    const filtered = list.filter(item => {
      if (st.platform !== 'all' && item.platform !== st.platform) return false;
      if (st.status !== 'all' && item.status !== st.status) return false;
      if (st.search) {
        const q = st.search.toLowerCase();
        const hay = `${item.platform} ${item.action} ${item.status} ${item.count || ''} ${formatTime(item.time)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // 分页
    const total = filtered.length;
    const pageSize = parseInt(st.pageSize, 10) || 10;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (st.page > totalPages) st.page = totalPages;
    if (st.page < 1) st.page = 1;
    const start = (st.page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    // 渲染
    el.innerHTML = '';
    if (pageItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-text';
      empty.textContent = '没有匹配的历史记录';
      el.appendChild(empty);
    } else {
      for (const it of pageItems) {
        const row = document.createElement('div');
        row.className = 'history-item';
        const left = document.createElement('div'); left.className = 'left';
        const right = document.createElement('div'); right.className = 'right';

        const title = document.createElement('div');
        title.className = 'history-item-title';
        title.textContent = `${it.platform} · ${it.action}`;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${it.status}`;

        left.appendChild(title);
        left.appendChild(meta);

        const badge = document.createElement('span');
        badge.className = `status-badge ${it.status === 'success' ? 'success' : it.status === 'error' ? 'error' : ''}`;
        badge.textContent = it.status;

        right.appendChild(badge);
  const info = document.createElement('div');
  info.className = 'history-item-info';
  info.textContent = `${it.count || '-'} · ${formatTime(it.time)}`;
        right.appendChild(info);

        row.appendChild(left);
        row.appendChild(right);
        el.appendChild(row);
      }
    }

    // 更新分页信息和控件状态
    const pageInfo = document.getElementById('historyPageInfo');
    if (pageInfo) pageInfo.textContent = `第 ${st.page} / ${totalPages} 页 · 共 ${total} 条`;

    const prevBtn = document.getElementById('historyPrevBtn');
    const nextBtn = document.getElementById('historyNextBtn');
    if (prevBtn) prevBtn.disabled = st.page <= 1;
    if (nextBtn) nextBtn.disabled = st.page >= totalPages;

    // 绑定控件（仅首次绑定）
    if (!window._historyControlsBound) {
      window._historyControlsBound = true;
      const searchInput = document.getElementById('historySearchInput');
      const platformSel = document.getElementById('historyPlatformFilter');
      const statusSel = document.getElementById('historyStatusFilter');
      const pageSizeSel = document.getElementById('historyPageSize');
      const clearBtn = document.getElementById('clearHistoryBtn');
      if (searchInput) searchInput.addEventListener('input', (e) => { st.search = e.target.value.trim(); st.page = 1; loadSyncHistory(); });
      if (platformSel) platformSel.addEventListener('change', (e) => { st.platform = e.target.value; st.page = 1; loadSyncHistory(); });
      if (statusSel) statusSel.addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; loadSyncHistory(); });
      if (pageSizeSel) pageSizeSel.addEventListener('change', (e) => { st.pageSize = parseInt(e.target.value,10); st.page = 1; loadSyncHistory(); });
      if (prevBtn) prevBtn.addEventListener('click', (e) => { if (st.page>1) { st.page--; loadSyncHistory(); } });
      if (nextBtn) nextBtn.addEventListener('click', (e) => { st.page++; loadSyncHistory(); });
      if (clearBtn) clearBtn.addEventListener('click', async (e) => { e.stopPropagation(); await chrome.storage.local.remove('syncHistory'); st.page = 1; loadSyncHistory(); });

      // 初始化控件值
      try { document.getElementById('historyPageSize').value = st.pageSize; } catch(e){}
      try { document.getElementById('historyPlatformFilter').value = st.platform; } catch(e){}
      try { document.getElementById('historyStatusFilter').value = st.status; } catch(e){}
      try { document.getElementById('historySearchInput').value = st.search; } catch(e){}
    }
  } catch (e) {
    console.warn('加载同步历史失败:', e);
  }
}

function escapeHtml(s){
  if (!s) return '';
  return String(s).replace(/[&<>"]+/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]||c));
}

// 监听后台推送的状态更新，实时刷新 UI
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    if (msg && msg.action === 'platformSyncUpdate') {
      // msg: { action:'platformSyncUpdate', platform, status, time, count }
      await loadSyncStatus();
      // 写历史并刷新
      await addSyncHistory({ platform: msg.platform, action: msg.type || 'auto', status: msg.status, time: msg.time || Date.now(), count: msg.count });
      await loadSyncHistory();
      // 同步后可能影响未同步提示，重新检查并更新 UI
      try { await checkUnsyncedBookmarks(); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('处理后台消息失败:', e);
  }
});

// Helper: 统一写入平台级同步状态并更新 UI
async function setPlatformSyncStatus(platform, status, timestamp = Date.now(), count) {
  try {
    if (platform === 'github') {
      const payload = { githubSyncStatus: status, githubLastSyncTime: timestamp };
      if (count !== undefined) payload.githubLastSyncCount = count;
      // 同步通用字段以兼容旧逻辑
      payload.lastSyncTime = timestamp;
      payload.syncStatus = status === 'success' ? 'success' : (status === 'error' ? 'error' : 'unknown');
      if (count !== undefined) payload.lastSyncCount = count;
      await chrome.storage.local.set(payload);
    } else {
      const payload = { giteeSyncStatus: status, giteeLastSyncTime: timestamp };
      if (count !== undefined) payload.giteeLastSyncCount = count;
      payload.lastSyncTime = timestamp;
      payload.syncStatus = status === 'success' ? 'success' : (status === 'error' ? 'error' : 'unknown');
      if (count !== undefined) payload.lastSyncCount = count;
      await chrome.storage.local.set(payload);
    }
  } catch (e) {
    console.warn('写入平台同步状态失败:', e);
  }
  // 刷新 UI 显示
  try { await loadSyncStatus(); } catch (e) { /* ignore */ }
}

// Helper: 清除平台级状态（登出时使用）
async function clearPlatformSyncStatus(platform) {
  try {
    if (platform === 'github') {
      await chrome.storage.local.remove(['githubSyncStatus', 'githubLastSyncTime', 'githubLastSyncCount']);
    } else {
      await chrome.storage.local.remove(['giteeSyncStatus', 'giteeLastSyncTime', 'giteeLastSyncCount']);
    }
    // 不影响通用 lastSyncTime/lastSyncCount
  } catch (e) {
    console.warn('清除平台同步状态失败:', e);
  }
  try { await loadSyncStatus(); } catch (e) { /* ignore */ }
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
    // 加载两端的 token 与缓存的用户信息（分别保存）
    const config = await chrome.storage.local.get([
      'githubToken', 'giteeToken', 'githubUserInfo', 'giteeUserInfo'
    ]);

    // GitHub 显示（含头像）
    const ghNameEl = document.getElementById('githubUserName');
    const ghEmailEl = document.getElementById('githubUserEmail');
    const ghAvatar = document.getElementById('githubAvatar');
  const ghLogoutBtn = document.getElementById('logoutGithubBtn');
  const ghConfigBtn = document.getElementById('configGithubBtn');
    if (config.githubUserInfo) {
      const u = config.githubUserInfo;
      ghNameEl.textContent = u.name || u.login || 'GitHub 用户';
      ghEmailEl.textContent = u.email || '';
      ghAvatar.src = u.avatar_url || u.avatar || 'icons/icon48.png';
    } else if (config.githubToken) {
      // 异步获取并缓存（不阻塞 UI）
      ghNameEl.textContent = '加载中...';
      ghAvatar.src = 'icons/icon48.png';
      (async () => {
        try {
          const u = await fetchGitHubUserInfo(config.githubToken);
          await chrome.storage.local.set({ githubUserInfo: u });
          ghNameEl.textContent = u.name || u.login || 'GitHub 用户';
          ghEmailEl.textContent = u.email || '';
          ghAvatar.src = u.avatar_url || u.avatar || 'icons/icon48.png';
        } catch (e) {
          console.warn('获取 GitHub 用户信息失败:', e);
          ghNameEl.textContent = '登录但无法获取信息';
          ghEmailEl.textContent = '';
          ghAvatar.src = 'icons/icon48.png';
        }
      })();
    } else {
      ghNameEl.textContent = '未登录';
      ghEmailEl.textContent = '';
      ghAvatar.src = 'icons/icon48.png';
    }

    // 根据 token 显示配置或退出按钮：使用 class 切换（保留 CSS 控制）
    try {
      if (ghLogoutBtn) {
        ghLogoutBtn.classList.toggle('hidden', !config.githubToken);
        // fallback: ensure visible via inline style when not hidden (helps some browsers/themes)
        ghLogoutBtn.style.display = ghLogoutBtn.classList.contains('hidden') ? 'none' : 'inline-block';
      }
      if (ghConfigBtn) {
        ghConfigBtn.classList.toggle('hidden', !!config.githubToken);
        ghConfigBtn.style.display = ghConfigBtn.classList.contains('hidden') ? 'none' : 'inline-block';
      }
    } catch (e) { /* ignore */ }

    // Gitee 显示
    const geNameEl = document.getElementById('giteeUserName');
    const geEmailEl = document.getElementById('giteeUserEmail');
    const geAvatar = document.getElementById('giteeAvatar');
  const geLogoutBtn = document.getElementById('logoutGiteeBtn');
  const geConfigBtn = document.getElementById('configGiteeBtn');
    if (config.giteeUserInfo) {
      const u = config.giteeUserInfo;
      geNameEl.textContent = u.name || u.login || 'Gitee 用户';
      geEmailEl.textContent = u.email || '';
      geAvatar.src = u.avatar || u.avatar_url || 'icons/icon48.png';
    } else if (config.giteeToken) {
      geNameEl.textContent = '加载中...';
      geAvatar.src = 'icons/icon48.png';
      (async () => {
        try {
          const u = await fetchGiteeUserInfo(config.giteeToken);
          await chrome.storage.local.set({ giteeUserInfo: u });
          geNameEl.textContent = u.name || u.login || 'Gitee 用户';
          geEmailEl.textContent = u.email || '';
          geAvatar.src = u.avatar || u.avatar_url || 'icons/icon48.png';
        } catch (e) {
          console.warn('获取 Gitee 用户信息失败:', e);
          geNameEl.textContent = '登录但无法获取信息';
          geEmailEl.textContent = '';
          geAvatar.src = 'icons/icon48.png';
        }
      })();
    } else {
      geNameEl.textContent = '未登录';
      geEmailEl.textContent = '';
      geAvatar.src = 'icons/icon48.png';
    }

    try {
      if (geLogoutBtn) {
        geLogoutBtn.classList.toggle('hidden', !config.giteeToken);
        geLogoutBtn.style.display = geLogoutBtn.classList.contains('hidden') ? 'none' : 'inline-block';
      }
      if (geConfigBtn) {
        geConfigBtn.classList.toggle('hidden', !!config.giteeToken);
        geConfigBtn.style.display = geConfigBtn.classList.contains('hidden') ? 'none' : 'inline-block';
      }
    } catch (e) { /* ignore */ }
  } catch (error) {
    console.error('加载用户信息失败:', error);
    // 回退显示
    try { document.getElementById('githubUserName').textContent = '未登录'; } catch (e) {}
    try { document.getElementById('githubUserEmail').textContent = ''; } catch (e) {}
    try { document.getElementById('giteeUserName').textContent = '未登录'; } catch (e) {}
    try { document.getElementById('giteeUserEmail').textContent = ''; } catch (e) {}
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
  // 立即给出 UI 反馈：禁用按钮并显示“保存中”状态，避免用户卡住
  const saveBtn = document.getElementById('saveConfigBtn');
  const originalBtnText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    saveBtn.classList.add('loading');
  }

  // 在按钮旁显示简短的保存状态信息（如果不存在则创建）
  let saveStatusEl = document.getElementById('saveStatus');
  if (!saveStatusEl) {
    saveStatusEl = document.createElement('span');
    saveStatusEl.id = 'saveStatus';
    saveStatusEl.className = 'save-status';
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(saveStatusEl, saveBtn.nextSibling);
    }
  }
  saveStatusEl.textContent = '保存中...';

  try {
    const githubToken = document.getElementById('githubTokenInput').value.trim();
    const giteeToken = document.getElementById('giteeTokenInput').value.trim();
    const syncInterval = parseInt(document.getElementById('syncIntervalSelect').value);

    if (!githubToken && !giteeToken) {
      // 恢复按钮状态
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
        saveBtn.classList.remove('loading');
      }
      saveStatusEl.textContent = '';
      await showAlert('请至少配置一个平台的 Token', '提示', 'warning');
      return;
    }

    // 保存配置到本地（这一步较快，可立即反馈成功）
    const config = { syncInterval: syncInterval };
    if (githubToken) config.githubToken = githubToken;
    if (giteeToken) config.giteeToken = giteeToken;

    await chrome.storage.local.set(config);

    // 立即反馈：已保存（后续耗时的远程检查在后台异步执行）
    saveStatusEl.textContent = '已保存';
    // 非阻塞地弹出提示（本地保存已完成）
    showAlert('配置已保存！', '成功', 'success');

    // 如果后续需要进行网络验证/检查，则显示全屏加载遮罩，直到后台验证完成
    const needBackgroundChecks = !!(githubToken || giteeToken);
    if (needBackgroundChecks) showGlobalLoading('正在验证配置，请稍候...');

    // 在后台执行耗时任务（查找 Gist / 获取用户信息 / 更新远程计数）
    (async () => {
      try {
        // 查找已存在的 Gist（GitHub）
        if (githubToken) {
          try {
            const response = await chrome.runtime.sendMessage({ action: 'findExistingGist', platform: 'github' });
            if (response && response.success && response.gistId) {
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
            const response = await chrome.runtime.sendMessage({ action: 'findExistingGist', platform: 'gitee' });
            if (response && response.success && response.gistId) {
              console.log('找到 Gitee Gist:', response.gistId, '书签数量:', response.count);
              await fetchRemoteBookmarkCount('gitee');
            }
          } catch (error) {
            console.warn('查找 Gitee Gist 失败:', error);
          }
        }

        // 更新界面信息（可能包含网络请求）
        await loadSyncStatus();
        await loadUserInfo();
        await loadRemoteBookmarkCount();
      } catch (e) {
        console.warn('后台检查执行失败:', e);
      } finally {
        // 隐藏全局加载遮罩（如果显示）
        if (needBackgroundChecks) hideGlobalLoading();

        // 稍微延迟恢复按钮和清理状态，让用户看到“已保存”的提示
        setTimeout(() => {
          if (saveStatusEl) saveStatusEl.textContent = '';
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalBtnText;
            saveBtn.classList.remove('loading');
          }
        }, 1200);
      }
    })();

    // 关闭配置侧边栏（给用户短暂时间看到保存状态）
    setTimeout(closeConfigSidebar, 600);
  } catch (error) {
    console.error('保存配置失败:', error);
    if (saveStatusEl) saveStatusEl.textContent = '保存失败';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalBtnText;
      saveBtn.classList.remove('loading');
    }
    await showAlert('保存失败: ' + (error && error.message ? error.message : String(error)), '错误', 'error');
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
  // 旧的全局退出按钮已替换，支持按平台退出
  const logoutGithubBtn = document.getElementById('logoutGithubBtn');
  if (logoutGithubBtn) logoutGithubBtn.addEventListener('click', () => handleLogoutPlatform('github'));
  const logoutGiteeBtn = document.getElementById('logoutGiteeBtn');
  if (logoutGiteeBtn) logoutGiteeBtn.addEventListener('click', () => handleLogoutPlatform('gitee'));

  // 配置 Token 按钮：打开侧边栏并聚焦对应输入框
  const configGithubBtn = document.getElementById('configGithubBtn');
  if (configGithubBtn) configGithubBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openConfigSidebar();
    setTimeout(() => {
      const el = document.getElementById('githubTokenInput');
      if (el) { el.focus(); el.select(); }
    }, 200);
  });

  const configGiteeBtn = document.getElementById('configGiteeBtn');
  if (configGiteeBtn) configGiteeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openConfigSidebar();
    setTimeout(() => {
      const el = document.getElementById('giteeTokenInput');
      if (el) { el.focus(); el.select(); }
    }, 200);
  });

  // 设置按钮
  document.getElementById('settingsBtn').addEventListener('click', openConfigSidebar);

  // 项目仓库按钮：在新标签页打开 GitHub 仓库
  const repoBtn = document.getElementById('repoBtn');
  if (repoBtn) {
    repoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: 'https://github.com/11477872997/SyncMark' });
    });
  }

  // 更多按钮
  document.getElementById('moreBtn').addEventListener('click', toggleMoreDropdown);

  // 清空本地书签
  document.getElementById('clearLocalBtn').addEventListener('click', handleClearLocal);

  // 全部清除（清除扩展本地存储）
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', handleClearAll);

  // 打开同步历史抽屉（更多 -> 同步历史）
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  if (openHistoryBtn) openHistoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openHistorySidebar();
    // 隐藏更多菜单
    const moreDropdown = document.getElementById('moreDropdown');
    if (moreDropdown) moreDropdown.classList.remove('show');
  });

  // 配置侧边栏关闭
  document.getElementById('configCloseBtn').addEventListener('click', closeConfigSidebar);
  document.getElementById('configOverlay').addEventListener('click', closeConfigSidebar);

  // 同步历史抽屉关闭
  const historyCloseBtn = document.getElementById('historyCloseBtn');
  if (historyCloseBtn) historyCloseBtn.addEventListener('click', closeHistorySidebar);
  const historyOverlay = document.getElementById('historyOverlay');
  if (historyOverlay) historyOverlay.addEventListener('click', closeHistorySidebar);

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

// 平台退出（只清除对应平台的数据）
async function handleLogoutPlatform(platform) {
  const platformName = platform === 'github' ? 'GitHub' : 'Gitee';
  const confirmed = await showConfirm(`确定要退出 ${platformName} 吗？这将清除该平台的 Token、用户信息和远程备份配置。`, '退出登录', {
    type: 'warning', danger: true, confirmText: '退出', cancelText: '取消'
  });

  if (!confirmed) return;

  try {
    if (platform === 'github') {
      await chrome.storage.local.remove(['githubToken', 'githubGistId', 'githubRemoteCount', 'githubUserInfo']);
    } else {
      await chrome.storage.local.remove(['giteeToken', 'giteeGistId', 'giteeRemoteCount', 'giteeUserInfo']);
    }

    // 同时清理平台级同步状态（避免登出后仍显示同步时间/状态）
    await clearPlatformSyncStatus(platform);

    // 更新 UI
    await loadRemoteBookmarkCount();
    await loadUserInfo();

    await showAlert(`${platformName} 已退出登录`, '成功', 'success');
  } catch (error) {
    console.error(`退出 ${platformName} 失败:`, error);
    await showAlert(`退出失败: ${error && error.message ? error.message : String(error)}`, '错误', 'error');
  }
}

// 全部清除扩展数据（不删除用户书签）
async function handleClearAll() {
  // 关闭更多菜单
  const moreDropdown = document.getElementById('moreDropdown');
  if (moreDropdown) moreDropdown.classList.remove('show');

  const confirmed = await showConfirm(
    `⚠️ 警告：执行全部清除将删除扩展的所有本地配置、Token、同步历史和缓存数据，但不会删除浏览器书签。

是否继续？`,
    '全部清除',
    { type: 'warning', danger: true, confirmText: '全部清除', cancelText: '取消' }
  );

  if (!confirmed) return;

  // 二次确认（避免误触）
  const confirmed2 = await showConfirm(
    `再次确认：这将恢复扩展到初始状态（所有配置、历史将被移除）。此操作不可撤销。确定要继续吗？`,
    '最后确认',
    { type: 'error', danger: true, confirmText: '确定清除', cancelText: '取消' }
  );

  if (!confirmed2) return;

  try {
    // 只清除扩展本地存储
    await chrome.storage.local.clear();

    await showAlert('已全部清除扩展本地数据，页面将刷新。', '已清除', 'success');
    // 刷新 popup 以便 UI 更新
    window.location.reload();
  } catch (e) {
    console.error('全部清除失败:', e);
    await showAlert('清除失败: ' + (e && e.message ? e.message : String(e)), '错误', 'error');
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

// 打开/关闭 同步历史抽屉
function openHistorySidebar() {
  const sb = document.getElementById('historySidebar');
  if (!sb) return;
  sb.classList.add('show');
  // 加载最新历史
  try { loadSyncHistory(); } catch (e) { /* ignore */ }
}

function closeHistorySidebar() {
  const sb = document.getElementById('historySidebar');
  if (!sb) return;
  sb.classList.remove('show');
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
      // 记录平台级别的同步状态和时间（统一入口）
      const now = Date.now();
      await setPlatformSyncStatus(platform, 'success', now, localCount);
  // 追加本地历史并刷新历史 UI
  try { await addSyncHistory({ platform, action: 'upload', status: 'success', time: now, count: localCount }); await loadSyncHistory(); } catch (e) { console.warn('记录历史失败:', e); }
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
    // 记录平台错误状态（统一入口）
    try {
      const now = Date.now();
      await setPlatformSyncStatus(platform, 'error', now);
      try { await addSyncHistory({ platform, action: 'upload', status: 'error', time: now, count: localCount }); await loadSyncHistory(); } catch (e) { console.warn('记录失败历史失败:', e); }
    } catch (e) {
      console.warn('记录平台同步错误状态失败:', e);
    }
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
      // 记录平台级别的同步状态和时间（统一入口）
      const now = Date.now();
      const recovered = response.count || 0;
      await setPlatformSyncStatus(platform, 'success', now, recovered);

  try { await addSyncHistory({ platform, action: 'download', status: 'success', time: now, count: recovered }); await loadSyncHistory(); } catch (e) { console.warn('记录历史失败:', e); }

      await loadBookmarkCount();
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
    // 记录平台错误状态（统一入口）
    try {
      const now = Date.now();
      await setPlatformSyncStatus(platform, 'error', now);
      try { await addSyncHistory({ platform, action: 'download', status: 'error', time: now, count: 0 }); await loadSyncHistory(); } catch (e) { console.warn('记录失败历史失败:', e); }
    } catch (e) {
      console.warn('记录平台恢复错误状态失败:', e);
    }
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

// 显示全局加载遮罩
function showGlobalLoading(message) {
  try {
    const overlay = document.getElementById('globalLoading');
    if (!overlay) return;
    const textEl = overlay.querySelector('.global-loading-text');
    if (textEl && message) textEl.textContent = message;
    overlay.style.display = 'flex';
  } catch (e) {
    console.warn('无法显示全局加载遮罩:', e);
  }
}

// 隐藏全局加载遮罩
function hideGlobalLoading() {
  try {
    const overlay = document.getElementById('globalLoading');
    if (!overlay) return;
    overlay.style.display = 'none';
  } catch (e) {
    console.warn('无法隐藏全局加载遮罩:', e);
  }
}
