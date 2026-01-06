# koishi-plugin-spawn-modified

Run shell commands with Koishi. | 使用 Koishi 运行终端命令。

> 在原插件基础上增加：命令过滤黑/白名单、渲染图片（Puppeteer）、动态宽度终端截图、可选调试日志。

## 安装

```bash
npm i koishi-plugin-spawn-modified
```

## 配置

```yaml
plugins:
	spawn-modified:
		root: ""               # 工作目录，留空为 Koishi 根目录
		shell: ""              # 自定义 shell，可留空使用默认
		encoding: utf8          # 输出编码
		timeout: 60000          # 超时（毫秒）
		renderImage: false      # 启用截图需安装 koishi-plugin-puppeteer
		restrictDirectory: false# 是否禁止 cd 到根目录之外
		commandFilterMode: blacklist # blacklist | whitelist
		commandList: []         # 与过滤模式配合使用
		blockedCommands: []     # 兼容字段，过滤模式为 blacklist 时生效
```

## 使用

在聊天中输入：

```
exec <command>
```

如果开启 `renderImage`，输出会渲染为终端风格图片，并根据最长行自动加宽（600–1400px 区间）。

## 调试

启用 Koishi 日志后可查看 `spawn-debug` 通道，包含命令解析、过滤、输出等调试信息，便于排查文本发送或截图问题。
