import React, { useCallback } from 'react'
import { FolderOpen, Download, Globe, Palette, Bell, ArrowLeft } from 'lucide-react'
import { useDownloadStore, Settings } from '../stores/downloadStore'

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, saveSettings, setCurrentPage } = useDownloadStore()

  // 更新设置并保存到数据库
  const handleUpdateSettings = useCallback((newSettings: Partial<Settings>) => {
    updateSettings(newSettings)
    // 延迟保存，避免频繁写入
    setTimeout(() => {
      saveSettings()
    }, 500)
  }, [updateSettings, saveSettings])

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
            {/* Cookies 来源浏览器 */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">Cookies 来源浏览器</label>
              <select
                value={settings.cookiesBrowser || 'chrome'}
                onChange={(e) => handleUpdateSettings({ cookiesBrowser: e.target.value as 'none' | 'chrome' | 'safari' })}
                className="w-full px-4 py-2.5 bg-surface-tertiary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="none">不使用</option>
                <option value="chrome">Chrome</option>
                <option value="safari">Safari</option>
              </select>
              <p className="text-xs text-text-tertiary mt-2">从浏览器获取登录 Cookies 以绕过 YouTube 机器人验证</p>
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

