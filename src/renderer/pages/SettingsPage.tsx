import React, { useCallback, useState, useEffect } from 'react'
import { FolderOpen, Download, Globe, Bell, ArrowLeft, LogOut, CheckCircle, Loader2, FileUp, ExternalLink, RefreshCw, Info, FileText } from 'lucide-react'
import { useDownloadStore, Settings } from '../stores/downloadStore'

export const SettingsPage: React.FC = () => {
  const settings = useDownloadStore((state) => state.settings)
  const updateSettings = useDownloadStore((state) => state.updateSettings)
  const saveSettings = useDownloadStore((state) => state.saveSettings)
  const setCurrentPage = useDownloadStore((state) => state.setCurrentPage)
  const [youtubeLoggedIn, setYoutubeLoggedIn] = useState(false)
  const [bilibiliLoggedIn, setBilibiliLoggedIn] = useState(false)
  const [checkingLogin, setCheckingLogin] = useState(true)
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null)
  const [ytdlpUpdateMessage, setYtdlpUpdateMessage] = useState<string>('')
  const [ytdlpUpdating, setYtdlpUpdating] = useState(false)
  const [asrStatus, setAsrStatus] = useState<{
    checked: boolean
    available: boolean
    message: string | null
    missingWhisperBinary?: boolean
    missingModel?: boolean
    defaultModelPath?: string
  }>({
    checked: false,
    available: false,
    message: null,
  })
  const [asrModelDownloadState, setAsrModelDownloadState] = useState<{
    inProgress: boolean
    percent?: number
    message?: string
  }>({ inProgress: false })

  const asrModelDownloadTaskId = 'asr-model-base-settings'

  const refreshAsrStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.getAsrStatus()
      if (status.available) {
        setAsrStatus({
          checked: true,
          available: true,
          message: null,
          missingWhisperBinary: false,
          missingModel: false,
          defaultModelPath: status.defaultModelPath,
        })
        return
      }

      const tips: string[] = []
      if (status.missing?.whisperBinary) tips.push('缺少 whisper-cli')
      if (status.missing?.modelPath) tips.push('缺少 ggml-base.bin 模型')

      setAsrStatus({
        checked: true,
        available: false,
        message: status.error || (tips.length > 0 ? tips.join('，') : 'ASR 不可用'),
        missingWhisperBinary: status.missing?.whisperBinary,
        missingModel: status.missing?.modelPath,
        defaultModelPath: status.defaultModelPath,
      })
    } catch (error) {
      setAsrStatus({
        checked: true,
        available: false,
        message: error instanceof Error ? error.message : 'ASR 状态检查失败',
      })
    }
  }, [])

  // 检查登录状态和 yt-dlp 版本
  useEffect(() => {
    const checkLogin = async () => {
      try {
        const [youtubeResult, bilibiliResult, versionResult] = await Promise.all([
          window.electronAPI.checkYouTubeLogin(),
          window.electronAPI.checkBilibiliLogin(),
          window.electronAPI.getYtDlpVersion()
        ])
        setYoutubeLoggedIn(youtubeResult.loggedIn)
        setBilibiliLoggedIn(bilibiliResult.loggedIn)
        if (versionResult.success && versionResult.version) {
          setYtdlpVersion(versionResult.version)
        }
        await refreshAsrStatus()
      } catch (error) {
        console.error('检查登录状态失败:', error)
      } finally {
        setCheckingLogin(false)
      }
    }
    checkLogin()
  }, [refreshAsrStatus])

  useEffect(() => {
    const unsubModelProgress = window.electronAPI.onAsrModelDownloadProgress((progress) => {
      if (progress.taskId !== asrModelDownloadTaskId) return
      setAsrModelDownloadState({
        inProgress: true,
        percent: progress.percent,
        message: progress.message,
      })
    })

    const unsubModelComplete = window.electronAPI.onAsrModelDownloadComplete((result) => {
      if (result.taskId !== asrModelDownloadTaskId) return
      setAsrModelDownloadState({
        inProgress: false,
        message: result.success ? '模型下载完成' : (result.error || '模型下载失败'),
      })
      refreshAsrStatus().catch(() => {
        // handled in refresh
      })
    })

    return () => {
      unsubModelProgress()
      unsubModelComplete()
    }
  }, [asrModelDownloadTaskId, refreshAsrStatus])

  // 打开浏览器登录
  const handleOpenBrowser = async () => {
    await window.electronAPI.openYouTubeLogin()
  }

  // 导入 Cookies 文件
  const handleImportCookies = async () => {
    try {
      const result = await window.electronAPI.importCookiesFile()
      if (result.success) {
        setYoutubeLoggedIn(true)
      } else if (result.message && result.message !== '未选择文件') {
        alert(result.message)
      }
    } catch (error) {
      console.error('导入失败:', error)
    }
  }

  // 处理登出
  const handleYouTubeLogout = async () => {
    try {
      await window.electronAPI.logoutYouTube()
      setYoutubeLoggedIn(false)
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  // ========== B站 相关处理函数 ==========

  // 打开浏览器登录 B站
  const handleOpenBilibiliBrowser = async () => {
    await window.electronAPI.openBilibiliLogin()
  }

  // 导入 B站 Cookies 文件
  const handleImportBilibiliCookies = async () => {
    try {
      const result = await window.electronAPI.importBilibiliCookiesFile()
      if (result.success) {
        setBilibiliLoggedIn(true)
      } else if (result.message && result.message !== '未选择文件') {
        alert(result.message)
      }
    } catch (error) {
      console.error('导入 B站 Cookies 失败:', error)
    }
  }

  // 处理 B站 登出
  const handleBilibiliLogout = async () => {
    try {
      await window.electronAPI.logoutBilibili()
      setBilibiliLoggedIn(false)
    } catch (error) {
      console.error('B站 登出失败:', error)
    }
  }

  // ========== yt-dlp 更新相关函数 ==========

  // 处理 yt-dlp 更新
  const handleUpdateYtDlp = async () => {
    setYtdlpUpdating(true)
    setYtdlpUpdateMessage('正在检查更新...')
    try {
      const result = await window.electronAPI.updateYtDlp()
      if (result.success) {
        setYtdlpUpdateMessage(result.message)
        if (result.currentVersion) {
          setYtdlpVersion(result.currentVersion)
        }
      } else {
        setYtdlpUpdateMessage(`更新失败: ${result.message}`)
      }
    } catch (error) {
      setYtdlpUpdateMessage(`更新失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setYtdlpUpdating(false)
    }
  }

  const handleDownloadAsrModel = async () => {
    setAsrModelDownloadState({
      inProgress: true,
      message: '正在提交模型下载任务...',
    })

    const result = await window.electronAPI.downloadAsrModel(asrModelDownloadTaskId)
    if (!result.success) {
      setAsrModelDownloadState({
        inProgress: false,
        message: result.error || '模型下载失败',
      })
    }
  }

  // 更新设置并保存到数据库
  const handleUpdateSettings = useCallback((newSettings: Partial<Settings>) => {
    updateSettings(newSettings)
    // 延迟保存，避免频繁写入
    setTimeout(() => {
      saveSettings()
    }, 500)
  }, [updateSettings, saveSettings])

  const toggleAsrOutputFormat = (format: 'txt' | 'srt' | 'vtt', enabled: boolean) => {
    const current = new Set(settings.asrOutputFormats || ['txt', 'srt'])
    if (enabled) {
      current.add(format)
    } else {
      current.delete(format)
    }

    // 至少保留一种输出格式
    const next = Array.from(current) as Array<'txt' | 'srt' | 'vtt'>
    handleUpdateSettings({
      asrOutputFormats: next.length > 0 ? next : ['txt'],
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setCurrentPage('home')}
          className="p-2 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">设置</h1>
      </div>

      <div className="space-y-8">
        {/* yt-dlp 更新 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">yt-dlp 更新</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-4 border border-border shadow-soft">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <label className="block text-sm text-text-secondary mb-1">当前版本</label>
                  <span className="text-text-primary font-medium">{ytdlpVersion || '未知'}</span>
                </div>
                <button
                  onClick={handleUpdateYtDlp}
                  disabled={ytdlpUpdating}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
                >
                  {ytdlpUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>更新中...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>检查更新</span>
                    </>
                  )}
                </button>
              </div>
              {ytdlpUpdateMessage && (
                <div className={`flex items-start gap-2 text-xs ${ytdlpUpdateMessage.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{ytdlpUpdateMessage}</span>
                </div>
              )}
              <p className="text-xs text-text-tertiary mt-2">
                定期更新 yt-dlp 可以确保支持最新的 YouTube 变更，避免下载失败（如 403 错误）。
              </p>
            </div>
          </div>
        </section>

        {/* ASR 设置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">ASR 语音转文字</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-4 border border-border shadow-soft">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.asrEnabled}
                onChange={(e) => handleUpdateSettings({ asrEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary"
              />
              <span className="text-sm text-text-primary">启用 ASR（语音转文字）</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.asrAutoTranscribe}
                onChange={(e) => handleUpdateSettings({ asrAutoTranscribe: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary"
                disabled={!settings.asrEnabled}
              />
              <span className="text-sm text-text-primary">下载完成后自动转写</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-2">转写语言</label>
                <select
                  value={settings.asrLanguage || 'auto'}
                  onChange={(e) => handleUpdateSettings({ asrLanguage: e.target.value })}
                  disabled={!settings.asrEnabled}
                  className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="auto">自动识别</option>
                  <option value="zh">中文</option>
                  <option value="en">英语</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-2">输出格式</label>
                <div className="flex items-center gap-4 h-[42px] px-3 bg-surface-tertiary border border-border rounded-lg">
                  {(['txt', 'srt', 'vtt'] as const).map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(settings.asrOutputFormats || []).includes(fmt)}
                        onChange={(e) => toggleAsrOutputFormat(fmt, e.target.checked)}
                        disabled={!settings.asrEnabled}
                        className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary"
                      />
                      <span className="text-sm uppercase text-text-primary">{fmt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">模型路径（可选，自定义）</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={settings.asrModelPath}
                  onChange={(e) => handleUpdateSettings({ asrModelPath: e.target.value })}
                  placeholder={asrStatus.defaultModelPath || '留空使用自动检测的 ggml-base.bin'}
                  disabled={!settings.asrEnabled}
                  className="flex-1 px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary placeholder-text-tertiary disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!settings.asrEnabled}
                  onClick={async () => {
                    const selectedPath = await window.electronAPI.selectAsrModelFile()
                    if (!selectedPath) return
                    handleUpdateSettings({ asrModelPath: selectedPath })
                    setTimeout(() => {
                      refreshAsrStatus().catch(() => {
                        // handled in refresh
                      })
                    }, 700)
                  }}
                  className="px-4 py-2.5 bg-surface-tertiary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed border border-border rounded-lg text-sm text-text-secondary transition-colors"
                >
                  浏览...
                </button>
              </div>
            </div>

            {asrStatus.checked && (
              <div className={`rounded-lg border p-4 text-sm ${asrStatus.available ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="font-medium">
                  {asrStatus.available ? 'ASR 环境已就绪' : `ASR 环境未就绪：${asrStatus.message || '未知原因'}`}
                </div>
                {asrStatus.missingWhisperBinary && (
                  <p className="text-xs mt-2">缺少 `whisper-cli`。如果发布包已内置到 `resources/bin`，重启应用后会自动识别；开发环境可用 Homebrew 安装。</p>
                )}
                {asrStatus.missingModel && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs">
                      缺少模型 `ggml-base.bin`
                      {asrStatus.defaultModelPath ? `（默认下载到：${asrStatus.defaultModelPath}）` : ''}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={handleDownloadAsrModel}
                        disabled={asrModelDownloadState.inProgress}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm transition-colors"
                      >
                        {asrModelDownloadState.inProgress ? '下载模型中...' : '一键下载 base 模型'}
                      </button>
                      {asrModelDownloadState.message && (
                        <span className="text-xs">
                          {asrModelDownloadState.message}
                          {typeof asrModelDownloadState.percent === 'number' ? ` (${asrModelDownloadState.percent}%)` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 存储设置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">存储设置</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-4 border border-border shadow-soft">
            <div>
              <label className="block text-sm text-text-secondary mb-2">下载位置</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={settings.downloadPath}
                  onChange={(e) => handleUpdateSettings({ downloadPath: e.target.value })}
                  className="flex-1 px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                />
                <button
                  onClick={async () => {
                    const path = await window.electronAPI.selectDownloadPath()
                    if (path) {
                      handleUpdateSettings({ downloadPath: path })
                    }
                  }}
                  className="px-4 py-2.5 bg-surface-tertiary hover:bg-surface-hover border border-border rounded-lg text-sm text-text-secondary transition-colors">
                  浏览...
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 下载设置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">下载设置</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-4 border border-border shadow-soft">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-2">默认格式</label>
                <select
                  value={settings.defaultFormat}
                  onChange={(e) => handleUpdateSettings({ defaultFormat: e.target.value })}
                  className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-2">默认分辨率</label>
                <select
                  value={settings.defaultResolution}
                  onChange={(e) => handleUpdateSettings({ defaultResolution: e.target.value })}
                  className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                >
                  <option value="2160p">4K (2160p)</option>
                  <option value="1080p">Full HD (1080p)</option>
                  <option value="720p">HD (720p)</option>
                  <option value="480p">SD (480p)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-2">同时下载数量</label>
              <select
                value={settings.maxConcurrentDownloads}
                onChange={(e) => handleUpdateSettings({ maxConcurrentDownloads: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 网络设置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">网络设置</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-4 border border-border shadow-soft">
            {/* YouTube 登录 */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">YouTube 账号</label>
              <div className="flex items-center gap-3 flex-wrap">
                {checkingLogin ? (
                  <div className="flex items-center gap-2 text-text-tertiary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">检查登录状态...</span>
                  </div>
                ) : youtubeLoggedIn ? (
                  <>
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Cookies 已导入</span>
                    </div>
                    <button
                      onClick={handleYouTubeLogout}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      清除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleOpenBrowser}
                      className="flex items-center gap-2 px-4 py-2 bg-surface-tertiary hover:bg-surface-hover border border-border rounded-lg text-sm text-text-primary transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      打开浏览器登录
                    </button>
                    <button
                      onClick={handleImportCookies}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white transition-colors"
                    >
                      <FileUp className="w-4 h-4" />
                      导入 Cookies
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                步骤：1. 点击「打开浏览器登录」在浏览器中登录 YouTube →
                2. 使用扩展导出 cookies.txt（推荐 "Get cookies.txt LOCALLY"）→
                3. 点击「导入 Cookies」选择文件
              </p>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-border"></div>

            {/* B站 登录 */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">B站 账号</label>
              <div className="flex items-center gap-3 flex-wrap">
                {checkingLogin ? (
                  <div className="flex items-center gap-2 text-text-tertiary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">检查登录状态...</span>
                  </div>
                ) : bilibiliLoggedIn ? (
                  <>
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Cookies 已导入</span>
                    </div>
                    <button
                      onClick={handleBilibiliLogout}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      清除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleOpenBilibiliBrowser}
                      className="flex items-center gap-2 px-4 py-2 bg-surface-tertiary hover:bg-surface-hover border border-border rounded-lg text-sm text-text-primary transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      打开浏览器登录
                    </button>
                    <button
                      onClick={handleImportBilibiliCookies}
                      className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-sm text-white transition-colors"
                    >
                      <FileUp className="w-4 h-4" />
                      导入 Cookies
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                步骤：1. 点击「打开浏览器登录」在浏览器中登录 B站 →
                2. 使用扩展导出 cookies.txt（推荐 "Get cookies.txt LOCALLY"）→
                3. 点击「导入 Cookies」选择文件
              </p>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-border"></div>

            {/* Cookies 来源浏览器（备用方案） */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">Cookies 来源浏览器（备用）</label>
              <select
                value={settings.cookiesBrowser || 'chrome'}
                onChange={(e) => handleUpdateSettings({ cookiesBrowser: e.target.value as 'none' | 'chrome' | 'safari' })}
                className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                disabled={youtubeLoggedIn}
              >
                <option value="none">不使用</option>
                <option value="chrome">Chrome</option>
                <option value="safari">Safari</option>
              </select>
              <p className="text-xs text-text-tertiary mt-2">
                {youtubeLoggedIn
                  ? '已使用 App 内登录，此选项已禁用'
                  : '未登录时从系统浏览器获取 Cookies（开发模式可用）'}
              </p>
            </div>

            {/* 代理设置 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.proxyEnabled}
                onChange={(e) => handleUpdateSettings({ proxyEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary"
              />
              <span className="text-sm text-text-primary">使用代理</span>
            </label>
            {settings.proxyEnabled && (
              <div>
                <label className="block text-sm text-text-secondary mb-2">代理地址</label>
                <input
                  type="text"
                  value={settings.proxyUrl}
                  onChange={(e) => handleUpdateSettings({ proxyUrl: e.target.value })}
                  placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                  className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary placeholder-text-tertiary"
                />
              </div>
            )}
            <p className="text-xs text-text-tertiary mt-2 ml-7">配置HTTP/SOCKS代理以访问受限内容</p>
          </div>
        </section>

        {/* 通知设置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">通知</h2>
          </div>
          <div className="bg-surface-secondary rounded-xl p-5 space-y-3 border border-border shadow-soft">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.showNotifications}
                onChange={(e) => handleUpdateSettings({ showNotifications: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary" />
              <span className="text-sm text-text-primary">下载完成时显示通知</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.autoDetectClipboard}
                onChange={(e) => handleUpdateSettings({ autoDetectClipboard: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface-tertiary text-primary" />
              <span className="text-sm text-text-primary">自动检测剪贴板中的链接</span>
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
