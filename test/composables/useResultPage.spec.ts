// @vitest-environment node

/**
 * 结果页业务逻辑（useResultPage）单测
 *
 * 覆盖范围：onLoad 参数解析、问卷加载的 use→plain 回退、服务端得分与维度汇总的
 * 容错、计分计算属性的边界、逐题 rows 的组装、图片/引用/地址三类展示值的二次拉取
 * 与失败降级、入口联动与跳转地址。
 *
 * **不覆盖**（做不到或已有归属，避免重复）：
 * - 模板渲染：node 环境没有 jsdom，也没有 @vue/test-utils，这里只断言组合式函数
 *   返回的响应式状态 —— 模板里 v-if 的可见性由这些状态间接决定；
 * - `useQuestionnaire` 自身的加载竞态与「活动已结束」自动置状态：已由
 *   `test/composables/useQuestionnaire.spec.ts` 覆盖，这里只验证结果页传给它的入参；
 * - domain 层纯函数（calcScore / describeSelected / pickRefLabel / mergeAnswerSources 等）：
 *   已由 `test/domain/*` 覆盖，这里验证的是它们在结果页里的**接线**；
 * - 真实网关：所有接口函数都经 vi.mock 打桩，不发任何网络请求。
 */

import type { DaqActivityRow, DaqItemRow, DaqOptionRow } from '@/api/daq/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useResultPage } from '@/composables/useResultPage'
import { BxError } from '@/utils/request'

/** 捕获页面注册的生命周期回调（uni-app 在 node 环境跑不起来，只留注册入口） */
const registered: Record<string, (...args: unknown[]) => unknown> = {}

const mocks = vi.hoisted(() => ({
  initViewSelect: vi.fn(),
  activityCfgUpdate: vi.fn(),
  recordReplySelect: vi.fn(),
  recordReplyMergeSelect: vi.fn(),
  attachmentSelect: vi.fn(),
  resolveFileUrl: vi.fn(),
  areaAdjSelectByNo: vi.fn(),
  bxSelect: vi.fn(),
}))

vi.mock('@dcloudio/uni-app', () => ({
  onLoad: (fn: (...args: unknown[]) => unknown) => {
    registered.onLoad = fn
  },
}))

vi.mock('@/api/daq/activity', () => ({
  initViewSelect: mocks.initViewSelect,
  activityCfgUpdate: mocks.activityCfgUpdate,
}))

vi.mock('@/api/daq/record', () => ({
  recordReplySelect: mocks.recordReplySelect,
  recordReplyMergeSelect: mocks.recordReplyMergeSelect,
}))

vi.mock('@/api/file/attachment', () => ({
  attachmentSelect: mocks.attachmentSelect,
  resolveFileUrl: mocks.resolveFileUrl,
}))

vi.mock('@/api/config/area', () => ({
  areaAdjSelectByNo: mocks.areaAdjSelectByNo,
}))

/**
 * 请求层只替换 `bxSelect`（引用题的展示列查询直接用它），其余原样保留 ——
 * `useQuestionnaire` 需要真实的 `BxError` 才能识别业务失败。
 */
vi.mock('@/utils/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/request')>()
  return { ...actual, bxSelect: mocks.bxSelect }
})

const navigateTo = vi.fn()
const reLaunch = vi.fn()

// ---------------------------------------------------------------- 夹具

function optionRow(no: string, value: string, viewNo: string, isAnswer: boolean): DaqOptionRow {
  return {
    option_no: no,
    option_value: value,
    option_view_no: viewNo,
    option_seq: viewNo.charCodeAt(0) - 64,
    answer: isAnswer ? '是' : '否',
  }
}

function itemRow(overrides: Partial<DaqItemRow> & { item_no: string }): DaqItemRow {
  return {
    item_seq: 1,
    item_title: '',
    item_type: '单选',
    is_require: '否',
    points: 0,
    item_type_attr: {},
    option_data: [],
    ...overrides,
  }
}

/** 分节符：必须被 rows 过滤掉，且不占题号 */
const sectionItem = itemRow({ item_no: 'S1', item_seq: 0, item_type: '分节符', item_title: '第一部分' })

