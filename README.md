# 浏览器调试 MCP Server

[![npm version](https://img.shields.io/npm/v/@aliex7664/puppeteer-debugger-mcp?style=flat-square)](https://www.npmjs.com/package/@aliex7664/puppeteer-debugger-mcp)
[![CI](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/workflows/CI/badge.svg)](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/actions)

一个基于 Puppeteer 和 Chrome DevTools Protocol (CDP) 的 MCP Server 插件，支持通过持久化浏览器连接进行网页调试、性能分析和内存检测。

## 功能特性

- **Console 异常检查**：监听和收集 Console 错误、警告和日志
- **元素状态检查**：检查 DOM 元素的属性、样式、可见性和交互性
- **缓存状态检查**：获取 LocalStorage、SessionStorage、Cookies 和 IndexedDB 状态
- **性能数据获取**：收集 Performance Timeline 和页面加载指标
- **内存堆栈分析**：获取堆快照、分析内存使用、跟踪对象分配、检测内存泄漏
- **持久化连接**：浏览器实例在 Server 启动时创建，保持运行直到 Server 关闭，提高性能

## 系统要求

- Node.js 22 或更高版本
- Chrome 或 Chromium 浏览器

## 安装与配置

在 MCP 客户端（如 Cursor、Claude Desktop 等）的配置文件中添加以下配置：

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

配置完成后，重启 MCP 客户端即可使用。`npx` 会自动下载并运行最新版本的包，无需手动安装。

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

```json
// 1. 导航到页面
{
  "name": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}

// 2. 获取 Console 错误
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

// 分析内存使用情况
{
  "name": "analyze_memory",
  "arguments": {
    "url": "https://example.com"
  }
}

// 跟踪对象分配
{
  "name": "track_allocations",
  "arguments": {
    "url": "https://example.com",
    "duration": 10000
  }
}
```

## 注意事项

- **持久化连接**：浏览器实例在 Server 启动时创建，保持运行直到 Server 关闭。所有工具调用共享同一个浏览器实例，提高性能。
- **动态 URL**：所有工具都支持通过参数传入 URL。如果页面不存在，系统会自动创建新页面并导航到指定 URL。
- **Chrome 路径**：如果系统未安装 Chrome 或 Chromium，或安装路径不在默认位置，可以通过 `PUPPETEER_EXECUTABLE_PATH` 环境变量指定浏览器路径：
  - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Linux: `/usr/bin/google-chrome` 或 `/usr/bin/chromium-browser`

## 许可证

MIT
