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

- Node.js 20 或更高版本
- Chrome 或 Chromium 浏览器

## 安装与配置

在 MCP 客户端（如 Cursor、Claude Desktop 等）的配置文件中添加以下配置：

```json
{
  "mcpServers": {
    "puppeteer-debugger-mcp": {
      "command": "npx",
      "args": ["-y", "@aliex7664/puppeteer-debugger-mcp@latest"]
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
- `topN` (number, 可选): Top N（构造函数/节点）数量，默认 20
- `collectGarbage` (boolean, 可选): 采集前是否触发 GC，默认 false
- `maxSnapshotBytes` (number, 可选): raw snapshot 采集最大字节数，默认 200MB（超出将截断并跳过解析）
- `maxParseBytes` (number, 可选): JSON.parse 解析最大字节数，默认 50MB（超出将跳过解析）
- `export` (object, 可选): raw snapshot 导出选项
  - `mode` ('none' | 'file' | 'inline' | 'both', 可选): 导出方式，默认 `none`
  - `filePath` (string, 可选): file/both 模式输出路径；不填则默认写入当前目录下的 `./.heapsnapshot/`（服务端会自动创建目录）
  - `maxInlineBytes` (number, 可选): inline/both 模式 inline 输出最大字节数（超出截断）

**示例：**

```json
{
  "name": "get_heap_snapshot",
  "arguments": {
    "url": "https://example.com",
    "topN": 20,
    "export": {
      "mode": "both",
      "maxInlineBytes": 65536
    }
  }
}
```

**返回（new shape）：**

- `timestamp`: 采集时间戳
- `summary`: 解析摘要（`parsed` 为 true 时包含 `totalNodes/totalSizeBytes/topConstructors/topNodes`）
- `export`: raw snapshot 导出结果（file/inline/both）
- `limitations`（可选）: 截断/跳过解析等限制说明

**兼容字段（deprecated，计划下个 major 移除）：**

- `totalSize`：请迁移到 `summary.totalSizeBytes`
- `totalNodes`：请迁移到 `summary.totalNodes`
- `nodes`：为避免响应过大，可能仅返回 TopN 节点（截断）；请迁移到 `summary.topNodes`（或使用 `export.filePath` 导出原始快照后再做离线分析）

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
- `topN` (number, 可选): Top N（调用栈）数量，默认 20
- `collectGarbage` (boolean, 可选): 采集前是否触发 GC，默认 false
- `maxSnapshotBytes` (number, 可选): raw profile（带 trace 的 heap snapshot）采集最大字节数，默认 200MB
- `maxParseBytes` (number, 可选): JSON.parse 解析最大字节数，默认 50MB
- `export` (object, 可选): raw profile 导出选项（推荐 `file`，避免响应过大）
  - `mode` (string, 可选): `none` | `file` | `inline` | `both`
  - `filePath` (string, 可选): `file/both` 模式输出路径（推荐相对路径，如 `./.heapsnapshot/alloc.heapsnapshot`）
  - `maxInlineBytes` (number, 可选): `inline/both` 模式 inline 最大字节数（超出截断）

**示例：**

```json
{
  "name": "track_allocations",
  "arguments": {
    "url": "https://example.com",
    "duration": 10000,
    "topN": 20,
    "export": {
      "mode": "file",
      "filePath": "./.heapsnapshot/alloc-example.heapsnapshot"
    }
  }
}
```

### 9. take_screenshot

截图（辅助调试）。支持智能输出模式，自动根据图片大小选择返回 base64 或保存为文件，改进的全页截图功能可正确处理懒加载内容。

**参数：**

- `url` (string, 可选): 页面 URL（可选）
- `fullPage` (boolean, 可选): 是否截取整页，默认 false
- `outputMode` (string, 可选): 输出模式，默认 `auto`
  - `auto`：根据图片大小自动选择（小图片返回 base64，大图片保存为文件）
  - `file`：始终保存为文件，返回路径
  - `inline`：始终返回 base64（仅用于小图片）
- `filePath` (string, 可选): 文件保存路径（file/auto 模式使用，默认：`./screenshots/screenshot-{timestamp}-{random}.png`）
- `maxBase64SizeKB` (number, 可选): auto 模式阈值（KB，base64 大小，默认 100KB base64 ≈ 75KB 原图）
- `scrollDelay` (number, 可选): 滚动后等待时间（毫秒，用于触发懒加载，默认 1000）
- `waitForSelector` (string, 可选): 等待特定选择器加载（可选）

**示例：**

**基本截图（视口）：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**全页截图（自动输出模式）：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true,
    "outputMode": "auto"
  }
}
```

