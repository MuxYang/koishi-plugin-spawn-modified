import { Context, Logger } from 'koishi'
import { Config } from './config'

const logger = new Logger('spawn')

export interface DebugInfo {
    guildId: string
    userId: string
    command: string
    isExempt: boolean
    currentDir: string
}

export function debugLog(ctx: Context, config: Config, info: DebugInfo) {
    if (!config.debug) return

    logger.info(`[DEBUG] 群组ID: ${info.guildId}, 用户ID: ${info.userId}`)
    logger.info(`[DEBUG] 命令: ${info.command}`)
    logger.info(`[DEBUG] 例外用户: ${info.isExempt ? '是' : '否'}`)
    logger.info(`[DEBUG] 工作目录: ${info.currentDir}`)
}

export function debugLogResult(ctx: Context, config: Config, code: number | undefined, timeUsed: number) {
    if (!config.debug) return

    logger.info(`[DEBUG] 执行结果: 退出码=${code}, 耗时=${timeUsed}ms`)
}
