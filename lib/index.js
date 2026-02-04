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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = exports.Config = void 0;
exports.apply = apply;
var child_process_1 = require("child_process");
var koishi_1 = require("koishi");
var path_1 = __importDefault(require("path"));
var utils_1 = require("./utils");
var render_1 = require("./render");
var logger_1 = require("./logger");
// Re-export config for plugin registration
var config_1 = require("./config");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_1.Config; } });
exports.name = 'spawn';
exports.inject = {
    optional: ['puppeteer'],
};
// 当前工作目录状态管理
var sessionDirs = new Map();
function apply(ctx, config) {
    var _this = this;
    var _a;
    ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
    ctx.command('exec <command:text>', { authority: (_a = config.authority) !== null && _a !== void 0 ? _a : 4 })
        .action(function (_a, command_1) { return __awaiter(_this, [_a, command_1], void 0, function (_b, command) {
        var guildId, userId, userKey, isExempt, sessionId, rootDir, currentDir, filterList, filterMode, cdValidation, pathValidation, timeout, state;
        var _this = this;
        var _c, _d, _e;
        var session = _b.session;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    if (!command) {
                        return [2 /*return*/, session.text('.expect-text')];
                    }
                    command = (0, koishi_1.h)('', koishi_1.h.parse(command)).toString(true);
                    guildId = session.guildId || '0';
                    userId = session.userId || '';
                    userKey = "".concat(guildId, ":").concat(userId);
                    isExempt = (_d = (_c = config.exemptUsers) === null || _c === void 0 ? void 0 : _c.some(function (entry) { return entry === userKey; })) !== null && _d !== void 0 ? _d : false;
                    sessionId = session.uid || session.channelId;
                    rootDir = path_1.default.resolve(ctx.baseDir, config.root);
                    currentDir = sessionDirs.get(sessionId) || rootDir;
                    // 输出调试信息
                    (0, logger_1.debugLog)(ctx, config, {
                        guildId: guildId,
                        userId: userId,
                        command: command,
                        isExempt: isExempt,
                        currentDir: currentDir,
                    });
                    filterList = (((_e = config.commandList) === null || _e === void 0 ? void 0 : _e.length) ? config.commandList : config.blockedCommands) || [];
                    filterMode = config.commandFilterMode || 'blacklist';
                    if (!isExempt && (0, utils_1.isCommandBlocked)(command, filterMode, filterList)) {
                        return [2 /*return*/, session.text('.blocked-command')];
                    }
                    cdValidation = (0, utils_1.validateCdCommand)(command, currentDir, rootDir, !isExempt && config.restrictDirectory);
                    if (!cdValidation.valid) {
                        return [2 /*return*/, session.text('.restricted-directory')];
                    }
                    pathValidation = (0, utils_1.validatePathAccess)(command, currentDir, rootDir, !isExempt && config.restrictDirectory);
                    if (!pathValidation.valid) {
                        return [2 /*return*/, session.text('.restricted-path')];
                    }
                    timeout = config.timeout;
                    state = { command: command, timeout: timeout, output: '' };
                    if (!!config.renderImage) return [3 /*break*/, 2];
                    return [4 /*yield*/, session.send(session.text('.started', state))];
                case 1:
                    _f.sent();
                    _f.label = 2;
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
                                        state.output = (0, utils_1.maskCurlOutput)(command, state.output.trim());
                                        // 输出执行结果调试信息
                                        (0, logger_1.debugLogResult)(ctx, config, code, state.timeUsed);
                                        // 更新当前目录（如果是 cd 命令且执行成功）
                                        if (cdValidation.newDir && code === 0) {
                                            sessionDirs.set(sessionId, cdValidation.newDir);
                                        }
                                        if (!(config.renderImage && ctx.puppeteer)) return [3 /*break*/, 5];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, (0, render_1.renderTerminalImage)(ctx, currentDir, command, state.output || '(no output)')];
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
