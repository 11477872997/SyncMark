// background.js - 后台服务

// 安装或更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('SyncMark 已安装/更新');

  // 初始化默认配置
  const config = await chrome.storage.local.get(['autoSync', 'syncInterval']);
  if (config.syncInterval === undefined) {
    await chrome.storage.local.set({
      autoSync: false,
      syncInterval: 1440, // 默认每天同步一次（分钟）
      lastSyncTime: null,
      syncStatus: null
    });
  }

  // 如果启用了自动同步，设置定时任务
  if (config.autoSync) {
    setupAutoSync(config.syncInterval || 1440);
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncNow' || request.action === 'uploadToRemote') {
    // 上传到远程
    performSync(request.platform)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开启
  } else if (request.action === 'downloadFromRemote') {
    // 从远程下载
    restoreFromRemote(request.platform)
      .then(result => sendResponse({ success: true, count: result.count }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getRemoteBookmarkCount') {
    // 获取远程书签数量
    getRemoteBookmarkCount(request.platform)
      .then(count => sendResponse({ success: true, count }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'findExistingGist') {
    // 查找已存在的 Gist
    findExistingGist(request.platform)
      .then(result => sendResponse({ success: true, gistId: result.gistId, count: result.count }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'updateAutoSync') {
    // 更新自动同步设置
    if (request.enabled) {
      chrome.storage.local.get(['syncInterval'], (result) => {
        setupAutoSync(result.syncInterval || 1440);
      });
    } else {
      chrome.alarms.clear('autoSync');
    }
    sendResponse({ success: true });
  }
});

// 监听定时任务
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSync') {
    console.log('执行自动同步...');
    performSync().catch(error => {
      console.error('自动同步失败:', error);
    });
  }
});

// 设置自动同步定时任务
function setupAutoSync(intervalMinutes) {
  chrome.alarms.create('autoSync', {
    periodInMinutes: intervalMinutes
  });
  console.log(`自动同步已设置，间隔: ${intervalMinutes} 分钟`);
}

// 执行同步
async function performSync(platform) {
  try {
    // 获取配置
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'githubGistId',
      'giteeGistId'
    ]);

    if (!platform) {
      throw new Error('未指定同步平台');
    }

    const token = platform === 'github' ? config.githubToken : config.giteeToken;
    const gistId = platform === 'github' ? config.githubGistId : config.giteeGistId;

    if (!token) {
      throw new Error(`未配置 ${platform === 'github' ? 'GitHub' : 'Gitee'} Token`);
    }

    // 获取所有书签
    const bookmarks = await chrome.bookmarks.getTree();
    const bookmarkCount = countBookmarks(bookmarks[0]);

    // 如果是 Gitee，需要清理 emoji
    let cleanedBookmarks = bookmarks;
    if (platform === 'gitee') {
      cleanedBookmarks = removeEmojis(bookmarks);
      console.log('已清理书签中的 emoji 表情');
    }

    const bookmarkData = {
      version: '1.0',
      timestamp: Date.now(),
      count: bookmarkCount,
      bookmarks: cleanedBookmarks
    };

    // 检查数据大小
    const dataSize = JSON.stringify(bookmarkData).length;
    const dataSizeMB = (dataSize / 1024 / 1024).toFixed(2);
    console.log(`书签数据大小: ${dataSizeMB} MB (${dataSize} 字节)`);

    // Gitee 限制单个文件最大 1MB
    if (platform === 'gitee' && dataSize > 1024 * 1024) {
      throw new Error(`书签数据过大 (${dataSizeMB} MB)，Gitee 限制单个文件最大 1MB。请考虑使用 GitHub 或减少书签数量。`);
    }

    // 根据平台执行同步
    let result;
    if (platform === 'github') {
      result = await syncToGithub(token, gistId, bookmarkData);
    } else if (platform === 'gitee') {
      result = await syncToGitee(token, gistId, bookmarkData);
    } else {
      throw new Error('不支持的同步平台');
    }

    // 保存同步状态
    const storageData = {
      lastSyncTime: Date.now(),
      lastSyncCount: bookmarkCount,
      syncStatus: 'success'
    };

    if (platform === 'github') {
      storageData.githubGistId = result.gistId;
      storageData.githubRemoteCount = bookmarkCount;
    } else {
      storageData.giteeGistId = result.gistId;
      storageData.giteeRemoteCount = bookmarkCount;
    }

    await chrome.storage.local.set(storageData);

    console.log('同步成功:', result);
    return result;
  } catch (error) {
    console.error('同步失败:', error);

    // 保存失败状态
    await chrome.storage.local.set({
      syncStatus: 'error'
    });

    throw error;
  }
}

// 移除 emoji 表情（递归处理书签树）
function removeEmojis(data) {
  if (Array.isArray(data)) {
    return data.map(item => removeEmojis(item));
  } else if (typeof data === 'object' && data !== null) {
    const cleaned = {};
    for (const key in data) {
      if (key === 'title' && typeof data[key] === 'string') {
        // 移除 4字节 UTF-8 字符（emoji）
        cleaned[key] = data[key].replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
      } else {
        cleaned[key] = removeEmojis(data[key]);
      }
    }
    return cleaned;
  }
  return data;
}

