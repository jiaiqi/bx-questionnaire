import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'

import { describe, expect, it } from 'vitest'

import {
  activityChanged,
  activityFromRow,
  activityPayload,
  documentFromRows,
  emptyDocument,
  itemChanged,
  itemFromRow,
  itemPayload,
  optionPayload,
  samePayload,
  sortItemRows,
  stableStringify,
} from '@/domain/editor/document'
import { emptyActivity, emptyItem, emptyOption } from '@/domain/editor/types'

describe('activityPayload · 可写列', () => {
  it('不发服务端派生列与平台自维护列，但必带 title / classify / status', () => {
    const activity = {
      ...emptyActivity(),
      title: '满意度调查',
      classify: 'DAQ202409230006',
      status: '已结束',
    }
    const payload = activityPayload(activity)

    // 这三列服务端按 classify 派生；前端再发一遍就是两处口径，迟早对不上
    expect(payload).not.toHaveProperty('classify_path')
    expect(payload).not.toHaveProperty('classify_name')
    expect(payload).not.toHaveProperty('info_collect_type')
    // activity_no 由 auto_generate=sysauto 生成；del_flag 是后端软删标记
    expect(payload).not.toHaveProperty('activity_no')
    expect(payload).not.toHaveProperty('del_flag')
    // 平台自维护的计数列同样不该由前端覆盖
    expect(payload).not.toHaveProperty('item_count')
    expect(payload).not.toHaveProperty('total_points')
    expect(payload).not.toHaveProperty('submit_count')

    expect(payload.title).toBe('满意度调查')
    expect(payload.classify).toBe('DAQ202409230006')
    expect(payload.status).toBe('已结束')
  })

  it('空串照发：用户要能把已填的输入框清空', () => {
    // 若改成「非空才发」，用户清空关键字后保存，平台里仍是旧值 —— 表现为「清不掉」
    const payload = activityPayload({ ...emptyActivity(), keyword: '' })
    expect(payload).toHaveProperty('keyword')
    expect(payload.keyword).toBe('')
  })
})

describe('itemPayload · 可写列', () => {
  it('不发继承列与平台主键，但必带 activity_no 与 item_seq', () => {
    const item = { ...emptyItem('单选', { radioType: 'single' }), title: '单选题' }
    const payload = itemPayload(item, 0, 'A1')

    // 题目继承活动分类（实测不传也回读为活动分类）；classify_path 是派生列
    expect(payload).not.toHaveProperty('classify')
    expect(payload).not.toHaveProperty('classify_path')
    // item_no 由 auto_generate=sysauto 生成；del_flag 是后端软删标记
    expect(payload).not.toHaveProperty('item_no')
    expect(payload).not.toHaveProperty('del_flag')

    expect(payload.activity_no).toBe('A1')
    expect(payload.item_seq).toBe(1)
  })

  it('item_seq = 下标 + 1（下标 3 → seq 4）', () => {
    // 模型里不存 seq，全靠位置派生；差一位就会与平台顺序错开
    const item = { ...emptyItem('文本', { view_model: 'text' }), title: '第四题' }
    expect(itemPayload(item, 3, 'A1').item_seq).toBe(4)
    expect(itemPayload(item, 0, 'A1').item_seq).toBe(1)
  })

  it('item_type_attr 序列化成 JSON 字符串（传对象平台会报 Incorrect string value）', () => {
    const item = { ...emptyItem('单选', { radioType: 'single' }), title: '单选题' }
    const payload = itemPayload(item, 0, 'A1')

    expect(typeof payload.item_type_attr).toBe('string')
    expect(payload.item_type_attr).toBe('{"radioType":"single"}')
    expect(JSON.parse(String(payload.item_type_attr))).toEqual({ radioType: 'single' })
  })

  it('is_require 写「是」/「否」字符串', () => {
    const required = { ...emptyItem('文本', { view_model: 'text' }), required: true }
    const optional = { ...emptyItem('文本', { view_model: 'text' }), required: false }
    expect(itemPayload(required, 0, 'A1').is_require).toBe('是')
    expect(itemPayload(optional, 0, 'A1').is_require).toBe('否')
  })
})