/** 单选 10 分，正确答案是 option_no = '1'（甲） */
const radioItem = itemRow({
  item_no: 'Q1',
  item_seq: 1,
  item_title: '第一题：甲还是乙？',
  item_type: '单选',
  points: 10,
  answer_analysis: '  甲是正确答案  ',
  option_data: [optionRow('1', '甲', 'A', true), optionRow('2', '乙', 'B', false)],
})

/** 多选 10 分，正确答案是 1、2 两项 —— merge 服务只回一个值，是回归用例的核心 */
const checkboxItem = itemRow({
  item_no: 'Q2',
  item_seq: 2,
  item_title: '第二题：哪些是对的？',
  item_type: '多选',
  points: 10,
  option_data: [
    optionRow('1', '甲', 'A', true),
    optionRow('2', '乙', 'B', true),
    optionRow('3', '丙', 'C', false),
  ],
})

/** 第三道客观题：用来同时凑出「答对 / 答错 / 未作答」三态 */
const thirdItem = itemRow({
  item_no: 'Q3',
  item_seq: 3,
  item_title: '第三题：是否同意？',
  item_type: '单选',
  points: 10,
  option_data: [optionRow('1', '是', 'A', true), optionRow('2', '否', 'B', false)],
})

/** 文本题：没有正确答案 → 不计分、不判对错 */
const textItem = itemRow({
  item_no: 'Q4',
  item_seq: 4,
  item_title: '第四题：请留下建议',
  item_type: '文本',
  points: 0,
})

/** 图片题：作答值是文件批次号列表，展示前必须换成真实地址 */
const imageItem = itemRow({
  item_no: 'Q5',
  item_seq: 5,
  item_title: '第五题：上传照片',
  item_type: '图片',
  points: 0,
})

/** 引用题：作答值是被引用记录的编号，展示前必须按数据源配置二次查询 */
const refItem = itemRow({
  item_no: 'Q6',
  item_seq: 6,
  item_title: '第六题：选择关联活动',
  item_type: '引用',
  points: 0,
  item_type_attr: {
    serviceName: 'srvdaq_activity_cfg_select',
    srv_app: 'config',
    refed_col: 'activity_no',
    key_disp_col: 'title',
  },
})

/** 地址题：作答值是地区编号，展示前必须换成名称 */
const addressItem = itemRow({
  item_no: 'Q7',
  item_seq: 7,
  item_title: '第七题：所在地区',
  item_type: '地址',
  points: 0,
})

/** 满编问卷：3 道客观题（合计 30 分）+ 文本 + 图片 + 引用 + 地址 + 1 个分节符 */
const fullItems = [sectionItem, radioItem, checkboxItem, thirdItem, textItem, imageItem, refItem, addressItem]

function activityRow(overrides: Partial<DaqActivityRow> = {}): DaqActivityRow {
  return {
    activity_no: 'A1',
    title: '测试问卷',
    status: '进行中',
    info_collect_type: '评估',
    // 「是否计分问卷」的权威判据（平台枚举「评分 / 不评分」），默认取计分问卷
    act_option: '评分',
    passing_mark: 30,
    item_data: fullItems,
    ...overrides,
  }
}

/** 构造一条 user_data 回填行 */
function answer(itemNo: string, ...values: string[]): { item_no: string, option_data: string[] } {
  return { item_no: itemNo, option_data: values }
}

/** 三道客观题全对（本地判分 30 / 满分 30） */
const allCorrect = [answer('Q1', '1'), answer('Q2', '1', '2'), answer('Q3', '1')]

// ---------------------------------------------------------------- 工具

/**
 * 排空微任务队列
 *
 * `onLoad` 内部是 `void init()`，不返回 Promise，拿不到可 await 的句柄；
 * 所有 mock 都是立即 settle 的 Promise，因此一个宏任务边界足以跑完整条 init 链。
 * 取两次是留一点余量（避免将来某个环节多插一次 await 就变成偶发红灯）。
 */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

