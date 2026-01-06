import { exec } from 'child_process'
import { Context, h, Schema, Time } from 'koishi'
import path from 'path'
import { pathToFileURL } from 'url'
import AnsiToHtml from 'ansi-to-html'

declare module 'koishi' {
  interface Context {
    puppeteer?: {
      page(): Promise<any>
    }
  }
}

const encodings = ['utf8', 'utf16le', 'latin1', 'ucs2'] as const

export interface Config {
  root?: string
  shell?: string
  encoding?: typeof encodings[number]
  timeout?: number
  renderImage?: boolean
  blockedCommands?: string[]
  restrictDirectory?: boolean
  authority?: number
  commandFilterMode?: 'blacklist' | 'whitelist'
  commandList?: string[]
}

export const Config: Schema<Config> = Schema.object({
  root: Schema.string().description('工作路径。').default(''),
  shell: Schema.string().description('运行命令的程序。'),
  encoding: Schema.union(encodings).description('输出内容编码。').default('utf8'),
  timeout: Schema.number().description('最长运行时间。').default(Time.minute),
  renderImage: Schema.boolean().description('是否将命令执行结果渲染为图片（需要安装 puppeteer 插件）。').default(false),
  blockedCommands: Schema.array(String).description('违禁命令列表（命令的开头部分）。').default([]),
  restrictDirectory: Schema.boolean().description('是否限制在当前目录及子目录内执行命令（禁止 cd 到上级或其他目录）。').default(false),
  authority: Schema.number().description('exec 命令所需权限等级。').default(4),
  commandFilterMode: Schema.union(['blacklist', 'whitelist']).description('命令过滤模式：blacklist/whitelist').default('blacklist'),
  commandList: Schema.array(String).description('命令过滤列表，配合过滤模式使用（为空则不限制）。').default([]),
})

export interface State {
  command: string
  timeout: number
  output: string
  code?: number
  signal?: NodeJS.Signals
  timeUsed?: number
}

export const name = 'spawn'

export const inject = {
  optional: ['puppeteer'],
}

// 当前工作目录状态管理
const sessionDirs = new Map<string, string>()

// 命令过滤：支持黑名单/白名单模式
function isCommandBlocked(command: string, mode: 'blacklist' | 'whitelist', list: string[]): boolean {
  if (!list?.length) return false
  const trimmedCommand = command.trim().toLowerCase()
  const hit = list.some(entry => trimmedCommand.startsWith(entry.toLowerCase()))
  return mode === 'blacklist' ? hit : !hit
}

