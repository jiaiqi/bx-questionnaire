// @vitest-environment node

/**
 * 编辑器页面地址
 *
 * 这组断言在防「地址手拼」的两类静默失效：
 * 1. 编辑已有问卷时漏掉 `activity_no` —— 设计器进去只会看到一张空表，
 *    用户以为问卷被清空了；
 * 2. 新建问卷时多带一个空的 `activity_no` —— 设计器会当成「编辑编号为空的活动」，
 *    而不是「新建」，保存路径完全不同。
 *
 * 路径字符串在这里写死（不复用被测常量），否则常量本身被改错时测试会跟着一起错。
 */

import { describe, expect, it } from 'vitest'

import { EDITOR_ROUTES, editorCreateUrl, editorDesignUrl, editorListUrl } from '@/domain/editor/routes'

const ACTIVITY_NO = '20261011154728000005'

describe('editor-routes · 路径常量', () => {
  it('列表与设计器的路径写死为页面真实路径', () => {
    expect(EDITOR_ROUTES.list).toBe('/pages/editor/list/index')
    expect(EDITOR_ROUTES.design).toBe('/pages/editor/design/index')
  })
})

describe('editor-routes · 地址拼装', () => {
  it('列表地址就是裸路径，不带查询串', () => {
    expect(editorListUrl()).toBe('/pages/editor/list/index')
    expect(editorListUrl()).not.toContain('?')
  })

  it('新建地址指向设计器且不带 activity_no —— 新建时编号还不存在', () => {
    expect(editorCreateUrl()).toBe('/pages/editor/design/index')
    expect(editorCreateUrl()).not.toContain('activity_no')
  })

  it('编辑地址带上 activity_no', () => {
    expect(editorDesignUrl('A1')).toBe('/pages/editor/design/index?activity_no=A1')
  })

  it('真实长度的活动编号原样带上', () => {
    expect(editorDesignUrl(ACTIVITY_NO)).toBe(
      `/pages/editor/design/index?activity_no=${ACTIVITY_NO}`,
    )
  })

  it('activity_no 为空串时不留下孤立的问号', () => {
    expect(editorDesignUrl('')).toBe('/pages/editor/design/index')
  })
})