/** 建立页面并触发 onLoad（模拟 uni-app 把页面参数交给页面） */
async function openResult(query: Record<string, unknown>): Promise<ReturnType<typeof useResultPage>> {
  const page = useResultPage()
  registered.onLoad?.(query)
  await flush()
  return page
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const key of Object.keys(registered)) {
    delete registered[key]
  }
  vi.stubGlobal('uni', { navigateTo, reLaunch })

  mocks.initViewSelect.mockResolvedValue({ data: [activityRow()] })
  mocks.recordReplySelect.mockResolvedValue({ data: [] })
  mocks.recordReplyMergeSelect.mockResolvedValue({ data: [] })
  mocks.attachmentSelect.mockResolvedValue({ data: [] })
  mocks.areaAdjSelectByNo.mockResolvedValue({ data: [] })
  mocks.bxSelect.mockResolvedValue({ data: [] })
  mocks.resolveFileUrl.mockImplementation((fileurl: string | null | undefined) =>
    (fileurl ? `https://file.test${fileurl}` : ''))
})

describe('useResultPage · 初始状态与 onLoad', () => {
  it('注册 onLoad；onLoad 之前不发任何请求，状态为空', () => {
    const page = useResultPage()

    expect(typeof registered.onLoad).toBe('function')
    expect(mocks.initViewSelect).not.toHaveBeenCalled()

    expect(page.activityNo.value).toBe('')
    expect(page.batchNo.value).toBe('')
    expect(page.loading.value).toBe(false)
    expect(page.errorMessage.value).toBe('')
    expect(page.activity.value).toBeNull()
    expect(page.rows.value).toEqual([])
    expect(page.score.value).toEqual({
      score: 0,
      total: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      detail: [],
    })
    expect(page.hasScore.value).toBe(false)
    expect(page.passingMark.value).toBe(0)
    expect(page.passed.value).toBeNull()
    expect(page.answerImagesFailed.value).toBe(false)
    // 没有批次号就没有报告可看
    expect(page.showSuggestionEntry.value).toBe(false)
  })

  it('onLoad 读取 activity_no 与 fill_batch_no，并按批次号发起两个查询', async () => {
    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.activityNo.value).toBe('A1')
    expect(page.batchNo.value).toBe('B1')
    expect(mocks.initViewSelect).toHaveBeenCalledWith({ activityNo: 'A1', mode: 'use', fillBatchNo: 'B1' })
    expect(mocks.recordReplySelect).toHaveBeenCalledWith({ activityNo: 'A1', fillBatchNo: 'B1', rownumber: 1 })
    // merge 服务没有 activity_no 列，带上它会报 CONDITION_COLUMS_NOT_EXISTS
    expect(mocks.recordReplyMergeSelect).toHaveBeenCalledWith({ fillBatchNo: 'B1' })
  })

  it('缺少 activity_no 时直接进错误态，不发任何请求', async () => {
    const page = await openResult({ fill_batch_no: 'B1' })

    expect(page.errorMessage.value).toBe('缺少活动编号，无法查看结果')
    expect(page.loading.value).toBe(false)
    expect(page.activity.value).toBeNull()
    expect(page.rows.value).toEqual([])
    expect(mocks.initViewSelect).not.toHaveBeenCalled()
    expect(mocks.recordReplySelect).not.toHaveBeenCalled()
  })

  it('缺少 fill_batch_no 时不查服务端记录，逐题文案为「暂无法获取」', async () => {
    const page = await openResult({ activity_no: 'A1' })

    expect(page.batchNo.value).toBe('')
    expect(mocks.initViewSelect).toHaveBeenCalledWith({
      activityNo: 'A1',
      mode: 'use',
      fillBatchNo: undefined,
    })
    expect(mocks.recordReplySelect).not.toHaveBeenCalled()
    expect(mocks.recordReplyMergeSelect).not.toHaveBeenCalled()

    // 分节符被过滤，题目照常渲染；但没有任何作答来源
    expect(page.rows.value.map(row => row.key)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'])
    expect(page.rows.value[0]!.mine).toBe('暂无法获取')
    // 满分来自本地题目分值合计，与有没有作答无关
    expect(page.hasScore.value).toBe(true)
  })
})

