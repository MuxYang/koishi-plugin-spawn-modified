import { Context, h } from 'koishi'
import path from 'path'
import { pathToFileURL } from 'url'
import AnsiToHtml from 'ansi-to-html'
import { escapeHtml } from './utils'

// 渲染终端输出为图片
export async function renderTerminalImage(ctx: Context, workingDir: string, command: string, output: string): Promise<h> {
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
