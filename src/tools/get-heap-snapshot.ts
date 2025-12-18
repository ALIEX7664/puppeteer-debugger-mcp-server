import { z } from 'zod';
import { ToolDefinition, ToolContext } from './types.js';

/**
 * 获取堆快照工具定义
 */
export const getHeapSnapshotTool: ToolDefinition = {
    name: 'get_heap_snapshot',
    description: '获取堆快照',
    inputSchema: z.object({
        url: z.string().optional().describe('页面 URL（可选）'),
        topN: z.number().int().positive().max(200).optional().describe('Top N（构造函数/节点）数量，默认 20'),
        collectGarbage: z.boolean().optional().describe('采集前是否触发 GC，默认 false'),
        maxSnapshotBytes: z.number().int().positive().optional().describe('raw snapshot 采集最大字节数，默认 200MB'),
        maxParseBytes: z.number().int().positive().optional().describe('JSON.parse 解析最大字节数，默认 50MB'),
        export: z.object({
            mode: z.enum(['none', 'file', 'inline', 'both']).optional().describe('raw snapshot 导出方式'),
            filePath: z.string().optional().describe('file/both 模式的输出文件路径（不填则写入系统临时目录）'),
            maxInlineBytes: z.number().int().positive().optional().describe('inline/both 模式 inline 输出最大字节数（超出截断）'),
        }).optional().describe('raw snapshot 导出选项'),
    }),
    handler: async (
        args: {
            url?: string;
            topN?: number;
            collectGarbage?: boolean;
            maxSnapshotBytes?: number;
            maxParseBytes?: number;
            export?: { mode?: 'none' | 'file' | 'inline' | 'both'; filePath?: string; maxInlineBytes?: number };
        },
        context: ToolContext
    ) => {
        const snapshot = await context.heapHandler.getHeapSnapshot({
            url: args.url,
            topN: args.topN,
            collectGarbage: args.collectGarbage,
            maxSnapshotBytes: args.maxSnapshotBytes,
            maxParseBytes: args.maxParseBytes,
            export: args.export,
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(snapshot, null, 2),
                },
            ],
        };
    },
};