describe('optionPayload · 由位置派生序号', () => {
  it('下标 2 → option_seq 3、option_view_no C', () => {
    const option = { ...emptyOption(), value: '丙' }
    const payload = optionPayload(option, 2, 'I1')
    expect(payload.option_seq).toBe(3)
    expect(payload.option_view_no).toBe('C')
    expect(payload.item_no).toBe('I1')
    expect(payload.option_value).toBe('丙')
  })

  it('重排后字母跟着位置走，而不是留在选项上', () => {
    const first = { ...emptyOption(), value: '甲' }
    const second = { ...emptyOption(), value: '乙' }
    const third = { ...emptyOption(), value: '丙' }
    const letters = (options: (typeof first)[]) =>
      options.map((option, index) => optionPayload(option, index, 'I1').option_view_no)

    expect(letters([first, second, third])).toEqual(['A', 'B', 'C'])
    // 把同一组选项倒过来重排，仍然得到 A/B/C；若字母被留在选项上，界面会出现「C、A、B」
    expect(letters([third, second, first])).toEqual(['A', 'B', 'C'])
  })

  it('answer 写「是」/「否」字符串，而不是布尔', () => {
    const yes = optionPayload({ ...emptyOption(), isAnswer: true }, 0, 'I1')
    const no = optionPayload({ ...emptyOption(), isAnswer: false }, 0, 'I1')
    expect(yes.answer).toBe('是')
    expect(no.answer).toBe('否')
  })
})

