import { Schema, Time } from 'koishi'

const encodings = ['utf8', 'utf16le', 'latin1', 'ucs2'] as const

export interface Config {
    root?: string
    shell?: string
    encoding?: typeof encodings[number]
    timeout?: number
    debug?: boolean
    renderImage?: boolean
    exemptUsers?: string[]
    blockedCommands?: string[]
    restrictDirectory?: boolean
    authority?: number
    commandFilterMode?: 'blacklist' | 'whitelist'
    commandList?: string[]
    sudoPassword?: string
}

export const Config: Schema<Config> = Schema.object({
    root: Schema.string().description('工作路径。').default(''),
    shell: Schema.string().description('运行命令的程序。'),
    encoding: Schema.union(encodings).description('输出内容编码。').default('utf8'),
    timeout: Schema.number().description('最长运行时间。').default(Time.minute),
    debug: Schema.boolean().description('开启调试模式，将群组ID、用户ID等信息输出到日志。').default(false),
    renderImage: Schema.boolean().description('是否将命令执行结果渲染为图片（需要安装 puppeteer 插件）。').default(false),
    exemptUsers: Schema.array(String).description('例外用户列表，格式为 "群组ID:用户ID"。私聊时群组ID为0。匹配的用户将无视一切过滤器。').default([]),
    blockedCommands: Schema.array(String).description('违禁命令列表（命令的开头部分）。').default([]),
    restrictDirectory: Schema.boolean().description('是否限制在当前目录及子目录内执行命令（禁止 cd 到上级或其他目录）。').default(false),
    authority: Schema.number().description('exec 命令所需权限等级。').default(4),
    commandFilterMode: Schema.union(['blacklist', 'whitelist']).description('命令过滤模式：blacklist/whitelist').default('blacklist'),
    commandList: Schema.array(String).description('命令过滤列表，配合过滤模式使用（为空则不限制）。').default([]),
    ...(process.platform !== 'win32' ? {
        sudoPassword: Schema.string().role('secret').description('管理员密码，用于 sudoexec 指令以最高权限执行命令。').default(''),
    } : {}),
})
