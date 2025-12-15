# 浏览器调试 MCP Server

一个基于 Puppeteer 和 Chrome DevTools Protocol (CDP) 的 MCP Server 插件，支持通过持久化浏览器连接进行调试和排查。

## 功能特性

- **Console 异常检查**：监听和收集 Console 错误、警告和日志
- **元素状态检查**：检查 DOM 元素的属性、样式、可见性和交互性
- **缓存状态检查**：获取 LocalStorage、SessionStorage、Cookies 和 IndexedDB 状态
- **性能数据获取**：收集 Performance Timeline 和页面加载指标
- **内存堆栈分析**：获取堆快照、分析内存使用、跟踪对象分配、检测内存泄漏
- **持久化连接**：浏览器实例在 Server 启动时创建，保持运行直到 Server 关闭

## 技术栈

- Node.js 22
- TypeScript
- Puppeteer
- MCP SDK (@modelcontextprotocol/sdk)

## 安装

1. 确保已安装 Node.js 22（使用 nvs 管理版本）

```bash
# 如果使用 nvs
nvs auto
```

2. 安装依赖

```bash
npm install
```

3. 编译项目

```bash
npm run build
```

项目使用 [tsup](https://tsup.egoist.dev/) 进行构建，它基于 esbuild，比传统的 tsc 更快。

## 配置

### 使用 npx 方式（推荐）

在 MCP 客户端配置文件中添加以下配置：

```json
{
  "mcpServers": {
    "puppeteer-debugger-mcp": {
      "command": "npx",
      "args": ["-y", "@aliex7664/puppeteer-debugger-mcp"]
    }
  }
}
```

`npx` 会自动下载并运行最新版本的 `@aliex7664/puppeteer-debugger-mcp` 包。

### 本地开发方式

如果你在本地开发或修改了代码，可以使用以下方式：

1. **使用 npm link（推荐用于本地开发）**：

```bash
# 在项目目录中
npm install
npm run build
npm link

# 然后在 MCP 配置中使用
{
  "mcpServers": {
    "puppeteer-debugger-mcp": {
      "command": "npx",
      "args": ["-y", "@aliex7664/puppeteer-debugger-mcp"]
    }
  }
}
```

2. **直接使用 node 运行**：

```json
{
  "mcpServers": {
    "puppeteer-debugger-mcp": {
      "command": "node",
      "args": ["path/to/@aliex7664/puppeteer-debugger-mcp/dist/index.js"]
    }
  }
}
```

## 可用工具

### 1. navigate

导航到指定 URL。

**参数：**

- `url` (string, 必需): 要导航到的 URL

**示例：**

```json
{
  "name": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 2. get_console_errors

获取 Console 异常和日志。

**参数：**

- `url` (string, 可选): 页面 URL，如果未提供则使用当前页面
- `level` (string, 可选): 日志级别过滤 (`error` | `warning` | `all`)，默认为 `all`

**示例：**

```json
{
  "name": "get_console_errors",
  "arguments": {
    "url": "https://example.com",
    "level": "error"
  }
}
```

### 3. check_element

检查元素状态（属性、样式、可见性等）。

**参数：**

- `selector` (string, 必需): CSS 选择器
- `url` (string, 可选): 页面 URL

**示例：**

```json
{
  "name": "check_element",
  "arguments": {
    "selector": "#my-button",
    "url": "https://example.com"
  }
}
```

### 4. get_cache_status

获取缓存状态（LocalStorage、SessionStorage、Cookies、IndexedDB）。

**参数：**

- `url` (string, 可选): 页面 URL

**示例：**

```json
{
  "name": "get_cache_status",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 5. get_performance

获取性能数据（Performance Timeline、页面加载指标）。

**参数：**

- `url` (string, 可选): 页面 URL

**示例：**

```json
{
  "name": "get_performance",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 6. get_heap_snapshot

获取堆快照。

**参数：**

- `url` (string, 可选): 页面 URL

**示例：**

```json
{
  "name": "get_heap_snapshot",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 7. analyze_memory

分析内存使用情况。

**参数：**

- `url` (string, 可选): 页面 URL

**示例：**

```json
{
  "name": "analyze_memory",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 8. track_allocations

跟踪对象分配。

**参数：**

- `url` (string, 可选): 页面 URL
- `duration` (number, 可选): 跟踪时长（毫秒），默认 5000

**示例：**

```json
{
  "name": "track_allocations",
  "arguments": {
    "url": "https://example.com",
    "duration": 10000
  }
}
```

### 9. take_screenshot

截图（辅助调试）。

**参数：**

- `url` (string, 可选): 页面 URL
- `fullPage` (boolean, 可选): 是否截取整页，默认 false

**示例：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true
  }
}
```

## 使用示例

### 检查页面错误

1. 导航到页面
2. 获取 Console 错误

```json
// 步骤 1: 导航
{
  "name": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}

// 步骤 2: 获取错误
{
  "name": "get_console_errors",
  "arguments": {
    "level": "error"
  }
}
```

### 分析页面性能

```json
{
  "name": "get_performance",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 检查元素状态

```json
{
  "name": "check_element",
  "arguments": {
    "selector": "button.submit",
    "url": "https://example.com"
  }
}
```

### 内存泄漏检测

```json
// 获取初始堆快照
{
  "name": "get_heap_snapshot",
  "arguments": {
    "url": "https://example.com"
  }
}

// 分析内存
{
  "name": "analyze_memory",
  "arguments": {
    "url": "https://example.com"
  }
}

// 跟踪分配
{
  "name": "track_allocations",
  "arguments": {
    "url": "https://example.com",
    "duration": 10000
  }
}
```

## 项目结构

```
puppeteer-debugger-mcp/
├── .nvmrc                    # Node 版本配置
├── package.json              # 项目依赖和脚本
├── tsconfig.json             # TypeScript 配置
├── src/
│   ├── index.ts              # MCP Server 入口文件
│   ├── browser-manager.ts    # 浏览器连接管理器
│   ├── types.ts              # TypeScript 类型定义
│   └── cdp-handlers/         # CDP 功能处理器
│       ├── console-handler.ts
│       ├── element-handler.ts
│       ├── cache-handler.ts
│       ├── performance-handler.ts
│       └── heap-handler.ts
└── README.md                 # 项目说明文档
```

## 开发

### 构建

使用 tsup 构建项目：

```bash
npm run build
```

构建配置在 `tsup.config.ts` 中，主要特性：

- 基于 esbuild，构建速度快
- 自动生成 source maps（用于调试）
- 生成 TypeScript 类型声明文件（.d.ts）
- 保持文件结构（不打包成单个文件）
- 启用 tree shaking（移除未使用的代码）

### 开发模式（监听文件变化）

```bash
npm run dev
```

在开发模式下，tsup 会监听文件变化并自动重新构建。

### 运行

```bash
npm start
```

### 构建选项

tsup 支持多种构建选项，可以通过命令行参数传递：

```bash
# 压缩代码（生产环境）
npm run build -- --minify

# 只构建不生成类型声明
npm run build -- --no-dts

# 不清理输出目录
npm run build -- --no-clean
```

## 注意事项

1. **持久化连接**：浏览器实例在 Server 启动时创建，保持运行直到 Server 关闭。所有工具调用共享同一个浏览器实例。

2. **动态 URL**：所有工具都支持通过参数传入 URL。如果页面不存在，系统会自动创建新页面并导航到指定 URL。

3. **资源清理**：Server 关闭时会自动清理所有浏览器连接和页面。

4. **错误处理**：所有工具调用都包含错误处理，错误信息会通过 MCP 协议返回。

5. **Chrome 要求**：

   - 需要确保系统已安装 Chrome 或 Chromium
   - Windows: 默认路径 `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - macOS: 默认路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: 默认路径 `/usr/bin/google-chrome` 或 `/usr/bin/chromium-browser`
   - 可以通过 `PUPPETEER_EXECUTABLE_PATH` 环境变量自定义路径

## 许可证

MIT