// 同步到 GitHub Gist
async function syncToGithub(token, gistId, bookmarkData) {
  const url = gistId
    ? `https://api.github.com/gists/${gistId}`
    : 'https://api.github.com/gists';

  const method = gistId ? 'PATCH' : 'POST';

  const body = {
    description: 'SyncMark - 浏览器书签备份',
    public: false,
    files: {
      'bookmarks.json': {
        content: JSON.stringify(bookmarkData, null, 2)
      }
    }
  };

  const response = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg;
    try {
      const error = JSON.parse(errorText);
      errorMsg = error.message || error.error || `GitHub API 错误: ${response.status}`;
    } catch (e) {
      errorMsg = `GitHub API 错误: ${response.status} - ${errorText}`;
    }
    console.error('GitHub API 错误详情:', errorMsg);
    throw new Error(errorMsg);
  }

  const result = await response.json();
  return {
    gistId: result.id,
    url: result.html_url,
    updatedAt: result.updated_at
  };
}

// 同步到 Gitee
async function syncToGitee(token, gistId, bookmarkData) {
  console.log('开始同步到 Gitee...');
  console.log('Token 长度:', token.length);
  console.log('gistId:', gistId);

  // 如果没有 gistId，先创建一个空的 Gist
  if (!gistId) {
    console.log('没有 gistId，先创建空 Gist...');

    // 创建一个只包含占位符的 Gist
    const createResponse = await fetch(`https://gitee.com/api/v5/gists?access_token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          'bookmarks.json': {
            content: '{"version":"1.0","timestamp":0,"count":0,"bookmarks":[]}'
          }
        },
        description: 'BookmarkHub',
        public: false
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('创建 Gist 失败:', errorText);
      throw new Error(`创建 Gist 失败: ${createResponse.status}`);
    }

    const createResult = await createResponse.json();
    gistId = createResult.id;
    console.log('空 Gist 创建成功，ID:', gistId);
  }

  // 更新 Gist，写入完整的书签数据
  console.log('更新 Gist，写入书签数据...');
  const updateResponse = await fetch(`https://gitee.com/api/v5/gists/${gistId}?access_token=${token}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        'bookmarks.json': {
          content: JSON.stringify(bookmarkData)
        }
      }
    })
  });

  console.log('响应状态:', updateResponse.status);

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error('错误响应:', errorText);
    let errorMsg;
    try {
      const error = JSON.parse(errorText);
      errorMsg = error.message || error.error || `Gitee API 错误: ${updateResponse.status}`;
    } catch (e) {
      errorMsg = `Gitee API 错误: ${updateResponse.status} - ${errorText}`;
    }
    console.error('Gitee API 错误详情:', errorMsg);
    throw new Error(errorMsg);
  }

  const result = await updateResponse.json();
  console.log('同步成功，Gist ID:', result.id);
  return {
    gistId: result.id,
    url: result.html_url,
    updatedAt: result.updated_at
  };
}

// 从远端恢复书签
async function restoreFromRemote(platform) {
  try {
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'githubGistId',
      'giteeGistId'
    ]);

    const token = platform === 'github' ? config.githubToken : config.giteeToken;
    const gistId = platform === 'github' ? config.githubGistId : config.giteeGistId;

    if (!gistId) {
      throw new Error('没有找到远端备份');
    }

    // 获取远程书签数据
    let bookmarkData;
    if (platform === 'github') {
      bookmarkData = await fetchFromGithub(token, gistId);
    } else if (platform === 'gitee') {
      bookmarkData = await fetchFromGitee(token, gistId);
    }

    console.log('获取到远端书签数据:', bookmarkData);
    console.log('书签结构:', JSON.stringify(bookmarkData.bookmarks, null, 2).substring(0, 500));

    // 删除本地所有书签（除了书签栏和其他书签文件夹）
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];

    console.log('开始清空本地书签...');
    // 清空书签栏和其他书签
    if (root.children) {
      for (const folder of root.children) {
        if (folder.children) {
          // 删除文件夹内的所有子项
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
    console.log('本地书签已清空');

    // 恢复书签
    if (bookmarkData.bookmarks && bookmarkData.bookmarks[0]) {
      console.log('开始恢复书签...');
      // 获取当前的书签根节点
      const currentTree = await chrome.bookmarks.getTree();
      const currentRoot = currentTree[0];

      console.log('当前书签根节点:', currentRoot);
      console.log('远程书签根节点:', bookmarkData.bookmarks[0]);

      // 恢复书签到对应的文件夹
      if (currentRoot.children && bookmarkData.bookmarks[0].children) {
        for (const remoteFolder of bookmarkData.bookmarks[0].children) {
          console.log('处理远程文件夹:', remoteFolder.title);
          // 找到对应的本地文件夹（书签栏、其他书签等）
          const localFolder = currentRoot.children.find(f => f.title === remoteFolder.title);
          if (localFolder && remoteFolder.children) {
            console.log('找到本地文件夹:', localFolder.title, 'ID:', localFolder.id);
            console.log('远程文件夹有', remoteFolder.children.length, '个子项');
            await restoreBookmarkTree(remoteFolder, localFolder.id);
          } else {
            console.warn('未找到本地文件夹:', remoteFolder.title);
          }
        }
      }
      console.log('书签恢复完成');
    } else {
      console.error('远程书签数据格式错误');
    }

    // 保存恢复状态
    await chrome.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncCount: bookmarkData.count || 0,
      syncStatus: 'success'
    });

    return { count: bookmarkData.count || 0 };
  } catch (error) {
    console.error('恢复书签失败:', error);
    throw error;
  }
}

