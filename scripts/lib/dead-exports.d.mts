/**
 * dead-exports.mjs 的类型声明
 *
 * tsconfig 的 include 覆盖了 test 目录下的 ts 文件，而单测要引用这个 mjs 实现
 * （同一份逻辑给 CLI 和单测共用）。在 bundler 模块解析下，TS 会把
 * dead-exports.mjs 解析到 dead-exports.d.mts，所以补这份声明。
 */

/** 允许清单项：由框架或外部约定调用，源码里查不到引用点 */
export interface AllowedSymbol {
  file: string
  name: string
  reason: string
}

/** 只在测试里被引用（生产代码未接线）的符号 */
export interface OnlyTestSymbol {
  file: string
  name: string
  inTest: number
}

/** 完全死代码（src 与 test 都没引用） */
export interface DeadSymbol {
  file: string
  name: string
}

export interface DeadSymbolReport {
  fileCount: number
  symbolCount: number
  onlyTest: OnlyTestSymbol[]
  fullyDead: DeadSymbol[]
}

export declare const ALLOWED: AllowedSymbol[]

export declare function scanDeadSymbols(cwd?: string): DeadSymbolReport