describe('samePayload / stableStringify · 判定「改没改」的等价关系', () => {
  it('数字 0 与字符串 "0" 等价（平台回读 points 就是字符串）', () => {
    // 不等价的话，每次保存都会把「没动过的题」判成改过，全量重写一遍
    expect(samePayload({ a: 0 }, { a: '0' })).toBe(true)
    expect(samePayload({ points: 5 }, { points: '5' })).toBe(true)
  })

  it('真的不同必须判为不同，否则「改了但没保存」', () => {
    // 反向用例：证明等价判断不是恒真
    expect(samePayload({ a: 0 }, { a: '1' })).toBe(false)
    expect(samePayload({ a: 1 }, { b: 1 })).toBe(false)
  })

  it('键序不同但内容相同视为等价（平台列序不稳定）', () => {
    expect(samePayload({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(samePayload({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true)
  })

  it('stableStringify(undefined) 返回可比较的字符串，而不是 undefined', () => {
    // 直接 JSON.stringify(undefined) 得到 undefined，会让比较退化成
    // undefined === undefined 而漏掉真实差异
    expect(typeof stableStringify(undefined)).toBe('string')
    expect(stableStringify(undefined)).toBe('""')
    expect(stableStringify(undefined)).toBe(stableStringify(null))
  })
})

describe('activityFromRow · 缺列兜底', () => {
  it('平台列为 null 时给出默认值，避免出现空下拉框', () => {
    // 类型声明只写了 string，但平台实际会回 null
    const row = {
      activity_no: 'A1',
      status: null,
      perm_type: null,
      answer_times: null,
    } as unknown as DaqActivityRow

    const activity = activityFromRow(row)
    expect(activity.status).toBe('进行中')
    expect(activity.permType).toBe('匿名访问')
    expect(activity.answerTimes).toBe('1次')
  })

  it('平台列整个缺失时给同一套默认值，并保留原始行', () => {
    const row: DaqActivityRow = { activity_no: 'A2' }
    const activity = activityFromRow(row)
    expect(activity.status).toBe('进行中')
    expect(activity.permType).toBe('匿名访问')
    expect(activity.answerTimes).toBe('1次')
    expect(activity.itemDispWay).toBe('全部')
    // raw 必须回指平台行，否则保存时无法判断「改没改」
    expect(activity.raw).toBe(row)
  })
})

describe('itemFromRow · 题型属性与引用列', () => {
  it('is_require 只有「是」算必填', () => {
    expect(itemFromRow({ item_no: 'I1', is_require: '是' }, []).required).toBe(true)
    expect(itemFromRow({ item_no: 'I2', is_require: '否' }, []).required).toBe(false)
    // 其它值（平台脏数据）一律 false，不能「非否即真」
    expect(itemFromRow({ item_no: 'I3', is_require: '1' }, []).required).toBe(false)
    expect(itemFromRow({ item_no: 'I4' }, []).required).toBe(false)
  })

  it('item_type_attr 是 JSON 字符串时也能解析（item_cfg_select 返回的就是字符串）', () => {
    // 字符串下标取值会静默拿到 undefined，表现为「配置写了但不生效」
    const item = itemFromRow(
      { item_no: 'I1', item_type: '单选', item_type_attr: '{"radioType":"single"}' },
      [],
    )
    expect(item.attr).toEqual({ radioType: 'single' })
  })

  it('引用类配置：attr 优先、行上的独立列兜底', () => {
    const fallback = itemFromRow(
      {
        item_no: 'I1',
        item_type: '引用',
        item_type_attr: { refed_col: 'activity_no' },
        servicename: 'srv_from_row',
      },
      [],
    )
    // attr 里没有 servicename 时用行上的列，否则编辑时会把数据源丢掉
    expect(fallback.attr.servicename).toBe('srv_from_row')
    expect(fallback.attr.refed_col).toBe('activity_no')

    const attrWins = itemFromRow(
      {
        item_no: 'I2',
        item_type: '引用',
        item_type_attr: { servicename: 'srv_from_attr' },
        servicename: 'srv_from_row',
      },
      [],
    )
    expect(attrWins.attr.servicename).toBe('srv_from_attr')

    const emptyAttrFallsBack = itemFromRow(
      {
        item_no: 'I3',
        item_type: '引用',
        item_type_attr: { servicename: '' },
        servicename: 'srv_from_row',
      },
      [],
    )
    // 空串等同于没配，不能当成有效配置
    expect(emptyAttrFallsBack.attr.servicename).toBe('srv_from_row')
  })
})

describe('sortItemRows / documentFromRows · 顺序', () => {
  it('按 item_seq 升序，空 item_seq 排最后，且不改原数组', () => {
    const rows: DaqItemRow[] = [
      { item_no: 'I3', item_seq: 3 },
      { item_no: 'I1', item_seq: 1 },
      { item_no: 'I_null', item_seq: null },
      { item_no: 'I2', item_seq: 2 },
      { item_no: 'I_undef' },
    ]

    expect(sortItemRows(rows).map(row => row.item_no))
      .toEqual(['I1', 'I2', 'I3', 'I_null', 'I_undef'])
    // 不原地改：编辑器把文档放在响应式状态里，就地 sort 会让列表在渲染中途跳变
    expect(rows.map(row => row.item_no))
      .toEqual(['I3', 'I1', 'I_null', 'I2', 'I_undef'])
  })

  it('组装文档时题目按 item_seq、每题选项按 option_seq', () => {
    const activityRow: DaqActivityRow = { activity_no: 'A1', title: '演示问卷' }
    const itemRows: DaqItemRow[] = [
      { item_no: 'I2', item_seq: 2, item_title: '第二题', item_type: '文本', item_type_attr: { view_model: 'text' } },
      { item_no: 'I1', item_seq: 1, item_title: '第一题', item_type: '单选', item_type_attr: { radioType: 'single' } },
    ]
    const optionRowsByItemNo = new Map<string, DaqOptionCfgRow[]>([
      ['I1', [
        { option_no: 'O2', item_no: 'I1', option_value: '乙', option_seq: 2 },
        { option_no: 'O1', item_no: 'I1', option_value: '甲', option_seq: 1 },
      ]],
    ])

    const doc = documentFromRows(activityRow, itemRows, optionRowsByItemNo)

    expect(doc.activity.title).toBe('演示问卷')
    expect(doc.items.map(item => item.itemNo)).toEqual(['I1', 'I2'])
    expect(doc.items[0]!.options.map(option => option.optionNo)).toEqual(['O1', 'O2'])
    expect(doc.items[1]!.options).toEqual([])
    // 选项的 raw 必须回指平台行，否则保存时无法判断「改没改」
    expect(doc.items[0]!.options[0]!.raw).toBe(optionRowsByItemNo.get('I1')![1])
  })
})

describe('changed 判定', () => {
  it('新增活动（raw 为 null）恒为「没改过」，因为没有可比对象', () => {
    expect(activityChanged(emptyActivity())).toBe(false)
  })

  it('从平台行读出的活动未编辑时不算改动', () => {
    const row: DaqActivityRow = { activity_no: 'A1', title: '满意度调查', status: '进行中' }
    expect(activityChanged(activityFromRow(row))).toBe(false)
  })

  it('只把 points 的数字 0 换成字符串 "0" 不算改动', () => {
    const raw: DaqItemRow = {
      item_no: 'I1',
      item_seq: 1,
      item_title: '数字题',
      item_type: '数字',
      points: '0',
    }
    const item = itemFromRow(raw, [])
    // 平台回读 points 是字符串 "0"，编辑器里是数字 0 —— 两者必须等价，
    // 否则每次保存都会把「没动过的题」全量重写
    item.points = '0' as unknown as number
    expect(itemChanged(item, 0, 'A1')).toBe(false)

    // 真的改了分值仍要判成改动（证明上面的等价没有把差异一起吞掉）
    const reallyChanged = { ...itemFromRow(raw, []), points: 5 }
    expect(itemChanged(reallyChanged, 0, 'A1')).toBe(true)
  })

  it('改了标题就是改动', () => {
    const raw: DaqItemRow = { item_no: 'I1', item_seq: 1, item_title: '原标题', item_type: '数字' }
    const item = { ...itemFromRow(raw, []), title: '新标题' }
    expect(itemChanged(item, 0, 'A1')).toBe(true)
  })
})

describe('emptyDocument', () => {
  it('是空活动 + 空题目列表', () => {
    const doc = emptyDocument()
    expect(doc.items).toEqual([])
    expect(doc.activity.raw).toBeNull()
    expect(doc.activity.activityNo).toBe('')
    expect(doc.activity.status).toBe('进行中')
  })
})
