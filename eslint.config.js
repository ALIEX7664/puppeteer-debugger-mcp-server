import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ESLint 配置文件
 * 
 * 使用 ESLint 9.x Flat Config 格式
 * 参考：https://eslint.org/docs/head/use/configure/configuration-files
 */

export default defineConfig([
    // 基础 ESLint 推荐配置
    eslint.configs.recommended,

    // TypeScript ESLint 推荐配置（包含类型检查）- 应用于 src 和 types 目录
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
        ...config,
        files: ['src/**/*.ts', 'types/**/*.ts'],
        languageOptions: {
            ...config.languageOptions,
            parserOptions: {
                ...config.languageOptions?.parserOptions,
                project: true,
                tsconfigRootDir: __dirname,
            },
        },
    })),

    // 源代码文件配置 - 适配 src/ 目录结构（包括 cdp-handlers/, tools/, utils/ 等子目录）
    {
        files: ['src/**/*.ts', 'types/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            // ===== 关键错误规则（必须修复）=====
            'no-debugger': 'error', // 禁止 debugger
            'no-throw-literal': 'error', // 只能抛出 Error 实例
            '@typescript-eslint/no-floating-promises': 'off', // 禁止未处理的 Promise
            '@typescript-eslint/await-thenable': 'off', // 只能 await Promise
            '@typescript-eslint/require-await': 'off',


            // ===== 代码质量规则（警告级别）=====
            '@typescript-eslint/no-explicit-any': 'warn', // 警告使用 any

            '@typescript-eslint/explicit-function-return-type': [
                'warn',
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                    allowHigherOrderFunctions: true,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-misused-promises': 'warn', // 警告 Promise 误用
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn', // 不安全的参数传递
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn', // 不必要的类型断言
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/prefer-optional-chain': 'warn',
            'no-console': 'warn', // 警告 console 使用
            'prefer-const': 'warn', // 优先使用 const
            'no-var': 'warn', // 警告使用 var
            'eqeqeq': ['warn', 'always'], // 建议使用 === 和 !==
            'curly': ['warn', 'all'], // 建议使用大括号

            // ===== 代码风格规则（警告级别）=====
            'no-trailing-spaces': 'warn', // 警告尾随空格
            'eol-last': ['warn', 'always'], // 建议文件末尾有换行
            'comma-dangle': ['warn', 'always-multiline'], // 建议多行时使用尾随逗号
            'quotes': ['warn', 'single', { avoidEscape: true }], // 建议使用单引号
            'semi': ['warn', 'always'], // 建议使用分号
        },
    },

    // 测试和脚本文件配置（统一处理）
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    })),
    {
        files: ['tests/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: false,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-floating-promises': 'off', // 需要类型信息，禁用
            '@typescript-eslint/await-thenable': 'off', // 需要类型信息，禁用
            '@typescript-eslint/no-misused-promises': 'off', // 需要类型信息，禁用
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
            'no-debugger': 'warn', // 测试文件中允许 debugger，但警告
        },
    },

    // 全局忽略配置
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            '*.config.js',
            '*.config.ts',
            'screenshots/**',
            'pnpm-lock.yaml',
            'CHANGELOG.md',
            '*.md',
            'vitest.config.ts',
            'tsup.config.ts',
        ],
    },
]);