describe('useResultPage · 问卷加载的失败路径', () => {
  /**
   * 回归防护：结果页是**只读**页面，绝不能因为「活动已结束」去改活动状态。
   *
   * 这条红了说明下面两件事之一被改坏了：
   * 1. `load(..., { autoUpdateState: false })` 被删掉或改成默认值 —— 用户只是打开结果页
   *    看一眼，活动就会被真的置成「已结束」（`activityCfgUpdate` 会被调用），服务端数据被前端误改；
   * 2. `type=use` 失败后回退 `plain` 的兜底被删掉 —— 已结束活动上 `type=use` 必然 FAILURE，
   *    没有回退则结果页永远只剩一句错误提示，分数与逐题回顾全部看不到。
   */
  it('type=use 失败后回退 plain 加载，且不修改活动状态（回归防护）', async () => {
    mocks.initViewSelect
      .mockRejectedValueOnce(new BxError('活动已结束', 'FAILURE'))
      .mockResolvedValueOnce({ data: [activityRow()] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.initViewSelect).toHaveBeenNthCalledWith(1, {
      activityNo: 'A1',
      mode: 'use',
      fillBatchNo: 'B1',
    })
    expect(mocks.initViewSelect).toHaveBeenNthCalledWith(2, {
      activityNo: 'A1',
      mode: 'plain',
      fillBatchNo: 'B1',
    })
    expect(mocks.activityCfgUpdate).not.toHaveBeenCalled()
    expect(page.errorMessage.value).toBe('')
    expect(page.activity.value?.title).toBe('测试问卷')
  })

  it('两次加载都失败时进入错误态，不渲染任何题目', async () => {
    mocks.initViewSelect.mockRejectedValue(new BxError('问卷不存在', 'FAILURE'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.errorMessage.value).toBe('问卷不存在')
    expect(page.loading.value).toBe(false)
    expect(page.activity.value).toBeNull()
    expect(page.rows.value).toEqual([])
    expect(page.hasScore.value).toBe(false)
    expect(page.passed.value).toBeNull()
    expect(mocks.initViewSelect).toHaveBeenCalledTimes(2)
    expect(mocks.activityCfgUpdate).not.toHaveBeenCalled()
  })

  it('服务端返回空数据时提示「问卷不存在或已下线」', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [] })

    const page = await openResult({ activity_no: 'A1' })

    expect(page.errorMessage.value).toBe('问卷不存在或已下线')
    expect(page.rows.value).toEqual([])
  })
})

describe('useResultPage · 服务端结果与容错', () => {
  it('服务端得分覆盖本地判分，总分仍用本地题目分值合计', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: allCorrect })] })
    mocks.recordReplySelect.mockResolvedValue({ data: [{ score: '15', state: '完成' }] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.score.value.score).toBe(15)
    expect(page.score.value.total).toBe(30)
    // 逐题对错仍按本地判分给出（服务端只给总分）
    expect(page.score.value.correctCount).toBe(3)
    expect(page.hasScore.value).toBe(true)
    expect(page.passed.value).toBe(false)
  })

  it('服务端 score 为 null / 空串 / 字段缺失时都回退本地判分，不把空值当成 0 分', async () => {
    const cases = [
      { label: 'null', raw: null },
      { label: '空串', raw: '' },
      { label: '字段缺失', raw: undefined },
    ]

    for (const { label, raw } of cases) {
      mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: allCorrect })] })
      mocks.recordReplySelect.mockResolvedValue({ data: [{ score: raw, state: '完成' }] })

      const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

      // 本地满分 30；若把空值当 0 分，这里会变成 0
      expect([label, page.score.value.score]).toEqual([label, 30])
      expect([label, page.passed.value]).toEqual([label, true])
    }
  })

  it('record_reply_select 失败时回退本地判分，页面不进入错误态', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: [answer('Q1', '1')] })] })
    mocks.recordReplySelect.mockRejectedValue(new BxError('字段不存在', 'SEARCH_COLUMS_NOT_EXISTS'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.errorMessage.value).toBe('')
    expect(page.score.value.score).toBe(10)
    expect(page.rows.value[0]!.verdict).toBe('correct')
  })

  it('merge 成功时即使没有 user_data 也认为「拿到了作答」', async () => {
    mocks.recordReplyMergeSelect.mockResolvedValue({ data: [{ item_seq: 1, svalue: '1' }] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const [first, second] = page.rows.value
    expect(first!.mine).toBe('甲')
    expect(first!.verdict).toBe('correct')
    // 服务端明确说这题没作答 → 「未作答」
    expect(second!.mine).toBe('未作答')
    expect(second!.verdict).toBe('unanswered')
  })

  it('merge 失败且没有 user_data 时文案为「暂无法获取」而不是「未作答」', async () => {
    mocks.recordReplyMergeSelect.mockRejectedValue(new BxError('需要登录访问', '0011'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const first = page.rows.value[0]!
    // 判分口径确实不知道用户答了什么，只能说未作答
    expect(first.verdict).toBe('unanswered')
    // 但展示口径必须区分「服务端说没答」与「我们根本没拿到数据」，谎报会误导用户
    expect(first.mine).toBe('暂无法获取')
  })

  it('merge 失败但有 user_data 时用回填作答判分', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: [answer('Q1', '1')] })] })
    mocks.recordReplyMergeSelect.mockRejectedValue(new BxError('需要登录访问', '0011'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.rows.value[0]!.mine).toBe('甲')
    expect(page.rows.value[0]!.verdict).toBe('correct')
    expect(page.rows.value[1]!.mine).toBe('未作答')
  })

  it('服务端值与所有选项都匹配不上时保留原值，不谎报成未作答', async () => {
    mocks.recordReplyMergeSelect.mockResolvedValue({ data: [{ item_seq: 1, svalue: 'X9' }] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.rows.value[0]!.mine).toBe('X9')
    expect(page.rows.value[0]!.verdict).toBe('wrong')
  })
})

