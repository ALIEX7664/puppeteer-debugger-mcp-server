import { z } from 'zod';
import { ToolDefinition, ToolContext } from './types.js';
import {
  saveScreenshotToFile,
  ensurePageFullyLoaded,
  PNG_BASE64_DATA_URI_PREFIX,
  calculateBase64Size,
} from '../utils/screenshot-utils.js';

/**
 * 截图工具定义
 */
export const takeScreenshotTool: ToolDefinition = {
  name: 'take_screenshot',
  description:
    '截图工具（辅助调试）。支持视口截图和全页截图。建议在使用前询问用户希望的输出方式：如果用户需要直接查看图片，使用 inline 模式返回 base64；如果用户需要保存图片文件，使用 file 或 auto 模式保存为文件。对于全页截图或大图片，强烈建议使用 file/auto 模式避免响应过大。',
  inputSchema: z.object({
    url: z.string().optional().describe('页面 URL（可选）'),
    fullPage: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        '是否截取整页。true 表示截取整个页面（包括需要滚动才能看到的内容），false 表示只截取当前视口可见部分。全页截图会自动触发懒加载内容，确保完整截图。'
      ),
    outputMode: z
      .enum(['auto', 'file', 'inline'])
      .optional()
      .default('auto')
      .describe(
        [
          '输出模式（建议在使用前询问用户偏好）：',
          '- auto：根据图片大小自动选择（小于阈值返回 base64，大于阈值保存为文件，默认阈值 100KB）',
          '- file：始终保存为文件，返回文件路径（适合用户明确需要保存文件的情况）',
          '- inline：始终返回 base64 编码的图片数据（适合用户需要直接查看小图片的情况，不推荐用于全页截图，因为会导致响应过大）',
          '',
          '选择建议：',
          '- 如果用户说"截图"、"保存截图"、"下载截图"等，使用 file 或 auto 模式',
          '- 如果用户说"显示截图"、"查看截图"、"预览截图"等，且图片较小（非全页），可以使用 inline 模式',
          '- 如果用户未明确说明，或进行全页截图，默认使用 auto 模式',
          '- 如果不确定用户需求，建议询问："您希望截图以什么方式返回？1) 保存为文件（推荐，适合大图片） 2) 直接返回图片数据（仅适合小图片）"',
        ].join('\n')
      ),
    filePath: z
      .string()
      .optional()
      .describe(
        '文件保存路径（可选，仅在 file/auto 模式时有效）。如果未指定，默认保存到 ./screenshots/screenshot-{timestamp}-{random}.png。可以使用相对路径（相对于 MCP Server 工作目录）或绝对路径。'
      ),
    maxBase64SizeKB: z
      .number()
      .int()
      .positive()
      .optional()
      .default(100)
      .describe(
        'auto 模式阈值（KB，base64 大小，默认 100KB）。当 auto 模式下，如果图片的 base64 大小超过此阈值，会自动保存为文件；否则返回 base64。'
      ),
    scrollDelay: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(1000)
      .describe('滚动后等待时间（毫秒，用于触发懒加载，默认 1000）'),
    waitForSelector: z
      .string()
      .optional()
      .describe('等待特定选择器加载（可选，字符串）'),
  }),
  handler: async (
    args: {
      url?: string;
      fullPage?: boolean;
      outputMode?: 'auto' | 'file' | 'inline';
      filePath?: string;
      maxBase64SizeKB?: number;
      scrollDelay?: number;
      waitForSelector?: string;
    },
    context: ToolContext
  ) => {
    const page = await context.browserManager.getPage(args.url);

    // 如果指定了 waitForSelector，等待元素加载
    if (args.waitForSelector) {
      try {
        await page.waitForSelector(args.waitForSelector, { timeout: 10000 });
      } catch {
        // 如果超时，继续执行
      }
    }

    // 如果 fullPage 为 true，执行改进的全页截图流程
    if (args.fullPage) {
      await ensurePageFullyLoaded(page, args.scrollDelay ?? 1000);
    } else {
      // 非全页截图时，确保页面在顶部（避免之前操作导致页面滚动）
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 执行截图
    // 注意：对于 inline 模式，即使需要返回 base64，也先使用 Buffer 模式截图
    // 这样可以确保 fullPage 选项正确工作，然后再转换为 base64
    const screenshot = (await page.screenshot({
      fullPage: args.fullPage || false,
      encoding: undefined, // 始终使用 Buffer 模式，确保 fullPage 正确工作
    })) as Buffer;

    // inline 模式：转换为 base64 后返回
    if (args.outputMode === 'inline') {
      const base64String = `${PNG_BASE64_DATA_URI_PREFIX}${screenshot.toString('base64')}`;
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot taken (base64): ${base64String}`,
          },
        ],
      };
    }

    // file 模式：始终保存为文件
    if (args.outputMode === 'file') {
      const result = await saveScreenshotToFile(screenshot, args.filePath);
      const sizeKB = Math.round(result.size / 1024);
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot saved to: ${result.filePath}\nFile size: ${sizeKB}KB`,
          },
        ],
      };
    }

    // auto 模式：根据大小自动选择
    const base64String = `${PNG_BASE64_DATA_URI_PREFIX}${screenshot.toString('base64')}`;
    const base64SizeKB = Math.round(calculateBase64Size(base64String) / 1024);
    const thresholdKB = args.maxBase64SizeKB || 100;

    if (base64SizeKB <= thresholdKB) {
      // 小图片：返回 base64
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot taken (base64): ${base64String}`,
          },
        ],
      };
    } else {
      // 大图片：保存为文件
      const result = await saveScreenshotToFile(screenshot, args.filePath);
      const sizeKB = Math.round(result.size / 1024);
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot saved to: ${result.filePath}\nFile size: ${sizeKB}KB (base64 size: ${base64SizeKB}KB, exceeded threshold: ${thresholdKB}KB)`,
          },
        ],
      };
    }
  },
};

