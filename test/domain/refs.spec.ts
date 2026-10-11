import { describe, expect, it } from 'vitest'

import { parseRefConfig, pickRefLabel, refAnswerTargets } from '@/domain/questionnaire/refs'

describe('parseRefConfig', () => {
  it('优先取 item_type_attr，行上独立列兜底', () => {
    expect(parseRefConfig({
      item_type_attr: JSON.stringify({
        servicename: 'srvdaq_activity_cfg_select',
        srv_app: 'daq',
        refed_col: 'activity_no',
        key_disp_col: 'title',
      }),
      servicename: 'ignored',
    })).toEqual({
      serviceName: 'srvdaq_activity_cfg_select',
      app: 'daq',
      valueCol: 'activity_no',
      labelCol: 'title',
    })
  })

  it('item_type_attr 是对象时同样可用', () => {
    expect(parseRefConfig({ item_type_attr: { serviceName: 'svc_a', refed_col: 'no' } }))
      .toEqual({ serviceName: 'svc_a', valueCol: 'no', labelCol: 'name' })
  })

  it('item_type_attr 是坏 JSON 时回退到行上的列', () => {
    expect(parseRefConfig({ item_type_attr: '{坏', servicename: 'svc_b', key_disp_col: 'name' }))
      .toEqual({ serviceName: 'svc_b', valueCol: 'no', labelCol: 'name' })
  })

  it('没配服务名时返回 null，而不是给一个查不了的空配置', () => {
    expect(parseRefConfig({})).toBeNull()
    expect(parseRefConfig({ servicename: '' })).toBeNull()
  })
})

describe('refAnswerTargets', () => {
  const raw = { servicename: 'svc_a', refed_col: 'activity_no', key_disp_col: 'title' }

  it('只挑引用题，且必须配了数据源', () => {
    const targets = refAnswerTargets([
      { key: 'a', widget: 'radio', value: '1', raw },
      { key: 'b', widget: 'ref', value: 'A1', raw },
      { key: 'c', widget: 'ref', value: 'A2', raw: {} },
      { key: 'd', widget: 'ref', value: '', raw },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ key: 'b', value: 'A1' })
    expect(targets[0]!.config.serviceName).toBe('svc_a')
  })

  it('多值逐个返回并去重', () => {
    const targets = refAnswerTargets([
      { key: 'b', widget: 'ref', value: ['A1', 'A2', 'A1'], raw },
    ])
    expect(targets.map(t => t.value)).toEqual(['A1', 'A2'])
  })
})

describe('pickRefLabel', () => {
  const raw = { servicename: 'svc_a', refed_col: 'activity_no', key_disp_col: 'title' }

  it('按 refed_col 匹配后取 key_disp_col', () => {
    const target = refAnswerTargets([{ key: 'b', widget: 'ref', value: 'A1', raw }])[0]!
    expect(pickRefLabel([{ activity_no: 'A1', title: '测试-问卷' }], target)).toBe('测试-问卷')
  })

  it('匹配不上或展示列为空时回退到原值（不谎报成未作答）', () => {
    const target = refAnswerTargets([{ key: 'b', widget: 'ref', value: 'A1', raw }])[0]!
    expect(pickRefLabel([], target)).toBe('A1')
    expect(pickRefLabel([{ activity_no: 'A1', title: '  ' }], target)).toBe('A1')
    expect(pickRefLabel([{ activity_no: 'A9', title: '别的' }], target)).toBe('A1')
  })
})
