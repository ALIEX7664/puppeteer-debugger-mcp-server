## [2.1.1](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v2.1.0...v2.1.1) (2025-12-18)


### Bug Fixes

* **heap:** 默认导出到 .heapsnapshot 并完善导出指引 ([4cc57f3](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/4cc57f3e6d7b960d887c83ec61dd0420094cf8e0))

# [2.1.0](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v2.0.0...v2.1.0) (2025-12-18)


### Bug Fixes

* **ci:** Tests 工作流仅在 Node 20 运行 ([d7a2555](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/d7a255598debc58641cb31cb03f0cc325b200def))


### Features

* **heap:** 完善 heap snapshot 采集/解析并支持 MCP Inspector 调试 ([83ccc7d](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/83ccc7d33240767d0294b1ed7f90ba9bdb5d596e))

# [2.0.0](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v1.0.7...v2.0.0) (2025-12-16)


### chore

* 将 Node.js 版本要求从 22 降级到 20 ([439f094](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/439f0943449560955653da00c81ee9002ded70bd))


### BREAKING CHANGES

* 最低 Node.js 版本要求从 22 降级到 20

- 更新 README.md 中的系统要求

- 更新 GitHub Actions 工作流中的 node-version

- 更新 .nvmrc 文件

## [1.0.7](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v1.0.6...v1.0.7) (2025-12-16)


### Bug Fixes

* **browser:** 切换回 puppeteer 并优先使用本地浏览器 ([e217042](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/e217042aac25029f9f6020b7bb182f3dfc72c550))

## [1.0.6](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v1.0.5...v1.0.6) (2025-12-16)


### Bug Fixes

* **build:** 修复 tsup 配置中的 puppeteer-core 外部依赖声明 ([9b76f69](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/9b76f6980848091b5cbbf96fa6cb6e98439448df))

## [1.0.5](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v1.0.4...v1.0.5) (2025-12-16)


### Bug Fixes

* **server:** 修复程序启动异常，移除 lighthouse 依赖 ([8fc8af9](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/8fc8af90eb82e486e223ac0d3603d2170a149d96))

## [1.0.4](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/compare/v1.0.3...v1.0.4) (2025-12-16)


### Bug Fixes

* **server:** 修复内存占用过高问题 ([0f6c53c](https://github.com/ALIEX7664/puppeteer-debugger-mcp-server/commit/0f6c53c41f3d16f185539b6aadcc5f1d232c83f7))

## [1.0.3](https://github.com/ALIEX7664/mcp/compare/v1.0.2...v1.0.3) (2025-12-15)


### Bug Fixes

* 调整项目测试 ([84a8bca](https://github.com/ALIEX7664/mcp/commit/84a8bcaf3280b0b47d3847a1843507b456bff46c))

# 1.0.0 (2025-12-15)


### Bug Fixes

* **ci:** 修复 semantic-release 配置文件路径问题 ([a8e7fa3](https://github.com/ALIEX7664/mcp/commit/a8e7fa3c2dd745fee46f6580173ae2a8a55acce5))
* **ci:** 将 semantic-release 配置移到 package.json ([6e5f7f8](https://github.com/ALIEX7664/mcp/commit/6e5f7f8e146a23327ad282ae6f0c4915fa68cb88))
* **ci:** 添加 npm 认证配置步骤 ([97b3031](https://github.com/ALIEX7664/mcp/commit/97b3031cceb43ece056468a3f81460d6551b4d4e))
* 修复 version 错误, 调整配置 ([a8c9205](https://github.com/ALIEX7664/mcp/commit/a8c9205c7b8d4cde0f8fe090e2778b8d90c42dfb))


### Features

* 初始化浏览器调试 MCP Server 插件 ([25257be](https://github.com/ALIEX7664/mcp/commit/25257be5516f6e8eee513ff3bf05653acbd0b614))