// 解析 cd 命令并验证路径
function validateCdCommand(command: string, currentDir: string, rootDir: string, restrictDirectory: boolean): { valid: boolean; newDir?: string; error?: string } {
  const cdMatch = command.trim().match(/^cd\s+(.+)$/i)
  if (!cdMatch) return { valid: true }
  
  if (!restrictDirectory) return { valid: true }
  
  const targetPath = cdMatch[1].trim().replace(/['"]/g, '')
  const absolutePath = path.resolve(currentDir, targetPath)
  const normalizedRoot = path.resolve(rootDir)
  
  // 检查目标路径是否在根目录内
  if (!absolutePath.startsWith(normalizedRoot)) {
    return { valid: false, error: 'restricted-directory' }
  }
  
  return { valid: true, newDir: absolutePath }
}

// 渲染终端输出为图片
async function renderTerminalImage(ctx: Context, workingDir: string, command: string, output: string): Promise<h> {
  if (!ctx.puppeteer) {
    throw new Error('Puppeteer plugin is not available')
  }

  const ansiStrip = (text: string) => text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
  const normalizeTabs = (text: string) => text.replace(/\t/g, '        ')
  const displayOutputRaw = normalizeTabs(output || '(no output)')
  const displayOutput = displayOutputRaw.replace(/^\s+/, '')
  const lines = displayOutput.split(/\r?\n/)
  const commandLineLength = ansiStrip(`${workingDir}$ ${command}`).length
  const visibleLineLengths = lines.map(line => ansiStrip(line).length)
  const maxLineLength = Math.max(commandLineLength, ...visibleLineLengths) || commandLineLength
  const charWidth = 7.1 // refined average width for JetBrains Mono 13px
  const horizontalBuffer = 56 // padding + borders + margin buffer
  const containerWidth = Math.max(600, Math.min(1600, Math.ceil(maxLineLength * charWidth + horizontalBuffer)))

  const ansi = new AnsiToHtml({
    fg: '#cccccc',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: true,
    stream: false,
  })
  const coloredOutputHtml = ansi.toHtml(displayOutput)

  const fontPath = pathToFileURL(path.resolve(__dirname, '../fonts/JetBrainsMono-Regular.ttf')).href
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${fontPath}') format('truetype');
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: #1e1e1e;
      color: #cccccc;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-weight: 400;
      font-size: 13px;
      padding: 0;
      display: inline-block;
      width: ${containerWidth}px;
      max-width: 1600px;
      min-width: 600px;
    }
    
    .terminal {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 8px;
      overflow: hidden;
      width: 100%;
    }
    
    .title-bar {
      background: #2d2d2d;
      height: 35px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      border-bottom: 1px solid #3c3c3c;
    }
    
    .title {
      color: #cccccc;
      font-size: 13px;
      font-weight: 500;
    }
    
    .buttons {
      display: flex;
      gap: 8px;
    }
    
    .button {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    
    .button.minimize { background: #ffbd2e; }
    .button.maximize { background: #28c940; }
    .button.close { background: #ff5f56; }
    
    .content {
      padding: 8px 12px;
      white-space: pre;
      word-break: normal;
      line-height: 1.18;
      overflow-x: auto;
    }
    
    .command-line {
      display: flex;
      gap: 3px;
      align-items: baseline;
      margin-bottom: 2px;
    }
    
    .prompt {
      color: #4ec9b0;
      margin: 0;
      flex-shrink: 0;
    }
    
    .command {
      color: #dcdcaa;
      margin: 0;
      word-break: normal;
      flex: 1;
    }
    
    .output {
      color: #cccccc;
      line-height: 1.12;
      white-space: pre;
      word-break: normal;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="title-bar">
      <div class="title">Terminal</div>
      <div class="buttons">
        <div class="button minimize"></div>
        <div class="button maximize"></div>
        <div class="button close"></div>
      </div>
    </div>
    <div class="content">
      <div class="command-line">
        <div class="prompt">${escapeHtml(workingDir)}$</div>
        <div class="command">${escapeHtml(command)}</div>
      </div>
      <div class="output">${coloredOutputHtml}</div>
    </div>
  </div>
</body>
</html>
  `

  const page = await ctx.puppeteer.page()
  try {
    await page.setContent(html)
    await page.waitForNetworkIdle({ timeout: 5000 })
    
    const element = await page.$('.terminal')
    const screenshot = await element.screenshot({ type: 'png' }) as Buffer
    
    return h.image(screenshot, 'image/png')
  } finally {
    await page.close()
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))

  ctx.command('exec <command:text>', { authority: config.authority ?? 4 })
    .action(async ({ session }, command) => {
      if (!command) {
        return session.text('.expect-text')
      }

      command = h('', h.parse(command)).toString(true)
      // 检查命令过滤（黑/白名单）
      const filterList = (config.commandList?.length ? config.commandList : config.blockedCommands) || []
      const filterMode = config.commandFilterMode || 'blacklist'
      if (isCommandBlocked(command, filterMode, filterList)) {
        return session.text('.blocked-command')
      }
      const sessionId = session.uid || session.channelId
      const rootDir = path.resolve(ctx.baseDir, config.root)
      const currentDir = sessionDirs.get(sessionId) || rootDir
      // 验证 cd 命令
      const cdValidation = validateCdCommand(command, currentDir, rootDir, config.restrictDirectory)
      if (!cdValidation.valid) {
        return session.text('.restricted-directory')
      }
      const { timeout } = config
      const state: State = { command, timeout, output: '' }
      if (!config.renderImage) {
        await session.send(session.text('.started', state))
      }
      return new Promise((resolve) => {
        const start = Date.now()
        const child = exec(command, {
          timeout,
          cwd: currentDir,
          encoding: config.encoding,
          shell: config.shell,
          windowsHide: true,
        })
        child.stdout.on('data', (data) => {
          state.output += data.toString()
        })
        child.stderr.on('data', (data) => {
          state.output += data.toString()
        })
        child.on('close', async (code, signal) => {
          state.code = code
          state.signal = signal
          state.timeUsed = Date.now() - start
          state.output = state.output.trim()
          // 更新当前目录（如果是 cd 命令且执行成功）
          if (cdValidation.newDir && code === 0) {
            sessionDirs.set(sessionId, cdValidation.newDir)
          }
          // 渲染为图片或返回文本
          if (config.renderImage && ctx.puppeteer) {
            try {
              const image = await renderTerminalImage(ctx, currentDir, command, state.output || '(no output)')
              resolve(image)
            } catch (error) {
              ctx.logger.error('Failed to render terminal image:', error)
              resolve(session.text('.finished', state))
            }
          } else {
            resolve(session.text('.finished', state))
          }
        })
      })
    })
}
