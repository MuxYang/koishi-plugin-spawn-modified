import { exec } from 'child_process'
import { Context, h, Schema, Time } from 'koishi'
import os from 'os'
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
  exemptUsers?: string[]
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
  exemptUsers: Schema.array(String).description('例外用户列表，格式为 "群组ID:用户ID"。私聊时群组ID为0。匹配的用户将无视一切过滤器。').default([]),
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
function buildRegex(entry: string): RegExp | null {
  try {
    return new RegExp(entry, 'i')
  } catch (_) {
    // 回退为逐字匹配，防止用户写了非法正则
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      return new RegExp(escaped, 'i')
    } catch (_) {
      return null
    }
  }
}

function isCommandBlocked(command: string, mode: 'blacklist' | 'whitelist', list: string[]): boolean {
  if (!list?.length) return false
  const trimmedCommand = command.trim()
  const hit = list.some(entry => {
    const regex = buildRegex(entry)
    return regex ? regex.test(trimmedCommand) : false
  })
  return mode === 'blacklist' ? hit : !hit
}

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '')
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if ((char === '"' || char === "'") && (quote === null || quote === char)) {
      quote = quote ? null : char
      continue
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function isPathLike(token: string): boolean {
  const trimmed = token.trim()
  if (!trimmed) return false
  if (/^[|&><]+$/.test(trimmed)) return false
  if (/^-{1,2}[a-zA-Z0-9][\w-]*$/.test(trimmed)) return false
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return false

  const normalized = stripQuotes(trimmed)

  return (
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('~') ||
    normalized.startsWith('..') ||
    normalized.startsWith('./') ||
    normalized.includes('/') ||
    normalized.includes('\\')
  )
}

function resolveCandidatePath(candidate: string, currentDir: string): string {
  const cleaned = stripQuotes(candidate.trim())
  const homeDir = os.homedir?.() || ''

  if (cleaned.startsWith('~')) {
    const withoutTilde = cleaned.slice(1).replace(/^[/\\]/, '')
    const homeResolved = homeDir ? path.join(homeDir, withoutTilde) : cleaned
    return path.resolve(homeResolved)
  }

  return path.resolve(currentDir, cleaned)
}

function extractPathCandidates(command: string): string[] {
  const tokens = tokenizeCommand(command)
  const candidates: string[] = []

  for (const token of tokens) {
    const normalized = stripQuotes(token)
    if (isPathLike(normalized)) {
      candidates.push(normalized)
      continue
    }

    const eqIndex = normalized.indexOf('=')
    if (eqIndex > 0) {
      const value = normalized.slice(eqIndex + 1)
      if (isPathLike(value)) {
        candidates.push(value)
      }
    }
  }

  return candidates
}

// 解析 cd 命令并验证路径
function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function validatePathAccess(command: string, currentDir: string, rootDir: string, restrictDirectory: boolean): { valid: boolean; error?: string } {
  if (!restrictDirectory) return { valid: true }

  const normalizedRoot = path.resolve(rootDir)
  const candidates = extractPathCandidates(command)

  for (const candidate of candidates) {
    const resolved = resolveCandidatePath(candidate, currentDir)
    if (!isWithinRoot(normalizedRoot, resolved)) {
      return { valid: false, error: 'restricted-path' }
    }
  }

  return { valid: true }
}

function validateCdCommand(command: string, currentDir: string, rootDir: string, restrictDirectory: boolean): { valid: boolean; newDir?: string; error?: string } {
  if (!restrictDirectory) return { valid: true }

  const normalizedRoot = path.resolve(rootDir)
  const cdMatches: RegExpExecArray[] = []
  const cdRegex = /\bcd\s+([^;&|\n]+)/gi
  let m: RegExpExecArray | null
  while ((m = cdRegex.exec(command)) !== null) {
    cdMatches.push(m)
  }

  if (!cdMatches.length) return { valid: true }

  // 若命令被链式运算符分隔且包含 cd，则要求所有 cd 目标都在指定 root 下，否则拒绝
  for (const match of cdMatches) {
    const target = match[1].trim().replace(/['"]/g, '')
    const absolutePath = path.resolve(currentDir, target)
    if (!isWithinRoot(normalizedRoot, absolutePath)) {
      return { valid: false, error: 'restricted-directory' }
    }
  }

  // 仅当命令是单独的 cd 时才更新会话目录，避免链式命令切换目录后执行其他操作
  const singleCdOnly = /^\s*cd\s+[^;&|\n]+\s*$/i.test(command)
  if (singleCdOnly) {
    const target = cdMatches[0][1].trim().replace(/['"]/g, '')
    const absolutePath = path.resolve(currentDir, target)
    return { valid: true, newDir: absolutePath }
  }

  return { valid: true }
}

function maskCurlOutput(command: string, output: string): string {
  if (!output) return output
  if (!/\bcurl\b/i.test(command)) return output

  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
  return output.replace(ipv4Regex, (ip) => (isPrivateIpv4(ip) ? ip : '*.*.*.*'))
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4) return false
  if (octets.some(octet => Number.isNaN(octet) || octet < 0 || octet > 255)) return false

  const [a, b] = octets

  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true

  return false
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

      // 检查是否为例外用户（无视一切过滤器）
      const guildId = session.guildId || '0'
      const userId = session.userId || ''
      const userKey = `${guildId}:${userId}`
      const isExempt = config.exemptUsers?.some(entry => entry === userKey) ?? false

      // 检查命令过滤（黑/白名单）；仅使用配置提供的正则
      const filterList = (config.commandList?.length ? config.commandList : config.blockedCommands) || []
      const filterMode = config.commandFilterMode || 'blacklist'
      if (!isExempt && isCommandBlocked(command, filterMode, filterList)) {
        return session.text('.blocked-command')
      }
      const sessionId = session.uid || session.channelId
      const rootDir = path.resolve(ctx.baseDir, config.root)
      const currentDir = sessionDirs.get(sessionId) || rootDir
      // 验证 cd 命令
      const cdValidation = validateCdCommand(command, currentDir, rootDir, !isExempt && config.restrictDirectory)
      if (!cdValidation.valid) {
        return session.text('.restricted-directory')
      }
      const pathValidation = validatePathAccess(command, currentDir, rootDir, !isExempt && config.restrictDirectory)
      if (!pathValidation.valid) {
        return session.text('.restricted-path')
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
          state.output = maskCurlOutput(command, state.output.trim())
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
