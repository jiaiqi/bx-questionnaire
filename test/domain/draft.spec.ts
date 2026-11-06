// @vitest-environment node

/**
 * 本地草稿的读写规则
 *
 * 这段逻辑有两个不写测试就一定会踩的坑：
 * - 批次归属：草稿带批次号 A，当前在批次 B 上作答时必须拒绝恢复，
 *   否则点击历史记录里另一条未完成记录，会把本机草稿套到那条记录上；
 * - 题目存在性：活动配置改动后残留的旧键不能写进 answers，否则进度统计
 *   会把不存在的题算进去。
 */

import type { QuestionField } from '@/domain/questionnaire'

import { describe, expect, it } from 'vitest'

import { fromLocalDraft, toLocalDraft } from '@/domain/questionnaire'

/** 造一个最小可用的题目对象，只关心 key */
function field(key: string): QuestionField {
  return { key } as QuestionField
}

const FIELDS = [field('q1'), field('q2'), field('q3')]

describe('toLocalDraft', () => {
  it('没有任何作答时返回 null，调用方应跳过写入', () => {
    expect(toLocalDraft(FIELDS, {}, 'B1')).toBeNull()
    expect(toLocalDraft(FIELDS, { q1: '' }, 'B1')).toBeNull()
    expect(toLocalDraft(FIELDS, { q1: [] }, 'B1')).toBeNull()
  })

  it('只收非空答案，并带上批次号', () => {
    const draft = toLocalDraft(FIELDS, { q1: '答了', q2: '', q3: ['a'] }, 'B1')
    // savedAt 由 Date.now() 生成，不参与逐字对比，单独断言类型
    expect(draft).toMatchObject({
      batchNo: 'B1',
      answers: { q1: '答了', q3: ['a'] },
    })
    expect(typeof draft?.savedAt).toBe('number')
  })

  it('没有批次号时也写空串，保持结构稳定', () => {
    expect(toLocalDraft(FIELDS, { q1: '答了' }, '')?.batchNo).toBe('')
  })
})

describe('fromLocalDraft', () => {
  it('批次不同则拒绝恢复 —— 避免把本机草稿套到另一条记录上', () => {
    const draft = { batchNo: 'B1', answers: { q1: '答了' } }
    expect(fromLocalDraft(draft, FIELDS, 'B2')).toEqual({})
    // 同批次才恢复
    expect(fromLocalDraft(draft, FIELDS, 'B1')).toEqual({ q1: '答了' })
  })

  it('草稿没有批次号时不拦截（首次保存前写入的草稿）', () => {
    expect(fromLocalDraft({ answers: { q1: '答了' } }, FIELDS, 'B9')).toEqual({ q1: '答了' })
  })

  it('当前没有批次号时不拦截（刷新续答场景）', () => {
    expect(fromLocalDraft({ batchNo: 'B1', answers: { q1: '答了' } }, FIELDS, '')).toEqual({ q1: '答了' })
  })

  it('只保留仍然存在的题目键，活动改配置后残留键不进入 answers', () => {
    const draft = { batchNo: 'B1', answers: { q1: '答了', q9: '这题已被删除' } }
    expect(fromLocalDraft(draft, FIELDS, 'B1')).toEqual({ q1: '答了' })
  })

  it('空草稿或畸形数据安全返回空对象', () => {
    expect(fromLocalDraft(null, FIELDS, 'B1')).toEqual({})
    expect(fromLocalDraft(undefined, FIELDS, 'B1')).toEqual({})
    expect(fromLocalDraft({}, FIELDS, 'B1')).toEqual({})
  })
})
