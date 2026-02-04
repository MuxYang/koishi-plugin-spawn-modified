import { exec } from 'child_process'
import { Context, h } from 'koishi'
import path from 'path'

import { Config } from './config'
import { isCommandBlocked, validateCdCommand, validatePathAccess, maskCurlOutput } from './utils'
import { renderTerminalImage } from './render'
import { debugLog, debugLogResult } from './logger'

// Re-export config for plugin registration
export { Config } from './config'

declare module 'koishi' {
  interface Context {
    puppeteer?: {
      page(): Promise<any>
    }
  }
}

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

      const sessionId = session.uid || session.channelId
      const rootDir = path.resolve(ctx.baseDir, config.root)
      const currentDir = sessionDirs.get(sessionId) || rootDir

      // 输出调试信息
      debugLog(ctx, config, {
        guildId,
        userId,
        command,
        isExempt,
        currentDir,
      })

      // 检查命令过滤（黑/白名单）；仅使用配置提供的正则
      const filterList = (config.commandList?.length ? config.commandList : config.blockedCommands) || []
      const filterMode = config.commandFilterMode || 'blacklist'
      if (!isExempt && isCommandBlocked(command, filterMode, filterList)) {
        return session.text('.blocked-command')
      }

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

          // 输出执行结果调试信息
          debugLogResult(ctx, config, code, state.timeUsed)

          // 更新当前目录（如果是 cd 命令且执行成功）
          if (cdValidation.newDir && code === 0) {
            sessionDirs.set(sessionId, cdValidation.newDir)
          }

          // 例外用户先回复"命令成功执行"，再尝试渲染结果
          if (isExempt) {
            await session.send('命令成功执行')
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
