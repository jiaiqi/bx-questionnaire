/**
 * 地址题的作答值解析
 *
 * 地址题的作答值是地区的 `no`（编号），实测就是 `bxq99` 这种编码。
 * 回顾页直接展示它，用户选的是「bxq测试省」、看到的却是编号 ——
 * 与图片题展示文件批次号、引用题展示被引用记录编号是**同一类问题**的第三个实例。
 *
 * 展示列优先 `path_name`（老工程的 `showCol`），回退 `name`（名称），最后才是 `no`。
 * **不能直接回退到 `no`** —— 那正是要避免的东西。实测本环境 `path_name` 为 null，
 * 所以 `name` 这一层是必需的，不是可有可无的兜底。
 */

/** 地址题作答值 → 展示标签时需要的最小字段 */
export interface AreaLabelRow {
  no?: string | null
  name?: string | null
  path_name?: string | null
  parent_no?: string | null
}

/** 从地区行里取展示标签；都取不到时回退到编号本身 */
export function pickAreaLabel(rows: AreaLabelRow[], no: string): string {
  for (const row of rows) {
    if (String(row.no ?? '') !== no) {
      continue
    }
    const label = String(row.path_name ?? row.name ?? '').trim()
    if (label) {
      return label
    }
  }
  return no
}

/** 树上的一个地区节点 */
export interface AreaNode {
  no: string
  label: string
  parentNo: string
}

export interface AreaTree {
  /** 顶层节点 */
  roots: AreaNode[]
  /** 取某个编号的下级 */
  childrenOf: (no: string) => AreaNode[]
}

/**
 * 把平铺的地区行建成树
 *
 * ## 为什么必须建树
 *
 * 老工程「地址」题型用的是 `isTree: true` 的**树形级联**：一次取回整张表，
 * 由组件在客户端分层。所以 `srvconfig_area_adj_select` **无条件返回整张表是有意的**。
 *
 * 我第一版实现把「无条件查询的结果」直接当成第一列 —— 结果省/市/区**全混在一列**，
 * 用户可以把一个区选成「省」。这就是「取回整张表」被误当成「取回顶层」的后果。
 *
 * ## 根节点怎么判断（不猜标记）
 *
 * **不假设根用 `parent_no = '0'` 还是 `null`** —— 实测本环境是我自己造的数据，
 * 生产用什么标记无从得知。改为：`parent_no` 为空，**或者**它不在「所有节点的编号」集合里，
 * 就是根。两种约定都能命中，也不用猜。
 */
export function buildAreaTree(rows: AreaLabelRow[]): AreaTree {
  const allNos = new Set<string>()
  for (const row of rows) {
    const no = String(row.no ?? '').trim()
    if (no) {
      allNos.add(no)
    }
  }

  const nodes: AreaNode[] = []
  for (const row of rows) {
    const no = String(row.no ?? '').trim()
    if (!no) {
      continue
    }
    nodes.push({
      no,
      label: String(row.path_name ?? row.name ?? '').trim() || no,
      parentNo: String(row.parent_no ?? '').trim(),
    })
  }

  const childMap = new Map<string, AreaNode[]>()
  const roots: AreaNode[] = []
  for (const node of nodes) {
    // 父编号为空、或指向一个不存在的节点 → 视为根
    if (!node.parentNo || !allNos.has(node.parentNo)) {
      roots.push(node)
      continue
    }
    const siblings = childMap.get(node.parentNo)
    if (siblings) {
      siblings.push(node)
    }
    else {
      childMap.set(node.parentNo, [node])
    }
  }

  return {
    roots,
    childrenOf: (no: string) => childMap.get(no) ?? [],
  }
}

/**
 * 按已选路径算出每一列
 *
 * 第 0 列是根；第 k 列是路径第 k-1 个节点的下级。路径里某个节点没有下级时，
 * 后面不再产生新列（即该级就是末级）。
 */
export function buildAreaColumns(tree: AreaTree, path: string[]): AreaNode[][] {
  const columns: AreaNode[][] = [tree.roots]
  for (const no of path) {
    const children = tree.childrenOf(no)
    if (!children.length) {
      break
    }
    columns.push(children)
  }
  return columns
}

/** 结果页/回顾页里的一条作答，只要够挑出地址题即可 */
export interface AddressAnswerSlot {
  key: string
  /** 题型（`mapper` 里的 `field.widget`） */
  widget: string
  /** 作答原值（地区的 `no`） */
  value: unknown
}

/**
 * 挑出「需要解析展示标签」的地址作答
 *
 * 只认 `widget === 'address'` 且值非空；多值逐个返回并去重。
 */
export function addressAnswerTargets(slots: AddressAnswerSlot[]): Array<{ key: string, no: string }> {
  const targets: Array<{ key: string, no: string }> = []
  const seen = new Set<string>()

  for (const slot of slots) {
    if (slot.widget !== 'address') {
      continue
    }
    const values = Array.isArray(slot.value) ? slot.value : [slot.value]
    for (const value of values) {
      const no = typeof value === 'string' ? value.trim() : ''
      if (!no || seen.has(`${slot.key}:${no}`)) {
        continue
      }
      seen.add(`${slot.key}:${no}`)
      targets.push({ key: slot.key, no })
    }
  }

  return targets
}
