import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const binDir = path.join(projectRoot, 'resources', 'bin')

function findWhisperCli() {
  const candidates = [
    process.platform === 'win32' ? 'C:\\Program Files\\whisper.cpp\\whisper-cli.exe' : '/opt/homebrew/bin/whisper-cli',
    process.platform === 'win32' ? 'C:\\whisper.cpp\\whisper-cli.exe' : '/usr/local/bin/whisper-cli',
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  try {
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which'
    const lookupTarget = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    const result = execFileSync(lookupCmd, [lookupTarget], { encoding: 'utf8' })
    const firstMatch = result.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    if (firstMatch && fs.existsSync(firstMatch)) {
      return firstMatch
    }
  } catch {
    // ignore
  }

  return null
}

function copyIfChanged(sourcePath, targetPath) {
  const source = fs.statSync(sourcePath)
  if (fs.existsSync(targetPath)) {
    const target = fs.statSync(targetPath)
    if (source.size === target.size && Math.floor(source.mtimeMs) === Math.floor(target.mtimeMs)) {
      console.log(`[ASR] whisper-cli already synced: ${targetPath}`)
      return
    }
  }

  fs.copyFileSync(sourcePath, targetPath)
  fs.chmodSync(targetPath, 0o755)
  console.log(`[ASR] bundled whisper-cli -> ${targetPath}`)
}

function main() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const sourcePath = findWhisperCli()
  if (!sourcePath) {
    console.log('[ASR] whisper-cli not found locally, skip bundling (ASR still works if release already includes it)')
    return
  }

  const targetName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const targetPath = path.join(binDir, targetName)
  copyIfChanged(sourcePath, targetPath)
}

main()