describe('useResultPage · 计分边界', () => {
  it('不计分问卷（act_option 为「不评分」）hasScore 为假、不给通过结论', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({
        act_option: '不评分',
        item_data: [textItem],
        user_data: [answer('Q4', '请加强培训')],
      })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.score.value).toEqual({
      score: 0,
      total: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      detail: [],
    })
    expect(page.hasScore.value).toBe(false)
    expect(page.passed.value).toBeNull()
    expect(page.rows.value).toHaveLength(1)
    expect(page.rows.value[0]!.verdict).toBe('unjudged')
    expect(page.rows.value[0]!.mine).toBe('请加强培训')
  })

  /**
   * 回归防护：「是否计分问卷」只看活动行的 `act_option`，**不看分值合计**。
   *
   * 这条红了说明 hasScore 又被写回 `score.total > 0`（或类似推断）：
   * - 配上分值但活动声明「不评分」的问卷会错误地渲染分数环与三栏统计；
   * - 反过来，`act_option === '评分'` 的活动又会被分值合计误判成不计分，
   *   逐题结论标签整片消失。
   */
  it('是否计分以 act_option 为准，而不是分值合计（回归防护）', async () => {
    // 题目配了分（合计 30）却声明「不评分」→ 不按计分问卷呈现
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ act_option: '不评分', user_data: allCorrect })],
    })
    const unscored = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(unscored.score.value.total).toBe(30)
    expect(unscored.hasScore.value).toBe(false)
    expect(unscored.passed.value).toBeNull()

    // 声明「评分」但题目都没配分值 → 仍算计分问卷（分数合计为 0 也不改判）
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ act_option: '评分', item_data: [textItem] })],
    })
    const scored = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(scored.score.value.total).toBe(0)
    expect(scored.hasScore.value).toBe(true)
  })

  it('act_option 缺失时回退到分值合计推断，保持改造前行为', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ act_option: undefined, user_data: allCorrect })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.score.value.total).toBe(30)
    // 平台没返回该列时不能把计分问卷的分数区整块藏掉
    expect(page.hasScore.value).toBe(true)

    // 既没有 act_option 又没有分值，才按不计分处理
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ act_option: undefined, item_data: [textItem] })],
    })
    const blank = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })
    expect(blank.score.value.total).toBe(0)
    expect(blank.hasScore.value).toBe(false)
  })

  /**
   * 历史脏值回归：真实 fixture `activity-20251108162243000001` 的 `act_option`
   * 是逗号组合 `"评分,提交确认"`（该活动 `total_points=90`、`passing_mark=100`，
   * 确实是计分问卷）。用 `=== '评分'` 严格比较会把它误判成不计分。
   */
  it('act_option 为历史逗号组合「评分,提交确认」时仍按计分问卷处理', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ act_option: '评分,提交确认', user_data: allCorrect })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.hasScore.value).toBe(true)
    expect(page.passed.value).toBe(true)
  })

  it('满分时 passed 为真', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: allCorrect })] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.score.value.score).toBe(30)
    expect(page.score.value.total).toBe(30)
    expect(page.score.value.correctCount).toBe(3)
    expect(page.score.value.wrongCount).toBe(0)
    expect(page.score.value.unansweredCount).toBe(0)
    expect(page.passed.value).toBe(true)
  })

  it('得分刚好等于合格线时判为通过（>= 而不是 >）', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ passing_mark: 10, user_data: [answer('Q1', '1')] })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.passingMark.value).toBe(10)
    expect(page.score.value.score).toBe(10)
    expect(page.passed.value).toBe(true)
  })

  it('差一分未达合格线时判为未通过', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ passing_mark: 11, user_data: [answer('Q1', '1')] })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(page.score.value.score).toBe(10)
    expect(page.passed.value).toBe(false)
  })

  it('合格线缺失或为 0 时不显示通过/未通过结论', async () => {
    const cases = [
      { label: 'null', mark: null },
      { label: '0', mark: 0 },
      { label: '空串', mark: '' },
    ]

    for (const { label, mark } of cases) {
      mocks.initViewSelect.mockResolvedValue({
        data: [activityRow({ passing_mark: mark, user_data: allCorrect })],
      })

      const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

      expect([label, page.hasScore.value, page.passingMark.value, page.passed.value])
        .toEqual([label, true, 0, null])
    }
  })
})

