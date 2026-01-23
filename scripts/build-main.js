import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const isDev = process.argv.includes('--dev')
const watch = process.argv.includes('--watch')

// 外部依赖 - 这些模块不打包，运行时从 node_modules 加载
const external = [
  'electron',
  'better-sqlite3',
  'yt-dlp-wrap',
]

// 主进程构建配置
const mainConfig = {
  entryPoints: [resolve(projectRoot, 'src/main/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: resolve(projectRoot, 'dist/main/index.js'),
  format: 'esm',
  external,
  sourcemap: isDev,
  minify: !isDev,
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
}

// Preload 脚本构建配置
const preloadConfig = {
  entryPoints: [resolve(projectRoot, 'src/preload/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: resolve(projectRoot, 'dist/preload/index.js'),
  format: 'cjs', // preload 需要 CommonJS 格式
  external: ['electron'],
  sourcemap: isDev,
  minify: !isDev,
}

async function build() {
  try {
    if (watch) {
      // 监听模式
      const mainCtx = await esbuild.context(mainConfig)
      const preloadCtx = await esbuild.context(preloadConfig)
      
      await Promise.all([
        mainCtx.watch(),
        preloadCtx.watch(),
      ])
      
      console.log('👀 Watching for changes...')
    } else {
      // 单次构建
      await Promise.all([
        esbuild.build(mainConfig),
        esbuild.build(preloadConfig),
      ])
      console.log('✅ Main process and preload built successfully')
    }
  } catch (error) {
    console.error('❌ Build failed:', error)
    process.exit(1)
  }
}

build()

