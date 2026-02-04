import { Context } from 'koishi'
import mock from '@koishijs/plugin-mock'
import * as spawn from '../src'

const ctx = new Context()
ctx.plugin(mock)
ctx.plugin(spawn)

const client = ctx.mock.client('123')

describe('koishi-plugin-spawn', () => {
  after(() => ctx.stop())

  it('basic support', async () => {
    await client.shouldReply('exec echo hello', [
      '[运行开始] echo hello',
      '[运行完毕] echo hello\nhello',
    ])
  })

  it('masks IPv4 address in curl output', async () => {
    await client.shouldReply('exec echo curl 1.2.3.4', [
      '[运行开始] echo curl 1.2.3.4',
      '[运行完毕] echo curl 1.2.3.4\ncurl *.*.*.*',
    ])
  })

  it('keeps private IPv4 address in curl output', async () => {
    await client.shouldReply('exec echo curl 192.168.1.5', [
      '[运行开始] echo curl 192.168.1.5',
      '[运行完毕] echo curl 192.168.1.5\ncurl 192.168.1.5',
    ])
  })

  it('blocks path outside root when restricted', async () => {
    const restrictedCtx = new Context()
    restrictedCtx.plugin(mock)
    restrictedCtx.plugin(spawn, { restrictDirectory: true, root: '.' })

    const restrictedClient = restrictedCtx.mock.client('456')
    await restrictedClient.shouldReply('exec cat ../README.md', '不允许访问配置目录以外的文件或目录。')

    await restrictedCtx.stop()
  })
})