describe('useResultPage · rows 组装', () => {
  it('过滤分节符、标题补题号、解析取自 answer_analysis', async () => {
    const page = await openResult({ activity_no: 'A1' })

    expect(page.rows.value.map(row => row.key)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'])
    expect(page.rows.value[0]!.title).toBe('1. 第一题：甲还是乙？')
    expect(page.rows.value[0]!.expected).toBe('甲')
    expect(page.rows.value[0]!.points).toBe(10)
    // 解析列是 answer_analysis（不是 explanation），且要去掉首尾空白
    expect(page.rows.value[0]!.analysis).toBe('甲是正确答案')
    // 未配置解析时不渲染（模板按空串隐藏该行）
    expect(page.rows.value[1]!.analysis).toBe('')
    // 文本题没有正确答案 → 不判对错、不计分
    expect(page.rows.value[3]!.expected).toBe('')
    expect(page.rows.value[3]!.verdict).toBe('unjudged')
    expect(page.rows.value[3]!.verdictText).toBe('不计分')
  })

  it('逐题区分答对 / 答错 / 未作答，并给出本题得分', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ user_data: [answer('Q1', '1'), answer('Q2', '3')] })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const [q1, q2, q3] = page.rows.value
    expect([q1!.verdict, q1!.verdictText, q1!.earned]).toEqual(['correct', '回答正确', 10])
    expect([q2!.verdict, q2!.verdictText, q2!.earned]).toEqual(['wrong', '回答错误', 0])
    expect([q3!.verdict, q3!.verdictText, q3!.earned]).toEqual(['unanswered', '未作答', 0])
    expect([q1!.mine, q2!.mine, q3!.mine]).toEqual(['甲', '丙', '未作答'])
    expect(page.score.value).toMatchObject({
      score: 10,
      correctCount: 1,
      wrongCount: 1,
      unansweredCount: 1,
    })
  })

  /**
   * 回归防护：`user_data` 必须**优先于** merge 的逐题值。
   *
   * 这条红了说明 `mergeAnswerSources(serverAnswerMap, backfill)` 的两个入参被写反了
   * （或改成 merge 优先）。实测 merge 服务对多选**只保留一个值**：正确答案是「甲、乙」时
   * user_data 给 ["1","2"]（判分 20），merge 只给 "2"（判分 10）。反了之后页面会
   * 「用户明明答对却显示回答错误」，并且逐题得分加不出顶部总分（页面自相矛盾）。
   */
  it('多选以 user_data 为准而不是 merge（回归防护）', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: allCorrect })] })
    // merge 只回一个值 —— 复现真实的丢值行为
    mocks.recordReplyMergeSelect.mockResolvedValue({ data: [{ item_seq: 2, svalue: '2' }] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const checkbox = page.rows.value[1]!
    expect(checkbox.key).toBe('Q2')
    expect(checkbox.mine).toBe('甲、乙')
    expect(checkbox.verdict).toBe('correct')
    expect(checkbox.earned).toBe(10)
    // 逐题得分之和必须等于总分，否则页面自相矛盾
    expect(page.score.value.score).toBe(30)
  })
})

