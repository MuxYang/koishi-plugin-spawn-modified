import { Context } from 'koishi'

export function debugLog(ctx: Context, tag: string, ...args: any[]) {
  ctx.logger("spawn-debug").info(`[${tag}]`, ...args)
}