// 递归恢复书签树
async function restoreBookmarkTree(node, parentId) {
  if (!node.children) {
    return;
  }

  for (const child of node.children) {
    try {
      if (child.url) {
        // 创建书签
        await chrome.bookmarks.create({
          parentId: parentId,
          title: child.title,
          url: child.url
        });
      } else if (child.children) {
        // 创建文件夹
        const folder = await chrome.bookmarks.create({
          parentId: parentId,
          title: child.title
        });
        // 递归创建子项
        await restoreBookmarkTree(child, folder.id);
      }
    } catch (e) {
      console.warn('恢复书签项失败:', e, child);
    }
  }
}

// 从 GitHub 获取
async function fetchFromGithub(token, gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API 错误: ${response.status}`);
  }

  const result = await response.json();
  const content = result.files['bookmarks.json'].content;
  return JSON.parse(content);
}

// 从 Gitee 获取
async function fetchFromGitee(token, gistId) {
  const response = await fetch(`https://gitee.com/api/v5/gists/${gistId}?access_token=${token}`);

  if (!response.ok) {
    throw new Error(`Gitee API 错误: ${response.status}`);
  }

  const result = await response.json();
  const content = result.files['bookmarks.json'].content;
  return JSON.parse(content);
}

// 计算书签数量
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

// 获取远程书签数量
async function getRemoteBookmarkCount(platform) {
  try {
    const config = await chrome.storage.local.get([
      'githubToken',
      'giteeToken',
      'githubGistId',
      'giteeGistId'
    ]);

    const token = platform === 'github' ? config.githubToken : config.giteeToken;
    const gistId = platform === 'github' ? config.githubGistId : config.giteeGistId;

    if (!gistId) {
      return 0;
    }

    // 获取远程书签数据
    let bookmarkData;
    if (platform === 'github') {
      bookmarkData = await fetchFromGithub(token, gistId);
    } else if (platform === 'gitee') {
      bookmarkData = await fetchFromGitee(token, gistId);
    }

    return bookmarkData.count || 0;
  } catch (error) {
    console.error('获取远程书签数量失败:', error);
    return 0;
  }
}

// 查找已存在的 Gist
async function findExistingGist(platform) {
  try {
    const config = await chrome.storage.local.get(['githubToken', 'giteeToken']);

    if (!platform) {
      throw new Error('未指定平台');
    }

    const token = platform === 'github' ? config.githubToken : config.giteeToken;

    if (!token) {
      throw new Error(`未配置 ${platform === 'github' ? 'GitHub' : 'Gitee'} Token`);
    }

    let gistList;
    if (platform === 'github') {
      gistList = await fetchGithubGists(token);
    } else if (platform === 'gitee') {
      gistList = await fetchGiteeGists(token);
    }

    // 查找名为 bookmarks.json 的 Gist
    const bookmarkGist = gistList.find(gist => {
      return gist.files && gist.files['bookmarks.json'];
    });

    if (bookmarkGist) {
      // 获取书签数据
      let bookmarkData;
      if (platform === 'github') {
        bookmarkData = await fetchFromGithub(token, bookmarkGist.id);
      } else {
        bookmarkData = await fetchFromGitee(token, bookmarkGist.id);
      }

      // 保存 gistId
      const storageData = {};
      if (platform === 'github') {
        storageData.githubGistId = bookmarkGist.id;
        storageData.githubRemoteCount = bookmarkData.count || 0;
      } else {
        storageData.giteeGistId = bookmarkGist.id;
        storageData.giteeRemoteCount = bookmarkData.count || 0;
      }

      await chrome.storage.local.set(storageData);

      return {
        gistId: bookmarkGist.id,
        count: bookmarkData.count || 0
      };
    } else {
      return {
        gistId: null,
        count: 0
      };
    }
  } catch (error) {
    console.error('查找已存在的 Gist 失败:', error);
    throw error;
  }
}

// 获取 GitHub Gists 列表
async function fetchGithubGists(token) {
  const response = await fetch('https://api.github.com/gists', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API 错误: ${response.status}`);
  }

  return await response.json();
}

// 获取 Gitee Gists 列表
async function fetchGiteeGists(token) {
  const response = await fetch(`https://gitee.com/api/v5/gists?access_token=${token}`);

  if (!response.ok) {
    throw new Error(`Gitee API 错误: ${response.status}`);
  }

  return await response.json();
}
