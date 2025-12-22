import { Page } from 'puppeteer';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * PNG 图片的 base64 data URI 前缀
 */
export const PNG_BASE64_DATA_URI_PREFIX = 'data:image/png;base64,';

/**
 * 保存截图到文件
 */
export async function saveScreenshotToFile(
  buffer: Buffer,
  filePath?: string
): Promise<{ filePath: string; isTempFile: boolean; size: number }> {
  const defaultPath = join(
    '.',
    'screenshots',
    `screenshot-${Date.now()}-${randomUUID()}.png`
  );

  const finalPath = filePath ?? defaultPath;
  // isTempFile 表示文件是否在临时目录（tmpdir），defaultPath 不在临时目录
  const isTempFile = false;

  // 确保目录存在
  await mkdir(dirname(finalPath), { recursive: true });

  // 写入文件
  await writeFile(finalPath, buffer);

  // 获取文件大小
  const stats = await stat(finalPath);
  const size = stats.size;

  return {
    filePath: finalPath,
    isTempFile,
    size,
  };
}

/**
 * 计算 base64 字符串的大小（字节）
 */
export function calculateBase64Size(base64: string): number {
  // Base64 编码后大小约为原文件的 4/3
  // 移除可能的数据 URI 前缀
  const base64Data = base64.replace(
    new RegExp(`^${PNG_BASE64_DATA_URI_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    ''
  );
  // Base64 字符串长度 * 3/4 ≈ 原始字节数
  return Math.ceil((base64Data.length * 3) / 4);
}

/**
 * 确保页面完全加载并触发懒加载内容
 */
export async function ensurePageFullyLoaded(
  page: Page,
  scrollDelay: number = 1000
): Promise<void> {
  // 1. 等待页面加载完成
  try {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', () => resolve(), { once: true });
          setTimeout(() => resolve(), 10000);
        }
      });
    });
  } catch {
    // 如果出错，继续执行
  }

  // 2. 等待一段时间确保资源加载
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 3. 滚动到底部触发懒加载
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  // 4. 等待懒加载内容加载
  await new Promise((resolve) => setTimeout(resolve, scrollDelay));

  // 5. 再次滚动确保所有内容都已触发
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  // 6. 等待最终稳定
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 7. 滚动回顶部，确保 fullPage 截图从顶部开始
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });

  // 8. 等待滚动完成
  await new Promise((resolve) => setTimeout(resolve, 200));
}

