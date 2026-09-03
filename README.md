<p align="center">
  <img src="build/appicon.png" width="120" alt="Voltra" /><br /><br />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white" alt="Go 1.25" />
  <img src="https://img.shields.io/badge/Vue-3.4-42b883?logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Wails-v3_3.0.0--beta-4d9ff5" alt="Wails v3" />
  <img src="https://img.shields.io/badge/Platform-macOS_%7C_Windows_%7C_Linux-8A8F98" alt="Platform" />
</p>

<h1 align="center">Voltra</h1>

<p align="center">
  <b>轻量级跨平台 API 接口调试工具</b> —— Wails v3 + Go + Vue 3 的本地优先（local-first）实现。<br />
  A lightweight, local-first API debugging tool (a Postman / Apifox alternative) built with Wails v3, Go and Vue 3.
</p>

<p align="center">
  全部数据保存在本机 · 无需账号 · 离线可用 · 启动即用
</p>

## 功能（v0.2）

- **六区专业化界面**：标题栏 / 活动栏 / 侧栏（可折叠、拖拽宽度）/ 标签区 / 主编辑区（请求-响应分栏，可双向拖拽）/ 状态栏；明 / 暗 / 跟随系统三主题，设计令牌单源，整页缩放 50–150%
- **项目化接口管理**：项目 → 集合 → 文件夹（无限层级）→ 接口树；自研鼠标拖拽引擎（排序 / 移入子目录）、右键菜单、内联重命名、复制、搜索即时平铺过滤（1000 节点无压力）
- **HTTP 请求**：7 种方法 + 自定义；6 种 Body（none / form-data / urlencoded / raw·4 语言 / binary / graphql）；URL 与 Query 双向同步、Header 补全与自动头预览、集合级公共 Header / Auth 继承
- **Auth（Postman 化 10 类型）**：No Auth / Bearer / Basic / API Key（header 或 query）/ OAuth 1.0a / OAuth 2.0（密码 / 客户端凭据 / 授权码 + 一键取 token）/ Digest（401 挑战-应答）/ AWS SigV4 / JWT（payload 解码面板）/ 继承；签名类由 Go 侧实现，发送时自动注入
- **环境与变量**：全局 / 项目 / 环境 / 请求四层作用域，`{{变量}}` 在 URL、Query、Header、Body、Auth 中替换；未定义变量高亮告警；secret 类型区分
- **响应查看**：状态行（按状态码着色 + 耗时 + 大小 + 时间戳）、Body Pretty / Raw / Preview、复制 / 下载 / 换行 / 搜索 / JSONPath 过滤、响应头、Set-Cookie 解析、网络错误中文说明 + 重试、取消发送、**发送并下载**（原生保存框 + 流式落盘，大文件不进内存）
- **WebSocket**：WS/WSS 连接入树（青色标）、握手 Header、收/发气泡时间线（JSON 自动格式化、二进制 hex 摘要）、Text / JSON / Binary 发送、常用片段、自动重连 / 心跳
- **历史记录**：每次发送自动记录，日期分组、搜索、还原为新标签、另存为接口、清空 / 上限
- **生成代码**：11 语言 24 客户端（cURL / HTTPie / wget、Python、JS、Node、Java、PHP、Go、C#、Ruby、Swift、Kotlin），变量原样 / 当前环境真实值替换双模式
- **导入 / 导出**：Postman Collection v2.1 导入（含预览报告、上限可配置）与导出、Postman Environment 导入、cURL 粘贴解析、项目 JSON 导出
- **持久化**：重启恢复项目 / 环境 / 历史 / 主题 / 标签 / 侧栏宽度 / 分栏比例；数据文件损坏自动隔离（`.corrupt` 后缀）不崩；设置页可打开数据目录、导出全部数据备份

## 截图

| 主界面 · 暗色主题 | 主界面 · 浅色主题 | WebSocket 调试 |
| :---: | :---: | :---: |
| <img src="screenshots/main-dark.png" width="640" alt="主界面（暗色主题）" /> | <img src="screenshots/main-light.png" width="640" alt="主界面（浅色主题）" /> | <img src="screenshots/websocket.png" width="640" alt="WebSocket 调试" /> |

## 快速开始