describe('useResultPage · 图片 / 引用 / 地址的展示值', () => {
  it('图片题按批次号查附件并换成可访问地址', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ user_data: [answer('Q5', 'F1', 'F2', 'F3')] })],
    })
    mocks.attachmentSelect.mockImplementation(async ({ fileNo }: { fileNo: string }) => {
      if (fileNo === 'F1') {
        return { data: [{ fileurl: '/2026/a.png' }] }
      }
      if (fileNo === 'F2') {
        return { data: [{ fileurl: '/2026/b.png' }] }
      }
      // 附件行存在但 fileurl 为空
      return { data: [{ fileurl: null }] }
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.attachmentSelect).toHaveBeenCalledTimes(3)
    expect(mocks.attachmentSelect).toHaveBeenCalledWith({ fileNo: 'F1' })
    expect(mocks.attachmentSelect).toHaveBeenCalledWith({ fileNo: 'F2' })
    expect(mocks.attachmentSelect).toHaveBeenCalledWith({ fileNo: 'F3' })
    expect(mocks.resolveFileUrl).toHaveBeenCalledWith('/2026/a.png')
    expect(mocks.resolveFileUrl).toHaveBeenCalledWith(null)

    const image = page.rows.value.find(row => row.key === 'Q5')!
    expect(image.isImage).toBe(true)
    // 一张图一个批次号：多个批次号的结果要**追加**，不能互相覆盖；
    // 空 fileurl 被过滤掉，不会渲染出一个空 src
    expect(image.images).toEqual(['https://file.test/2026/a.png', 'https://file.test/2026/b.png'])
    expect(image.mine).toBe('已上传图片')
    expect(page.answerImagesFailed.value).toBe(false)
  })

  it('附件查询失败时标记 answerImagesFailed，仍显示「已上传图片」而不是「暂无图片」', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: [answer('Q5', 'F1')] })] })
    mocks.attachmentSelect.mockRejectedValue(new BxError('无权限访问', 'FAILURE'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const image = page.rows.value.find(row => row.key === 'Q5')!
    expect(page.answerImagesFailed.value).toBe(true)
    expect(image.images).toEqual([])
    // 作答值是批次号 → 说明用户确实传过图，只是这次读不到
    expect(image.mine).toBe('已上传图片')
  })

  it('引用题按数据源配置查展示列，换成可读文案', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ user_data: [answer('Q6', '20261011113133000003')] })],
    })
    mocks.bxSelect.mockResolvedValue({
      data: [{ activity_no: '20261011113133000003', title: '被引用的活动' }],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.bxSelect).toHaveBeenCalledTimes(1)
    expect(mocks.bxSelect).toHaveBeenCalledWith({
      serviceName: 'srvdaq_activity_cfg_select',
      app: 'config',
      colNames: ['*'],
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: '20261011113133000003' }],
      page: { pageNo: 1, rownumber: 20 },
    })

    const ref = page.rows.value.find(row => row.key === 'Q6')!
    expect(ref.mine).toBe('被引用的活动')
  })

  it('引用题查询失败时回退原值，不谎报成「已选择」', async () => {
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({ user_data: [answer('Q6', '20261011113133000003')] })],
    })
    mocks.bxSelect.mockRejectedValue(new BxError('字段不存在', 'SEARCH_COLUMS_NOT_EXISTS'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const ref = page.rows.value.find(row => row.key === 'Q6')!
    expect(ref.mine).toBe('20261011113133000003')
  })

  it('引用题没配数据源时显示「已选择」，不去查展示列也不露出内部编号', async () => {
    // 没有 serviceName → parseRefConfig 返回 null → 不产生查询目标
    const unconfiguredRef = itemRow({
      item_no: 'Q6',
      item_seq: 6,
      item_title: '第六题：选择关联活动',
      item_type: '引用',
      item_type_attr: {},
    })
    mocks.initViewSelect.mockResolvedValue({
      data: [activityRow({
        item_data: [unconfiguredRef],
        user_data: [answer('Q6', '20261011113133000003')],
      })],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.bxSelect).not.toHaveBeenCalled()
    expect(page.rows.value[0]!.mine).toBe('已选择')
  })

  it('地址题按编号查名称，展示名称而不是编号', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: [answer('Q7', 'bxq99')] })] })
    mocks.areaAdjSelectByNo.mockResolvedValue({
      data: [{ no: 'bxq99', name: 'bxq测试省', path_name: null }],
    })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.areaAdjSelectByNo).toHaveBeenCalledWith('bxq99')

    const address = page.rows.value.find(row => row.key === 'Q7')!
    expect(address.mine).toBe('bxq测试省')
  })

  it('地址题查询失败时回退编号，绝不显示空白（空白会被当成未作答）', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ user_data: [answer('Q7', 'bxq99')] })] })
    mocks.areaAdjSelectByNo.mockRejectedValue(new BxError('无权限访问', 'FAILURE'))

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    const address = page.rows.value.find(row => row.key === 'Q7')!
    expect(address.mine).toBe('bxq99')
  })

  it('没有图片/引用/地址作答时不发二次查询请求', async () => {
    mocks.initViewSelect.mockResolvedValue({ data: [activityRow({ item_data: [radioItem] })] })

    await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.attachmentSelect).not.toHaveBeenCalled()
    expect(mocks.areaAdjSelectByNo).not.toHaveBeenCalled()
    expect(mocks.bxSelect).not.toHaveBeenCalled()
  })
})

