const fs = require('fs')
const path = require('path')
const yaml = require('yaml')

const srcDir = path.join(__dirname, '..', 'src', 'locales')
const outDir = path.join(__dirname, '..', 'lib', 'locales')

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    let to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(from, to)
    } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
      // 将 YAML 转换为 JSON，以便 Node.js 可以直接 require
      const content = fs.readFileSync(from, 'utf8')
      const data = yaml.parse(content)
      to = to.replace(/\.ya?ml$/, '.json')
      fs.writeFileSync(to, JSON.stringify(data, null, 2), 'utf8')
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

copyDir(srcDir, outDir)