**下载预构建包**：前往 [GitHub Releases](https://github.com/ramboLiang/voltra/releases) 或 [Gitee Releases](https://gitee.com/ramboLiang/voltra/releases)（当前提供 macOS arm64（Apple Silicon）与 Windows x86_64 构建）。

**从源码构建**：

```bash
git clone https://github.com/ramboLiang/voltra.git
cd voltra

# 一次性：安装 wails3 CLI 与前端依赖
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
wails3 setup
cd frontend && npm install && cd ..

task dev        # 开发模式（热重载，自动重生成 bindings）
task build      # 生产构建，产物在 bin/
```

### 构建前置条件

- Go 1.25+
- Node.js 18+
- [Task CLI](https://taskfile.dev)（跑 `task dev` / `task build` 用）：
  ```bash
  brew install go-task        # macOS
  go install github.com/go-task/task/v3/cmd/task@latest   # 或
  ```
  不想装 Task 也可以直接跑等价的 wails3 命令：`wails3 dev -config ./build/config.yml -port 9245` / `wails3 build -config ./build/config.yml`
- 三端系统依赖：
  - **Windows**：WebView2 Runtime（Win10 1809+ 一般已自带）
  - **macOS**：无需额外安装（使用系统 WebKit）
  - **Linux**：`libwebkit2gtk-4.1-dev`（或对应发行版包名），见 [Wails 安装文档](https://v3.wails.io/quick-start/installation/)
- 跨平台交叉编译参考 [Cross-Platform Builds](https://v3.wails.io/guides/build/cross-platform/)

## 测试

```bash
# Go 侧（仓库根）
go build . ./services && go vet . ./services && go test ./services/...

# 前端（frontend/）
npm run build   # vue-tsc 类型检查 + vite build
npm run test    # vitest 单测（176 例）
```

测试覆盖：变量替换、URL/Query 解析、cURL 解析、Postman 导入导出、代码生成、发送管线、树操作、Cookie、响应格式化、历史、Auth 签名（RFC 2069 / RFC 5849 / AWS SigV4 官方测试向量）。

## 项目结构

```
voltra/
├── main.go                     # 应用入口，注册服务、创建窗口
├── go.mod
├── build/config.yml            # 应用元信息（名称 / 标识 / 版本）
├── services/                   # Go 侧（Wails v3 服务）
│   ├── http_service.go         # HTTPService：发送 / 下载（ctx 取消、错误分类、计时、大响应截断）
│   ├── auth.go                 # Digest / OAuth 1.0a / AWS SigV4 签名、OAuth2 取 token
│   ├── ws_service.go           # WSService：连接 / 重连 / 心跳 / 二进制
│   ├── storage_service.go      # StorageService：JSON 持久化 + 文件对话框 + 损坏隔离
│   └── *_test.go               # 纯逻辑单测
└── frontend/
    ├── src/
    │   ├── App.vue             # 六区布局装配
    │   ├── api/backend.ts      # Wails 绑定封装
    │   ├── types/models.ts     # 全量数据模型
    │   ├── stores/             # 模块级 reactive store（workspace/tabs/env/history/settings/ui-state）
    │   ├── lib/                # 变量替换、URL、cURL 解析、Postman 导入导出、发送管线、codegen
    │   ├── locales/zh-CN.ts    # 全部文案
    │   ├── styles/tokens.css   # 设计令牌（:root + [data-theme]）
    │   └── components/         # shell / tree / request / response / ws / env / history / codegen / settings
    ├── test/                   # vitest 单测
    └── bindings/               # Wails 绑定（已入库，无需重新生成）
```

## 数据存储位置

数据存放在系统标准配置目录下的 `voltra` 文件夹（纯本地，不上传任何内容）：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/voltra` |
| Windows | `%APPDATA%/voltra` |
| Linux | `~/.config/voltra` |

包含 `projects.json`（项目 + 环境 + 项目变量）、`settings.json`、`ui-state.json`、`history.json`。方便直接用 Git 做版本管理或手动备份；损坏的文件启动时会自动隔离为 `*.corrupt.<时间戳>` 并降级为空。

## Roadmap（v0.3+）

- 响应 Timeline 展示（Go 侧 DNS/TCP/TLS/TTFB/下载耗时数据已采集，只缺前端展示）
- Tests 结果标签（脚本引擎）
- OpenAPI 3.0/3.1 导入
- 命令面板（Ctrl/Cmd+K）
- 代理设置
- 响应对比、JSON 折叠、动态变量、English 语言包

完整规划见贡献者讨论；已实现/推迟清单随版本演进维护。

## 贡献

欢迎 Issue 与 PR！

1. Fork 本仓库，创建特性分支（`feat/xxx`、`fix/xxx`）
2. 本地门槛全绿后再提交：`go build . ./services && go vet . ./services && go test ./services/...` + `frontend/` 下 `npm run build && npm run test`
3. 提交信息用中文即可，说明「改了什么 + 为什么」
4. 提交 PR，描述中附上相关截图或录屏

约定：

- 前端是纯模块级 reactive store（无 Pinia）；组件状态 Map 必须 `reactive(new Map())`
- 模型深拷贝用 `cloneDeep`，不用 `structuredClone(reactive)`
- 页面缩放走 CSS `zoom`（`--app-zoom`），不要用 Wails Window.Zoom*（macOS 不重排）
- 树拖拽走自研鼠标拖拽引擎（`components/tree/dnd-state.ts`），勿改回原生 HTML5 DnD（WKWebView 不稳）

## 关于 Wails v3（beta）

Voltra 基于 Wails v3（beta）：桌面 API 稳定但仍有开放 bug（Linux 端相对偏多）。Go 侧 beta.3 + npm 锁定 `@wailsio/runtime@3.0.0-beta.16` 的实测可用组合已精确 pin，协议异常时需两侧同升。遇到问题可优先查 [Wails GitHub Issues](https://github.com/wailsapp/wails/issues)。

## License

[MIT](./LICENSE) © [ramboLiang](https://github.com/ramboLiang)
