"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = exports.Config = void 0;
exports.apply = apply;
var child_process_1 = require("child_process");
var koishi_1 = require("koishi");
var path_1 = __importDefault(require("path"));
var url_1 = require("url");
var ansi_to_html_1 = __importDefault(require("ansi-to-html"));
var encodings = ['utf8', 'utf16le', 'latin1', 'ucs2'];
exports.Config = koishi_1.Schema.object({
    root: koishi_1.Schema.string().description('工作路径。').default(''),
    shell: koishi_1.Schema.string().description('运行命令的程序。'),
    encoding: koishi_1.Schema.union(encodings).description('输出内容编码。').default('utf8'),
    timeout: koishi_1.Schema.number().description('最长运行时间。').default(koishi_1.Time.minute),
    renderImage: koishi_1.Schema.boolean().description('是否将命令执行结果渲染为图片（需要安装 puppeteer 插件）。').default(false),
    blockedCommands: koishi_1.Schema.array(String).description('违禁命令列表（命令的开头部分）。').default([]),
    restrictDirectory: koishi_1.Schema.boolean().description('是否限制在当前目录及子目录内执行命令（禁止 cd 到上级或其他目录）。').default(false),
    authority: koishi_1.Schema.number().description('exec 命令所需权限等级。').default(4),
    commandFilterMode: koishi_1.Schema.union(['blacklist', 'whitelist']).description('命令过滤模式：blacklist/whitelist').default('blacklist'),
    commandList: koishi_1.Schema.array(String).description('命令过滤列表，配合过滤模式使用（为空则不限制）。').default([
        '^(?:^|[;&|\\n])\\s*(?:\\.?\\.\\/[^;&|\\s]+\\.sh\\b|(?:sh|bash|zsh|ksh|dash)\\s+[^;&|\\s]+\\.sh\\b)',
        '^(?:^|[;&|\\n])\\s*chmod\\s+\\+x\\b',
        '^\\s*sudo\\s+rm\\s+-rf\\b',
        '^\\s*rm\\s+-rf\\b',
        '^\\s*rm\\s+-rf\\s+/',
        '^\\s*rm\\s+-rf\\s+/\\*',
        '^\\s*mkfs(\\.\\w+)?\\b',
        '^\\s*dd\\b.*\\bof=\\/dev\\/(sd|nvme|mmcblk)',
        '^\\s*wipefs\\b',
        '^\\s*(parted|fdisk|cfdisk)\\b',
        '^\\s*lvremove\\b|^\\s*vgremove\\b',
        '^\\s*cryptsetup\\b.*(erase|format)',
        '^\\s*shutdown\\b|^\\s*poweroff\\b|^\\s*reboot\\b',
        '^\\s*chmod\\s+[-+]?(777|666)\\b',
        '^\\s*echo\\s+.+\\s*>\\s*/etc/(passwd|shadow|sudoers)\\b',
    ]),
});
exports.name = 'spawn';
exports.inject = {
    optional: ['puppeteer'],
};
// 当前工作目录状态管理
var sessionDirs = new Map();
// 命令过滤：支持黑名单/白名单模式
function buildRegex(entry) {
    try {
        return new RegExp(entry, 'i');
    }
    catch (_) {
        // 回退为逐字匹配，防止用户写了非法正则
        var escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
            return new RegExp(escaped, 'i');
        }
        catch (_) {
            return null;
        }
    }
}
function isCommandBlocked(command, mode, list) {
    if (!(list === null || list === void 0 ? void 0 : list.length))
        return false;
    var trimmedCommand = command.trim();
    var hit = list.some(function (entry) {
        var regex = buildRegex(entry);
        return regex ? regex.test(trimmedCommand) : false;
    });
    return mode === 'blacklist' ? hit : !hit;
}
// 解析 cd 命令并验证路径
function isWithinRoot(rootDir, targetPath) {
    var relative = path_1.default.relative(rootDir, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path_1.default.isAbsolute(relative));
}
function validateCdCommand(command, currentDir, rootDir, restrictDirectory) {
    if (!restrictDirectory)
        return { valid: true };
    var normalizedRoot = path_1.default.resolve(rootDir);
    var cdMatches = [];
    var cdRegex = /\bcd\s+([^;&|\n]+)/gi;
    var m;
    while ((m = cdRegex.exec(command)) !== null) {
        cdMatches.push(m);
    }
    if (!cdMatches.length)
        return { valid: true };
    // 若命令被链式运算符分隔且包含 cd，则要求所有 cd 目标都在指定 root 下，否则拒绝
    for (var _i = 0, cdMatches_1 = cdMatches; _i < cdMatches_1.length; _i++) {
        var match = cdMatches_1[_i];
        var target = match[1].trim().replace(/['"]/g, '');
        var absolutePath = path_1.default.resolve(currentDir, target);
        if (!isWithinRoot(normalizedRoot, absolutePath)) {
            return { valid: false, error: 'restricted-directory' };
        }
    }
    // 仅当命令是单独的 cd 时才更新会话目录，避免链式命令切换目录后执行其他操作
    var singleCdOnly = /^\s*cd\s+[^;&|\n]+\s*$/i.test(command);
    if (singleCdOnly) {
        var target = cdMatches[0][1].trim().replace(/['"]/g, '');
        var absolutePath = path_1.default.resolve(currentDir, target);
        return { valid: true, newDir: absolutePath };
    }
    return { valid: true };
}
// 渲染终端输出为图片
function renderTerminalImage(ctx, workingDir, command, output) {
    return __awaiter(this, void 0, void 0, function () {
        var ansiStrip, normalizeTabs, displayOutputRaw, displayOutput, lines, commandLineLength, visibleLineLengths, maxLineLength, charWidth, horizontalBuffer, containerWidth, ansi, coloredOutputHtml, fontPath, html, page, element, screenshot;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!ctx.puppeteer) {
                        throw new Error('Puppeteer plugin is not available');
                    }
                    ansiStrip = function (text) { return text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, ''); };
                    normalizeTabs = function (text) { return text.replace(/\t/g, '        '); };
                    displayOutputRaw = normalizeTabs(output || '(no output)');
                    displayOutput = displayOutputRaw.replace(/^\s+/, '');
                    lines = displayOutput.split(/\r?\n/);
                    commandLineLength = ansiStrip("".concat(workingDir, "$ ").concat(command)).length;
                    visibleLineLengths = lines.map(function (line) { return ansiStrip(line).length; });
                    maxLineLength = Math.max.apply(Math, __spreadArray([commandLineLength], visibleLineLengths, false)) || commandLineLength;
                    charWidth = 7.1 // refined average width for JetBrains Mono 13px
                    ;
                    horizontalBuffer = 56 // padding + borders + margin buffer
                    ;
                    containerWidth = Math.max(600, Math.min(1600, Math.ceil(maxLineLength * charWidth + horizontalBuffer)));
                    ansi = new ansi_to_html_1.default({
                        fg: '#cccccc',
                        bg: '#1e1e1e',
                        newline: true,
                        escapeXML: true,
                        stream: false,
                    });
                    coloredOutputHtml = ansi.toHtml(displayOutput);
                    fontPath = (0, url_1.pathToFileURL)(path_1.default.resolve(__dirname, '../fonts/JetBrainsMono-Regular.ttf')).href;
                    html = "\n<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"UTF-8\">\n  <style>\n    @font-face {\n      font-family: 'JetBrains Mono';\n      src: url('".concat(fontPath, "') format('truetype');\n    }\n    \n    * {\n      margin: 0;\n      padding: 0;\n      box-sizing: border-box;\n    }\n    \n    body {\n      background: #1e1e1e;\n      color: #cccccc;\n      font-family: 'JetBrains Mono', 'Courier New', monospace;\n      font-weight: 400;\n      font-size: 13px;\n      padding: 0;\n      display: inline-block;\n      width: ").concat(containerWidth, "px;\n      max-width: 1600px;\n      min-width: 600px;\n    }\n    \n    .terminal {\n      background: #1e1e1e;\n      border: 1px solid #3c3c3c;\n      border-radius: 8px;\n      overflow: hidden;\n      width: 100%;\n    }\n    \n    .title-bar {\n      background: #2d2d2d;\n      height: 35px;\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 0 12px;\n      border-bottom: 1px solid #3c3c3c;\n    }\n    \n    .title {\n      color: #cccccc;\n      font-size: 13px;\n      font-weight: 500;\n    }\n    \n    .buttons {\n      display: flex;\n      gap: 8px;\n    }\n    \n    .button {\n      width: 12px;\n      height: 12px;\n      border-radius: 50%;\n    }\n    \n    .button.minimize { background: #ffbd2e; }\n    .button.maximize { background: #28c940; }\n    .button.close { background: #ff5f56; }\n    \n    .content {\n      padding: 8px 12px;\n      white-space: pre;\n      word-break: normal;\n      line-height: 1.18;\n      overflow-x: auto;\n    }\n    \n    .command-line {\n      display: flex;\n      gap: 3px;\n      align-items: baseline;\n      margin-bottom: 2px;\n    }\n    \n    .prompt {\n      color: #4ec9b0;\n      margin: 0;\n      flex-shrink: 0;\n    }\n    \n    .command {\n      color: #dcdcaa;\n      margin: 0;\n      word-break: normal;\n      flex: 1;\n    }\n    \n    .output {\n      color: #cccccc;\n      line-height: 1.12;\n      white-space: pre;\n      word-break: normal;\n      overflow-x: auto;\n    }\n  </style>\n</head>\n<body>\n  <div class=\"terminal\">\n    <div class=\"title-bar\">\n      <div class=\"title\">Terminal</div>\n      <div class=\"buttons\">\n        <div class=\"button minimize\"></div>\n        <div class=\"button maximize\"></div>\n        <div class=\"button close\"></div>\n      </div>\n    </div>\n    <div class=\"content\">\n      <div class=\"command-line\">\n        <div class=\"prompt\">").concat(escapeHtml(workingDir), "$</div>\n        <div class=\"command\">").concat(escapeHtml(command), "</div>\n      </div>\n      <div class=\"output\">").concat(coloredOutputHtml, "</div>\n    </div>\n  </div>\n</body>\n</html>\n  ");
                    return [4 /*yield*/, ctx.puppeteer.page()];
                case 1:
                    page = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 9]);
                    return [4 /*yield*/, page.setContent(html)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, page.waitForNetworkIdle({ timeout: 5000 })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, page.$('.terminal')];
                case 5:
                    element = _a.sent();
                    return [4 /*yield*/, element.screenshot({ type: 'png' })];
                case 6:
                    screenshot = _a.sent();
                    return [2 /*return*/, koishi_1.h.image(screenshot, 'image/png')];
                case 7: return [4 /*yield*/, page.close()];
                case 8:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function apply(ctx, config) {
    var _this = this;
    var _a;
    ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
    ctx.command('exec <command:text>', { authority: (_a = config.authority) !== null && _a !== void 0 ? _a : 4 })
        .action(function (_a, command_1) { return __awaiter(_this, [_a, command_1], void 0, function (_b, command) {
        var filterList, filterMode, sessionId, rootDir, currentDir, cdValidation, timeout, state;
        var _this = this;
        var _c;
        var session = _b.session;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!command) {
                        return [2 /*return*/, session.text('.expect-text')];
                    }
                    command = (0, koishi_1.h)('', koishi_1.h.parse(command)).toString(true);
                    filterList = (((_c = config.commandList) === null || _c === void 0 ? void 0 : _c.length) ? config.commandList : config.blockedCommands) || [];
                    filterMode = config.commandFilterMode || 'blacklist';
                    if (isCommandBlocked(command, filterMode, filterList)) {
                        return [2 /*return*/, session.text('.blocked-command')];
                    }
                    sessionId = session.uid || session.channelId;
                    rootDir = path_1.default.resolve(ctx.baseDir, config.root);
                    currentDir = sessionDirs.get(sessionId) || rootDir;
                    cdValidation = validateCdCommand(command, currentDir, rootDir, config.restrictDirectory);
                    if (!cdValidation.valid) {
                        return [2 /*return*/, session.text('.restricted-directory')];
                    }
                    timeout = config.timeout;
                    state = { command: command, timeout: timeout, output: '' };
                    if (!!config.renderImage) return [3 /*break*/, 2];
                    return [4 /*yield*/, session.send(session.text('.started', state))];
                case 1:
                    _d.sent();
                    _d.label = 2;
                case 2: return [2 /*return*/, new Promise(function (resolve) {
                        var start = Date.now();
                        var child = (0, child_process_1.exec)(command, {
                            timeout: timeout,
                            cwd: currentDir,
                            encoding: config.encoding,
                            shell: config.shell,
                            windowsHide: true,
                        });
                        child.stdout.on('data', function (data) {
                            state.output += data.toString();
                        });
                        child.stderr.on('data', function (data) {
                            state.output += data.toString();
                        });
                        child.on('close', function (code, signal) { return __awaiter(_this, void 0, void 0, function () {
                            var image, error_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        state.code = code;
                                        state.signal = signal;
                                        state.timeUsed = Date.now() - start;
                                        state.output = state.output.trim();
                                        // 更新当前目录（如果是 cd 命令且执行成功）
                                        if (cdValidation.newDir && code === 0) {
                                            sessionDirs.set(sessionId, cdValidation.newDir);
                                        }
                                        if (!(config.renderImage && ctx.puppeteer)) return [3 /*break*/, 5];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, renderTerminalImage(ctx, currentDir, command, state.output || '(no output)')];
                                    case 2:
                                        image = _a.sent();
                                        resolve(image);
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_1 = _a.sent();
                                        ctx.logger.error('Failed to render terminal image:', error_1);
                                        resolve(session.text('.finished', state));
                                        return [3 /*break*/, 4];
                                    case 4: return [3 /*break*/, 6];
                                    case 5:
                                        resolve(session.text('.finished', state));
                                        _a.label = 6;
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); });
                    })];
            }
        });
    }); });
}