describe('useResultPage · 入口联动', () => {
  it('showSuggestionEntry 需要批次号，且排除「自测」「反馈」', async () => {
    const cases = [
      { label: '评估', type: '评估' as string | undefined, batch: 'B1', expected: true },
      { label: '类型缺失', type: undefined, batch: 'B1', expected: true },
      { label: '自测', type: '自测', batch: 'B1', expected: false },
      { label: '反馈', type: '反馈', batch: 'B1', expected: false },
      { label: '评估但无批次', type: '评估', batch: '', expected: false },
    ]

    for (const item of cases) {
      mocks.initViewSelect.mockResolvedValue({
        data: [activityRow({ info_collect_type: item.type })],
      })

      const page = await openResult({
        activity_no: 'A1',
        ...(item.batch ? { fill_batch_no: item.batch } : {}),
      })

      expect([item.label, page.showSuggestionEntry.value]).toEqual([item.label, item.expected])
    }
  })

  it('两个跳转都带全参数（缺 activity_no 会把用户送进「缺少活动编号」死胡同）', async () => {
    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    page.openSuggestion()
    expect(navigateTo).toHaveBeenCalledWith({
      url: '/pages/questionnaire/assessmentResult/assessmentResult?activity_no=A1&fill_batch_no=B1',
    })

    page.goHome()
    expect(reLaunch).toHaveBeenCalledWith({
      url: '/pages/questionnaire/cover/index?activity_no=A1',
    })

    // 导航栏兜底链接用同一个拼装函数，参数口径必须一致
    expect(page.coverUrl('A1')).toBe('/pages/questionnaire/cover/index?activity_no=A1')
  })
})

/**
 * 加载彻底失败后的短路
 *
 * 问卷本身没加载出来时页面已经是错误态，此时再去查记录类服务只会产生两次
 * 注定无用的请求（错误态下也没有任何消费者）。这条红了 = 短路被删掉了。
 */
describe('useResultPage · 加载失败后的短路', () => {
  it('两次加载都失败时不再请求记录类服务', async () => {
    // 两次都返回空 data → useQuestionnaire 的 load 都是 false
    mocks.initViewSelect.mockResolvedValue({ data: [] })

    const page = await openResult({ activity_no: 'A1', fill_batch_no: 'B1' })

    expect(mocks.initViewSelect).toHaveBeenCalledTimes(2)
    expect(mocks.recordReplySelect).not.toHaveBeenCalled()
    expect(mocks.recordReplyMergeSelect).not.toHaveBeenCalled()
    expect(page.rows.value).toEqual([])
  })
})
