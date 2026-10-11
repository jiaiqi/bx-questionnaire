/**
 * 编辑器共享的布局常量
 *
 * `ITEM_ROW_HEIGHT` / `OPTION_ROW_HEIGHT` 不是普通的样式数字：
 * 拖拽重排靠 `dropIndexAt()` 用「固定行高」反算落点下标
 * （见 `composables/usePointerReorder`）。行高一改、落点就会算错，
 * 把行搬到用户没指的位置 —— 而界面上看起来只是「拖得有点歪」。
 *
 * 所以：**样式里的行高必须与这里的常量一致**，
 * `test/components/editor-layout.spec.ts` 会读 `.vue` 源码把两者对上，
 * 不一致就变红（靠记忆去同步两个数字是不可靠的）。
 */

/** 题目列表里一行（收起态）的高度，单位 px */
export const ITEM_ROW_HEIGHT = 56

/** 选项列表里一行的高度，单位 px */
export const OPTION_ROW_HEIGHT = 44