**保存为文件：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true,
    "outputMode": "file",
    "filePath": "./screenshots/example.png"
  }
}
```

**返回 base64（小图片）：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com",
    "outputMode": "inline"
  }
}
```

**等待特定元素加载后截图：**

```json
{
  "name": "take_screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true,
    "waitForSelector": ".main-content",
    "scrollDelay": 2000
  }
}
```

### 10. get_lighthouse

获取 Lighthouse 性能报告（包括性能、可访问性、最佳实践、SEO 等指标）。

**参数：**

- `url` (string, 可选): 页面 URL（可选）
- `onlyCategories` (string[], 可选): 只分析的类别（可选，如：`performance`, `accessibility`, `best-practices`, `seo`）
- `skipAudits` (string[], 可选): 跳过的审计项 ID（可选，如：`uses-optimized-images`, `render-blocking-resources`）

**示例：**

```json
{
  "name": "get_lighthouse",
  "arguments": {
    "url": "https://example.com",
    "onlyCategories": ["performance", "accessibility"],
    "skipAudits": ["uses-optimized-images"]
  }
}
```

**返回结构：**

返回的报告中包含以下字段：

- `url`: 页面 URL
- `fetchTime`: 报告生成时间
- `userAgent`: 用户代理字符串
- `categories`: 类别评分（根据 `onlyCategories` 参数过滤）
  - `performance`: 性能评分
  - `accessibility`: 可访问性评分
  - `best-practices`: 最佳实践评分
  - `seo`: SEO 评分
- `metrics`: 性能指标
  - `firstContentfulPaint`: 首次内容绘制时间
  - `largestContentfulPaint`: 最大内容绘制时间
  - `totalBlockingTime`: 总阻塞时间
  - `cumulativeLayoutShift`: 累积布局偏移
  - `speedIndex`: 速度指数
  - `timeToInteractive`: 可交互时间
  - `firstInputDelay`: 首次输入延迟
  - `timeToFirstByte`: 首字节时间
- `opportunities`: 优化建议（根据 `skipAudits` 参数过滤）
- `diagnostics`: 诊断信息（根据 `skipAudits` 参数过滤）
- `implementation`: 固定为 `"approximation"`，表示这是基于 Web Vitals 和 CDP 的近似实现
- `limitations`: 限制说明数组，包含以下内容：
  - `"accessibility/best-practices/seo 评分为近似值，非完整审计"`
  - `"指标采集基于 Web Vitals 和 CDP，可能与真实 Lighthouse 结果有差异"`
  - `"部分审计项可能缺失或不完整"`

**注意事项：**

- `onlyCategories` 参数用于过滤返回的类别，如果未指定则返回所有类别
- `skipAudits` 参数用于跳过特定的审计项，这些审计项不会出现在 `opportunities` 和 `diagnostics` 中
- 返回的评分和指标是基于 Web Vitals 和 CDP 的近似值，可能与真实 Lighthouse 结果有差异
- `accessibility`、`best-practices` 和 `seo` 的评分为占位值，仅供参考

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

### Lighthouse 性能分析

```json
// 获取完整的 Lighthouse 报告
{
  "name": "get_lighthouse",
  "arguments": {
    "url": "https://example.com"
  }
}

// 只分析性能类别
{
  "name": "get_lighthouse",
  "arguments": {
    "url": "https://example.com",
    "onlyCategories": ["performance"]
  }
}

// 跳过特定审计项
{
  "name": "get_lighthouse",
  "arguments": {
    "url": "https://example.com",
    "skipAudits": ["uses-optimized-images", "render-blocking-resources"]
  }
}
```

## 注意事项

- **持久化连接**：浏览器实例在 Server 启动时创建，保持运行直到 Server 关闭。
- **动态 URL**：所有工具都支持通过参数传入 URL。如果页面不存在，系统会自动创建新页面并导航到指定 URL。
- **Chrome 路径**：如果系统未安装 Chrome 或 Chromium，或安装路径不在默认位置，可以通过 `PUPPETEER_EXECUTABLE_PATH` 环境变量指定浏览器路径：
  - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Linux: `/usr/bin/google-chrome` 或 `/usr/bin/chromium-browser`

## 许可证

MIT
