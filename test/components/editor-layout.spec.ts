/**
 * 编辑器行高一致性守卫
 *
 * 拖拽重排用**固定行高**反算落点（`usePointerReorder` 里
 * `listTop = 按下点Y - 起始下标 × 行高`），所以「一行恰好等于常量那么多像素」
 * 是拖拽正确性的前提，而不是样式偏好。它有两个**静默**失效方式：
 *
 * 1. CSS 里的 `height` 与常量不一致 —— 拖拽不报错，只是搬到了错的位置；
 * 2. 行之间加了纵向 `margin`（或行高含 padding/border 但没 `border-box`）——
 *    行不再连续，落点随距离线性偏移，同样不报错。
 *
 * 两种都只能靠「改完还能跑」发现不了，所以在这里用源码断言守住。
 * 读源码而不是读构建产物：产物被 gitignore，新克隆的仓库里不存在。
 *
 * 注意**不要**把断言写成「期望值 = 被测常量」的同义反复：
 * 行高与常量的耦合关系才是被测对象，字面量（56 / 44）只出现在被测源码里。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ITEM_ROW_HEIGHT, OPTION_ROW_HEIGHT } from '@/components/editor/constants'

const ROOT = join(__dirname, '..', '..')
const ITEM_ROW_FILE = join(ROOT, 'src/components/editor/EditorItemRow.vue')
const OPTION_EDITOR_FILE = join(ROOT, 'src/components/editor/EditorOptionEditor.vue')

const itemRowSource = readFileSync(ITEM_ROW_FILE, 'utf8')
const optionEditorSource = readFileSync(OPTION_EDITOR_FILE, 'utf8')

/**
 * 取出 `selector { ... }` 的声明块
 *
 * 选择器必须精确到 ` {` 之前，否则 `.bx-editor-item-row` 会命中
 * `.bx-editor-item-row--selected`（后者在它之后，倒不会出错，
 * 但反过来若修饰类写在前面就会取错块）。
 */
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    return ''
  }
  const end = source.indexOf('}', start)
  return end === -1 ? '' : source.slice(start, end)
}

/**
 * 解析声明块里的 `属性: 值`
 *
 * 逐行解析而不是用正则：`\s*:\s*([^;]+)` 这类写法里相邻量词的字符集重叠，
 * 会触发 `regexp/no-super-linear-backtracking`，而且换行、注释都要额外照顾。
 * 这些样式块的声明本来就是一行一条，逐行读最直接。
 */
function declarations(block: string): Array<{ property: string, value: string }> {
  const out: Array<{ property: string, value: string }> = []
  const body = block.slice(block.indexOf('{') + 1)
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('/*') || line.startsWith('*') || line.startsWith('//')) {
      continue
    }
    const colon = line.indexOf(':')
    if (colon === -1) {
      continue
    }
    out.push({
      property: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).replace(/;.*$/, '').trim(),
    })
  }
  return out
}

/** 取某条声明的值；`height` 不会误命中 `line-height` / `min-height`（按属性名精确匹配） */
function declValue(block: string, property: string): string | null {
  return declarations(block).find(decl => decl.property === property)?.value ?? null
}

const VERTICAL_MARGIN = /^margin(?:-(?:top|bottom))?$/

/** 纵向 margin 声明（`margin` / `margin-top` / `margin-bottom`），零值不算 */
function verticalMargins(block: string): string[] {
  return declarations(block)
    .filter(decl => VERTICAL_MARGIN.test(decl.property) && !/^0(?:px)?$/.test(decl.value))
    .map(decl => `${decl.property}: ${decl.value}`)
}

describe('editor row layout', () => {
  it('解析器本身有效，断言不会因取不到声明块而空过', () => {
    // 反向保护：若 cssBlock 或 declValue 坏掉，下面几条会「因为拿到空串而通过」
    const block = cssBlock(itemRowSource, '.bx-editor-item-row')
    expect(block).not.toBe('')
    expect(declValue(block, 'height')).not.toBeNull()
    // 精确选择器不会误取修饰类的块
    expect(cssBlock(itemRowSource, '.bx-editor-item-row--selected')).toContain('--selected')
  })

  it('题目行高等于 ITEM_ROW_HEIGHT', () => {
    const block = cssBlock(itemRowSource, '.bx-editor-item-row')
    expect(declValue(block, 'height')).toBe(`${ITEM_ROW_HEIGHT}px`)
  })

  it('题目行用 border-box，padding 与边框不会把行撑高', () => {
    const block = cssBlock(itemRowSource, '.bx-editor-item-row')
    expect(declValue(block, 'box-sizing')).toBe('border-box')
  })

  it('题目行没有纵向 margin，行与行必须连续', () => {
    const block = cssBlock(itemRowSource, '.bx-editor-item-row')
    expect(verticalMargins(block)).toEqual([])
  })

  it('题目行的落点高亮不改高度', () => {
    // 用 box-shadow 做色条而不是加高/加边框：改高度会让落点计算自相矛盾
    const block = cssBlock(itemRowSource, '.bx-editor-item-row--drop')
    expect(block).not.toBe('')
    expect(declValue(block, 'height')).toBeNull()
  })

  it('选项行高来自 OPTION_ROW_HEIGHT 常量', () => {
    // 内联 style 由常量派生，所以选项行高**不可能**与常量不一致
    expect(optionEditorSource).toContain('rowHeight: OPTION_ROW_HEIGHT')
    // 常量变成像素值的那一处（写成正则，避免在字符串里出现模板字面量语法）
    expect(optionEditorSource).toMatch(/\$\{OPTION_ROW_HEIGHT\}px/)
    expect(optionEditorSource).toMatch(/:style="\{[^}]*height:\s*rowHeightStyle[^}]*\}"/)
  })

  it('选项行的 CSS 不再声明 height，避免与内联样式两处打架', () => {
    const block = cssBlock(optionEditorSource, '.bx-editor-option-row')
    expect(block).not.toBe('')
    expect(declValue(block, 'height')).toBeNull()
  })

  it('选项行用 border-box 且没有纵向 margin', () => {
    const block = cssBlock(optionEditorSource, '.bx-editor-option-row')
    expect(declValue(block, 'box-sizing')).toBe('border-box')
    expect(verticalMargins(block)).toEqual([])
  })

  it('两个行高常量都是正整数像素值', () => {
    // 0 或负数会让 dropIndexAt 直接退化成 0，落点永远停在第 0 行
    for (const value of [ITEM_ROW_HEIGHT, OPTION_ROW_HEIGHT]) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })
})
