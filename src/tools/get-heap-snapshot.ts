import { z } from 'zod';
import { ToolDefinition, ToolContext } from './types.js';

/**
 * 获取堆快照工具定义
 */
export const getHeapSnapshotTool: ToolDefinition = {
    name: 'get_heap_snapshot',
    description: '获取堆快照（建议先让用户选择是否导出 raw snapshot，以及导出方式：none/file/inline/both）',
    inputSchema: z.object({
        url: z.string().optional().describe('页面 URL（可选）'),
        topN: z.number().int().positive().max(200).optional().describe('Top N（构造函数/节点）数量，默认 20'),
        collectGarbage: z.boolean().optional().describe('采集前是否触发 GC，默认 false'),
        maxSnapshotBytes: z.number().int().positive().optional().describe('raw snapshot 采集最大字节数，默认 200MB'),
        maxParseBytes: z.number().int().positive().optional().describe('JSON.parse 解析最大字节数，默认 50MB'),
        export: z.object({
            mode: z.enum(['none', 'file', 'inline', 'both']).optional().describe(
                [
                    'raw snapshot 导出方式（建议先让用户选择）：',
                    '- none：不导出（只返回摘要 summary）',
                    '- file：导出为文件（推荐，避免响应过大）',
                    '- inline：把快照片段放到返回里（会截断，可能很大）',
                    '- both：同时 file + inline',
                ].join('\n')
            ),
            filePath: z.string().optional().describe(
                [
                    'file/both 模式的输出文件路径（建议先问用户要保存到哪里）。',
                    '推荐使用相对路径（相对 MCP Server 进程工作目录）：例如 ./.heapsnapshot/baidu.heapsnapshot',
                    '不填时默认写入当前目录下的 ./.heapsnapshot/ 目录，并自动创建目录。',
                ].join('\n')
            ),
            maxInlineBytes: z.number().int().positive().optional().describe(
                'inline/both 模式 inline 输出最大字节数（超出截断）。建议先问用户是否接受截断与体积。'
            ),
        }).optional().describe('raw snapshot 导出选项（建议先确认导出方式与路径）'),
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

