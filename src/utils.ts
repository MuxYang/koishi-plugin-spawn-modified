import os from 'os'
import path from 'path'

// 命令过滤：支持黑名单/白名单模式
export function buildRegex(entry: string): RegExp | null {
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

export function isCommandBlocked(command: string, mode: 'blacklist' | 'whitelist', list: string[]): boolean {
    if (!list?.length) return false
    const trimmedCommand = command.trim()
    const hit = list.some(entry => {
        const regex = buildRegex(entry)
        return regex ? regex.test(trimmedCommand) : false
    })
    return mode === 'blacklist' ? hit : !hit
}

export function stripQuotes(text: string): string {
    return text.replace(/^['"]|['"]$/g, '')
}

export function tokenizeCommand(command: string): string[] {
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

export function isPathLike(token: string): boolean {
    const trimmed = token.trim()
    if (!trimmed) return false
    if (/^[|&><]+$/.test(trimmed)) return false
    if (/^-{1,2}[a-zA-Z0-9][\w-]*$/.test(trimmed)) return false
    if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return false

    const normalized = stripQuotes(trimmed)

    return (
        /^[A-Za-z]:[\\\/]/.test(normalized) ||
        normalized.startsWith('/') ||
        normalized.startsWith('~') ||
        normalized.startsWith('..') ||
        normalized.startsWith('./') ||
        normalized.includes('/') ||
        normalized.includes('\\')
    )
}

export function resolveCandidatePath(candidate: string, currentDir: string): string {
    const cleaned = stripQuotes(candidate.trim())
    const homeDir = os.homedir?.() || ''

    if (cleaned.startsWith('~')) {
        const withoutTilde = cleaned.slice(1).replace(/^[/\\]/, '')
        const homeResolved = homeDir ? path.join(homeDir, withoutTilde) : cleaned
        return path.resolve(homeResolved)
    }

    return path.resolve(currentDir, cleaned)
}

export function extractPathCandidates(command: string): string[] {
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
export function isWithinRoot(rootDir: string, targetPath: string): boolean {
    const relative = path.relative(rootDir, targetPath)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function validatePathAccess(command: string, currentDir: string, rootDir: string, restrictDirectory: boolean): { valid: boolean; error?: string } {
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

export function validateCdCommand(command: string, currentDir: string, rootDir: string, restrictDirectory: boolean): { valid: boolean; newDir?: string; error?: string } {
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

export function maskCurlOutput(command: string, output: string): string {
    if (!output) return output
    if (!/\bcurl\b/i.test(command)) return output

    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
    return output.replace(ipv4Regex, (ip) => (isPrivateIpv4(ip) ? ip : '*.*.*.*'))
}

export function isPrivateIpv4(ip: string): boolean {
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

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
