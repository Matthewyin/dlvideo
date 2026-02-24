import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

// 历史记录接口
export interface HistoryItem {
  id: string
  videoId: string
  title: string
  thumbnail: string
  channel: string
  duration: number
  durationFormatted: string
  formatId: string
  resolution: string
  ext: string
  filePath: string
  fileSize: number | null
  downloadedAt: string
  url: string
}

// Cookies 来源浏览器类型
export type CookiesBrowser = 'none' | 'chrome' | 'safari'

// 设置接口
export interface AppSettings {
  downloadPath: string
  defaultFormat: string
  defaultResolution: string
  maxConcurrentDownloads: number
  autoDetectClipboard: boolean
  showNotifications: boolean
  proxyEnabled: boolean
  proxyUrl: string
  cookiesBrowser: CookiesBrowser
  // B站相关设置
  bilibiliCookiesImported: boolean
  // ASR 相关设置
  asrEnabled: boolean
  asrAutoTranscribe: boolean
  asrLanguage: string // 'auto' | 'zh' | 'en' ...
  asrOutputFormats: Array<'txt' | 'srt' | 'vtt'>
  asrModelPath: string
}

class DatabaseService {
  private db: Database.Database | null = null
  private dbPath: string

  constructor() {
    // 数据库文件存放在用户数据目录
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'dlvideo.db')
  }

  // 初始化数据库
  initialize(): void {
    // 确保目录存在
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')

    // 创建设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // 创建历史记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        thumbnail TEXT,
        channel TEXT,
        duration INTEGER,
        duration_formatted TEXT,
        format_id TEXT,
        resolution TEXT,
        ext TEXT,
        file_path TEXT,
        file_size INTEGER,
        downloaded_at TEXT NOT NULL,
        url TEXT NOT NULL
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_downloaded_at ON history(downloaded_at DESC)
    `)

    console.log('Database initialized at:', this.dbPath)
  }

  // 获取设置
  getSetting(key: string): string | null {
    const stmt = this.db!.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  // 设置单个配置
  setSetting(key: string, value: string): void {
    const stmt = this.db!.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    )
    stmt.run(key, value)
  }

  // 获取所有设置
  getAllSettings(): Partial<AppSettings> {
    const stmt = this.db!.prepare('SELECT key, value FROM settings')
    const rows = stmt.all() as { key: string; value: string }[]
    
    const settings: Record<string, any> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings as Partial<AppSettings>
  }

  // 保存所有设置
  saveAllSettings(settings: AppSettings): void {
    const stmt = this.db!.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    )
    const transaction = this.db!.transaction((s: AppSettings) => {
      for (const [key, value] of Object.entries(s)) {
        stmt.run(key, JSON.stringify(value))
      }
    })
    transaction(settings)
  }

  // 添加历史记录
  addHistory(item: HistoryItem): void {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO history 
      (id, video_id, title, thumbnail, channel, duration, duration_formatted, 
       format_id, resolution, ext, file_path, file_size, downloaded_at, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      item.id, item.videoId, item.title, item.thumbnail, item.channel,
      item.duration, item.durationFormatted, item.formatId, item.resolution,
      item.ext, item.filePath, item.fileSize, item.downloadedAt, item.url
    )
  }

  // 获取历史记录
  getHistory(limit = 100, offset = 0): HistoryItem[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM history ORDER BY downloaded_at DESC LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as any[]
    return rows.map(this.mapHistoryRow)
  }

  // 搜索历史记录
  searchHistory(query: string, limit = 50): HistoryItem[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM history 
      WHERE title LIKE ? OR channel LIKE ?
      ORDER BY downloaded_at DESC LIMIT ?
    `)
    const searchTerm = `%${query}%`
    const rows = stmt.all(searchTerm, searchTerm, limit) as any[]
    return rows.map(this.mapHistoryRow)
  }

  // 删除历史记录
  deleteHistory(id: string): void {
    const stmt = this.db!.prepare('DELETE FROM history WHERE id = ?')
    stmt.run(id)
  }

  // 清空历史记录
  clearHistory(): void {
    this.db!.exec('DELETE FROM history')
  }

  // 获取历史记录数量
  getHistoryCount(): number {
    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM history')
    const row = stmt.get() as { count: number }
    return row.count
  }

  // 映射数据库行到历史记录对象
  private mapHistoryRow(row: any): HistoryItem {
    return {
      id: row.id,
      videoId: row.video_id,
      title: row.title,
      thumbnail: row.thumbnail,
      channel: row.channel,
      duration: row.duration,
      durationFormatted: row.duration_formatted,
      formatId: row.format_id,
      resolution: row.resolution,
      ext: row.ext,
      filePath: row.file_path,
      fileSize: row.file_size,
      downloadedAt: row.downloaded_at,
      url: row.url,
    }
  }

  // 关闭数据库
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const databaseService = new DatabaseService()
