import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const binDir = path.join(projectRoot, 'resources', 'bin')
const libDir = path.join(projectRoot, 'resources', 'lib')

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

function copyLibraryIfChanged(sourcePath, targetPath) {
  const source = fs.statSync(sourcePath)
  if (fs.existsSync(targetPath)) {
    const target = fs.statSync(targetPath)
    if (source.size === target.size && Math.floor(source.mtimeMs) === Math.floor(target.mtimeMs)) {
      return
    }
  }

  fs.copyFileSync(sourcePath, targetPath)
  fs.chmodSync(targetPath, 0o755)
  console.log(`[ASR] bundled dylib -> ${targetPath}`)
}

function listRpathDependencies(binaryPath) {
  try {
    const output = execFileSync('otool', ['-L', binaryPath], { encoding: 'utf8' })
    return output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.startsWith('@rpath/') && line.includes('.dylib'))
      .map(line => line.split(' ')[0].replace('@rpath/', ''))
  } catch {
    return []
  }
}

function bundleWhisperLibraries(sourcePath) {
  if (process.platform !== 'darwin') return

  const resolvedCliPath = fs.realpathSync(sourcePath)
  const cliDir = path.dirname(resolvedCliPath)

  // Homebrew whisper-cpp commonly stores ggml libs in libexec/lib
  const candidateLibDirs = [
    path.resolve(cliDir, '../lib'),
    path.resolve(cliDir, '../libexec/lib'),
  ].filter((dir, index, arr) => arr.indexOf(dir) === index && fs.existsSync(dir))

  if (candidateLibDirs.length === 0) {
    console.log('[ASR] no local whisper-cpp lib directories found, skip dylib bundling')
    return
  }

  const queue = [resolvedCliPath]
  const visitedFiles = new Set()
  const copiedLibNames = new Set()

  while (queue.length > 0) {
    const currentPath = queue.shift()
    if (!currentPath || visitedFiles.has(currentPath)) continue
    visitedFiles.add(currentPath)

    const deps = listRpathDependencies(currentPath)
    for (const depName of deps) {
      if (copiedLibNames.has(depName)) continue

      const sourceLibPath = candidateLibDirs
        .map(dir => path.join(dir, depName))
        .find(filePath => fs.existsSync(filePath))

      if (!sourceLibPath) {
        console.warn(`[ASR] missing local dylib dependency: ${depName}`)
        continue
      }

      const targetLibPath = path.join(libDir, depName)
      copyLibraryIfChanged(sourceLibPath, targetLibPath)
      copiedLibNames.add(depName)

      // Recurse transitive @rpath dependencies from the resolved actual dylib file
      try {
        queue.push(fs.realpathSync(sourceLibPath))
      } catch {
        queue.push(sourceLibPath)
      }
    }
  }
}

function main() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true })
  }

  const sourcePath = findWhisperCli()
  if (!sourcePath) {
    console.log('[ASR] whisper-cli not found locally, skip bundling (ASR still works if release already includes it)')
    return
  }

  const targetName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const targetPath = path.join(binDir, targetName)
  copyIfChanged(sourcePath, targetPath)
  bundleWhisperLibraries(sourcePath)
}

main()
