// @vitest-environment node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  answerUrl,
  coverUrl,
  historyUrl,
  queryString,
  QUESTIONNAIRE_ROUTES,
  resultUrl,
  shareAnswerPath,
  suggestionUrl,
  withQuery,
} from '@/domain/questionnaire/routes'

const ACTIVITY = '20261010100256000001'

describe('routes · 查询串拼装', () => {
  it('跳过 undefined / null / 空串，不产生空参数', () => {
    expect(queryString({ a: '1', b: undefined, c: null, d: '', e: '2' })).toBe('a=1&e=2')
  })

  it('全部为空时返回空串', () => {
    expect(queryString({ a: undefined, b: null, c: '' })).toBe('')
  })

  it('保留中文值不做编码 —— status 的值是「进行中」', () => {
    // 各端对查询串的自动解码行为不一致，编码后 readQuery 可能拿到 %E8%BF%9B...
    expect(queryString({ status: '进行中' })).toBe('status=进行中')
  })

  it('withQuery 没有有效参数时不留下孤立的问号', () => {
    expect(withQuery('/a/b', {})).toBe('/a/b')
    expect(withQuery('/a/b', { x: '' })).toBe('/a/b')
    expect(withQuery('/a/b', { x: '1' })).toBe('/a/b?x=1')
  })
})

describe('routes · 问卷页面地址', () => {
  it('封面地址必带 activity_no —— 该参数是封面页的硬前提', () => {
    expect(coverUrl(ACTIVITY)).toBe(`${QUESTIONNAIRE_ROUTES.cover}?activity_no=${ACTIVITY}`)
  })

  it('答题页默认 formType=form，并带 activity_no', () => {
    const url = answerUrl(ACTIVITY)
    expect(url).toContain('formType=form')
    expect(url).toContain(`activity_no=${ACTIVITY}`)
  })

  it('答题页可覆盖 formType 并附带 status / fill_batch_no', () => {
    const url = answerUrl(ACTIVITY, { formType: 'detail', status: '完成', fillBatchNo: 'B1' })
    expect(url).toContain('formType=detail')
    expect(url).toContain('status=完成')
    expect(url).toContain('fill_batch_no=B1')
  })

  it('答题页不传可选参数时不产生空参数', () => {
    const url = answerUrl(ACTIVITY)
    expect(url).not.toContain('status=')
    expect(url).not.toContain('fill_batch_no=')
  })

  it('结果页缺 fill_batch_no 时不带该参数（页面据此显示「暂无法获取」而不是空白）', () => {
    expect(resultUrl(ACTIVITY)).toBe(`${QUESTIONNAIRE_ROUTES.result}?activity_no=${ACTIVITY}`)
    expect(resultUrl(ACTIVITY, 'B1')).toContain('fill_batch_no=B1')
  })

  it('评估结果地址两个参数都必填 —— 面板缺任一个都会拒绝加载', () => {
    const url = suggestionUrl(ACTIVITY, 'B1')
    expect(url).toContain(`activity_no=${ACTIVITY}`)
    expect(url).toContain('fill_batch_no=B1')
  })

  it('记录页带上 activity_no，title 可选', () => {
    expect(historyUrl(ACTIVITY)).toContain(`activity_no=${ACTIVITY}`)
    expect(historyUrl(ACTIVITY, '标题')).toContain('title=标题')
  })

  it('分享路径不带前导斜杠，且固定 formType=form / status=进行中', () => {
    const path = shareAnswerPath(ACTIVITY)
    expect(path.startsWith('/')).toBe(false)
    expect(path).toContain('formType=form')
    expect(path).toContain('status=进行中')
    expect(path).toContain(`activity_no=${ACTIVITY}`)
  })

  it('分享路径与 onShareAppMessage 的 path 拼法一致（补一个 / 就是完整路径）', () => {
    expect(`/${shareAnswerPath(ACTIVITY)}`).toBe(
      `${QUESTIONNAIRE_ROUTES.answer}?formType=form&activity_no=${ACTIVITY}&status=进行中`,
    )
  })
})

describe('routes · 结构性守卫：禁止在别处手写问卷地址', () => {
  const SRC = 'src'

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p, out)
      }
      else if (name.endsWith('.vue') || name.endsWith('.ts')) {
        out.push(p)
      }
    }
    return out
  }

  /**
   * 这个守卫针对一个真实缺陷类：封面页 / 结果页 / 续答页都要求 activity_no，
   * 而 URL 此前散在 8 个文件里手写，漏参数就把用户送进「缺少活动编号」错误页 ——
   * 结果页的「返回问卷首页」与导航栏返回键都出过这个问题。
   *
   * 集中到 routes.ts 后，这里挡住「又有人在别处手写」的回归。
   *
   * **只抓「带参数的手写 URL」与「导航调用里的字面地址」**：像
   * `resultPath: '/pages/questionnaire/index/result'` 这种把**纯路由**当 prop 传的写法
   * 是合法的（survey 要覆盖 result 页指向），不该报成缺陷 ——
   * 检查过严会把正常情况报成缺陷，久了就会训练出「忽略输出」的习惯。
   */
  it('除 routes.ts 外，src 里不得手写带参数的问卷地址，也不得在导航调用里写字面地址', () => {
    const files = walk(SRC)
    // 防「扫描面为空」导致假通过
    expect(files.length).toBeGreaterThan(30)

    const NAV_API = /uni\.(?:navigateTo|reLaunch|redirectTo|switchTab)\s*\(/
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/')
      if (rel === 'domain/questionnaire/routes.ts') {
        continue
      }
      const lines = readFileSync(file, 'utf8').split('\n')
      for (const [index, line] of lines.entries()) {
        const trimmed = line.trim()
        // 注释里的说明不算
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('<!--')) {
          continue
        }
        if (!/['"`]\/pages\/questionnaire\//.test(line)) {
          continue
        }
        // 带查询串 = 手拼 URL；或处在导航调用附近
        const hasQuery = /\?/.test(line)
        const nearNav = [lines[index - 4], lines[index - 3], lines[index - 2], lines[index - 1], line]
          .some(candidate => candidate !== undefined && NAV_API.test(candidate))
        if (hasQuery || nearNav) {
          offenders.push(`${rel}:${index + 1}  ${trimmed.slice(0, 80)}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
