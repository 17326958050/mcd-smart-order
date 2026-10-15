// MCP 工具封装：菜单（官方工具 query-meals / query-meal-detail）+ 组合推荐编排
// ★ 单位约定：官方返回的价格为「元」（字符串）→ 原样透传，禁止任何换算
// 行为：有 Token 走真实接口；无 Token 且 Mock 开启时返回离线演示数据
//
// 【本项目的核心卖点在这份文件里】
// 「标价最低的组合，叠券后未必最便宜」——所以任何组合都必须经过 calculate-price 实算，
// 只有实算过的金额才打 verified: true；没实算的餐品一律 verified: false（前端灰显）。
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')
const priceTools = require('./price')
const nutritionTools = require('./nutrition')
const couponTools = require('./coupon')

// ============ 菜单查询 ============
// 官方 inputSchema（mcp.tools 实拉）：query-meals 必传 storeCode + orderType + beType；
// 无 keyword 字段 → 关键词过滤在本地做（拉全菜单后按名称过滤）。
// 到店自提场景（orderType=1, beType=1）官方明确 beCode 不要传。
async function queryMeals({ storeId, keyword } = {}) {
  if (isMockMode()) {
    let list = mockData.meals
    if (keyword) list = list.filter((m) => m.name.indexOf(keyword) >= 0)
    return { mock: true, meals: list.map((m) => ({ ...m })) }
  }
  const data = await callTool('query-meals', {
    storeCode: storeId,
    orderType: 1,
    beType: 1
  })
  let meals = normalizeMeals(data)
  if (keyword) meals = meals.filter((m) => (m.name || '').indexOf(keyword) >= 0)
  return { mock: false, meals }
}

// 官方 inputSchema：query-meal-detail 必传 storeCode + orderType + beType + code
// （code 即快餐门店内唯一餐品编码）。到店自提场景 beCode 传了会报错，绝不传。
async function queryMealDetail({ mealId, storeId } = {}) {
  if (isMockMode()) {
    const m = mockData.meals.find((x) => x.id === mealId)
    return { mock: true, meal: m ? { ...m } : null }
  }
  const data = await callTool('query-meal-detail', {
    storeCode: storeId,
    orderType: 1,
    beType: 1,
    code: mealId
  })
  return { mock: false, meal: normalizeMeal(data && (data.meal || data)) }
}

// ============ 组合推荐（编排：菜单 + 营养 + 券 → 实算）============
/**
 * @param {object} p
 * @param {string} p.storeId  已选门店 ID
 * @param {object} p.conditions chat-parse 产出的结构化条件
 * @param {number} [p.evaluateLimit] 最多实算多少个组合（控制真实接口调用量，官方限流 600/分钟）
 * @returns 组合列表（按实付升序）+ insight（标价最低 ≠ 实付最低 的实证）
 */
async function recommendCombos({ storeId, conditions = {}, evaluateLimit = 5 } = {}) {
  const budget = conditions.budgetYuan == null ? null : Number(conditions.budgetYuan)
  const maxCalorie = conditions.maxCalorie == null ? null : Number(conditions.maxCalorie)
  const avoidKeywords = conditions.avoidKeywords || []
  const people = clamp(Number(conditions.people) || 1, 1, 6)

  // --- 1. 拉取数据源 ---
  const mealRes = await queryMeals({ storeId })
  const meals = mealRes.meals || []
  // 官方营养表实测：无餐品编码，仅 productName —— 与菜单靠「名称」匹配；
  // Mock 数据额外带 mealId，两个键都收录，两种模式都能命中
  const nutritionRes = await nutritionTools.listNutritionFoods({})
  const kcalMap = {}
  ;(nutritionRes.foods || []).forEach((f) => {
    if (f.calorie == null) return
    if (f.name) kcalMap[f.name] = f.calorie
    if (f.mealId) kcalMap[f.mealId] = f.calorie
  })

  const couponRes = await couponTools.queryStoreCoupons({ storeId })
  const coupons = couponRes.coupons || []
  const couponIds = coupons.map((c) => c.id).filter(Boolean)
  const couponName = {}
  coupons.forEach((c) => { couponName[c.id] = c.name })

  // --- 2. 忌口过滤（不可信输入 → 只用于名称匹配，不做任何解释执行）---
  const excludedByAvoid = []
  const pool = []
  let withCalorie = 0
  meals.forEach((m) => {
    // 热量优先级：营养表（按名称精确命中）> 菜单自带 > 无（null）
    // 官方营养表仅 160 条经典餐品，与本店菜单名称精确匹配率有限：
    // 命不中的餐品热量为 null，热量条件对其静默失效 —— 以 nutritionCoverage 如实透出，
    // 绝不用模糊匹配猜（「麦香鸡」≠「麦香鱼」）
    const kcal = kcalMap[m.name] != null ? kcalMap[m.name]
      : (kcalMap[m.id] != null ? kcalMap[m.id] : (m.calorie != null ? m.calorie : null))
    const hit = avoidKeywords.find((k) => m.name && m.name.indexOf(k) >= 0)
    if (hit) {
      excludedByAvoid.push({ id: m.id, name: m.name, keyword: hit })
      return
    }
    if (kcal != null) withCalorie++
    pool.push({ ...m, calorie: kcal })
  })
  const nutritionCoverage = pool.length ? Math.round((withCalorie / pool.length) * 100) : 0

  // --- 3. 主食 / 配餐 分类（优先用官方分类字段，退化到名称启发式）---
  const isMain = (m) => (m.category ? /主|汉堡|堡|卷|饭|套餐/.test(String(m.category)) : /堡|卷|饭|派/.test(m.name || ''))
  let mains = pool.filter(isMain)
  let sides = pool.filter((m) => !isMain(m))
  if (!mains.length) {
    // 分类信息缺失时的兜底：按单价降序取前 2 项当主食（并如实标注）
    const sorted = pool.slice().sort((a, b) => Number(b.priceYuan) - Number(a.priceYuan))
    mains = sorted.slice(0, Math.min(2, sorted.length))
    sides = sorted.slice(Math.min(2, sorted.length))
  }
  mains = mains.slice(0, 4)   // 控制组合爆炸，上限与真实菜单规模匹配后仍是近似
  sides = sides.slice(0, 6)

  // --- 4. 生成候选组合（去重 + 结构约束）---
  const groupSize = clamp(people + 1, 2, 4) // 组合件数（含重复）：1 人 2 件、2 人 3 件…最多 4 件
  const candidates = buildCandidates(mains, sides, people, groupSize)
  const mealMap = {}
  pool.forEach((m) => { mealMap[m.id] = m })

  // --- 5. 过滤：预算 / 热量 ---
  let dropByBudget = 0
  let dropByCalorie = 0
  const feasible = []
  candidates.forEach((c) => {
    const stat = comboStat(c, coupons, mealMap)
    if (budget != null && stat.listYuan > budget) { dropByBudget++; return }
    // 热量过滤：仅对「热量完全已知」的组合生效（部分未知不猜、不过滤）
    if (maxCalorie != null && stat.calorie != null && stat.calorie > maxCalorie) { dropByCalorie++; return }
    c._lb = stat.lowerBound // 券后下界（考虑券门槛与适用范围，是实付的合法下界）
    c._list = stat.listYuan
    c._kcal = stat.calorie
    feasible.push(c)
  })

  // --- 6. 粗筛：按券后下界升序取前 N 个做实算（真实模式下即 N 次 calculate-price 调用）---
  feasible.sort((a, b) => a._lb - b._lb)
  const toEvaluate = feasible.slice(0, Math.max(1, evaluateLimit))

  const combos = []
  for (const c of toEvaluate) {
    const calc = await priceTools.calculatePrice({
      storeId,
      items: c.items,
      couponIds
    })
    if (!calc || calc.verified !== true) continue // 未通过实算的一律不进推荐列表
    // 组装展示明细：真实模式的算价返回不含逐项明细（名称/热量），
    // 统一从菜单池 mealMap 补齐；Mock 的 calc.items 自带明细则优先
    const sourceItems = (calc.items && calc.items.length) ? calc.items : c.items
    combos.push({
      id: c.sig,
      items: sourceItems.map((i) => {
        const m = mealMap[i.id] || {}
        return {
          id: i.id,
          name: i.name || m.name || ('餐品 ' + i.id),
          priceYuan: i.priceYuan != null ? i.priceYuan : m.priceYuan, // 元，原样
          quantity: i.quantity || 1,
          calorie: i.calorie != null ? i.calorie : (m.calorie != null ? m.calorie : null),
          verified: true,         // 价格经过实算
          mock: !!calc.mock
        }
      }),
      listPriceYuan: calc.listPriceYuan != null ? calc.listPriceYuan : (c._list != null ? c._list.toFixed(2) : null),
      finalPriceYuan: calc.priceYuan,      // 券后实付（元）
      savedYuan: calc.savedYuan != null && Number(calc.savedYuan) > 0 ? calc.savedYuan : '0.00',
      appliedCouponIds: calc.appliedCouponIds || [],
      couponNames: (calc.appliedCouponIds || []).map((id) => couponName[id]).filter(Boolean),
      totalCalorie: calc.totalCalorie != null ? calc.totalCalorie : (c._kcal != null ? c._kcal : null),
      verified: true,
      mock: !!calc.mock
    })
  }

  // --- 7. 排序：按「实付」升序（这才是用户真正要付的钱）---
  combos.sort((a, b) => Number(a.finalPriceYuan) - Number(b.finalPriceYuan))
  const top = combos.slice(0, 3)

  // --- 8. 产出 insight：标价最低 ≠ 实付最低 的实证 ---
  const byList = combos.slice().sort((a, b) => Number(a.listPriceYuan) - Number(b.listPriceYuan))
  const listTop = byList[0]
  const payTop = combos[0]
  let insight = null
  if (listTop && payTop && listTop.id !== payTop.id &&
      Number(listTop.finalPriceYuan) > Number(payTop.finalPriceYuan)) {
    const gap = (Number(listTop.finalPriceYuan) - Number(payTop.finalPriceYuan)).toFixed(2)
    insight = {
      gapYuan: gap,
      text: `标价最低的组合（¥${listTop.listPriceYuan}）没有券可用，实付 ¥${listTop.finalPriceYuan}；` +
            `而标价 ¥${payTop.listPriceYuan} 的组合叠券后只要 ¥${payTop.finalPriceYuan}，反而省 ¥${gap}。` +
            `「标价最低」不等于「最便宜」，所以本页每一笔都做过实算。`
    }
  }

  // --- 9. 未实算餐品（标价参考，前端灰显）---
  const mealsPreview = pool.slice(0, 8).map((m) => ({
    id: m.id,
    name: m.name,
    priceYuan: m.priceYuan, // 元，原样；未经实算
    calorie: m.calorie,
    verified: false
  }))

  return {
    mock: mealRes.mock || nutritionRes.mock || couponRes.mock,
    storeId,
    applied: { budgetYuan: conditions.budgetYuan || null, maxCalorie, avoidKeywords, people, groupSize },
    // 热量数据覆盖率（%）：官方营养表按名称匹配的命中率，低于 100 时热量筛选仅对命中的餐品生效
    nutritionCoverage,
    combos: top.map((c, i) => ({ ...c, rank: i + 1, isCheapest: i === 0, isLowestList: listTop ? c.id === listTop.id : false })),
    insight,
    meals: mealsPreview,
    pool: {
      total: meals.length,
      usable: pool.length,
      excludedByAvoid,
      droppedByBudget: dropByBudget,
      droppedByCalorie: dropByCalorie,
      evaluated: toEvaluate.length
    },
    coupons: coupons.map((c) => ({ id: c.id, name: c.name, thresholdYuan: c.thresholdYuan, discountYuan: c.discountYuan }))
  }
}

// ============ 组合生成（穷举 + 去重，可解释）============
// 规则（可解释、可复现，不做黑箱打分）：
//   1. 总件数 = people + 1 或 people + 2（一人一份主食，再配 1~2 份配餐，最多再放宽一件）
//   2. 主事件数 m ∈ [1, min(people+1, 3)]；配餐件数 = 总件数 - m
//   3. 同类餐品可重复（例如「两个双层吉士汉堡」），用于触发「第二份半价」这类券
//   生成后按「餐品+数量」签名去重，上限 400 条，防止组合爆炸
function buildCandidates(mains, sides, people, groupSize) {
  const out = []
  const seen = {}
  const push = (ids) => {
    if (!ids.length || out.length >= 400) return
    const count = {}
    ids.forEach((id) => { count[id] = (count[id] || 0) + 1 })
    const sig = Object.keys(count).sort().map((id) => id + 'x' + count[id]).join('+')
    if (seen[sig]) return
    seen[sig] = true
    out.push({ sig, items: Object.keys(count).sort().map((id) => ({ id, quantity: count[id] })) })
  }

  const mainLimit = Math.min(people + 1, 3)
  for (let m = 1; m <= mainLimit; m++) {
    const mainCombos = combinations(mains, m)
    const totals = [groupSize, groupSize + 1]
    totals.forEach((total) => {
      const s = total - m
      if (s < 0 || s > 3) return
      const sideCombos = s === 0 ? [[]] : combinations(sides, s)
      mainCombos.forEach((mc) => {
        sideCombos.forEach((sc) => {
          push(mc.concat(sc).map((x) => x.id))
        })
      })
    })
  }
  return out
}

// 允许重复的组合（n 选 k，可重复）
function combinations(arr, k) {
  const res = []
  const walk = (start, cur) => {
    if (res.length >= 200) return
    if (cur.length === k) { res.push(cur.slice()); return }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i])
      walk(i, cur)
      cur.pop()
    }
  }
  walk(0, [])
  return res
}

// 组合的标价/热量/券后下界（用于实算前的粗筛，不对外输出）
// 热量口径：任一项无热量数据 → 组合热量为 null（不展示误导性的部分和），
// 热量上限过滤对 null 组合跳过（不猜、不默认 0）
function comboStat(combo, coupons, mealMap) {
  const count = {}
  let listYuan = 0
  let calorie = 0
  let calorieKnown = true
  combo.items.forEach((it) => {
    const m = (mealMap && mealMap[it.id]) || {}
    const p = Number(m.priceYuan)
    const c = m.calorie != null ? Number(m.calorie) : null
    const qty = it.quantity || 1
    count[it.id] = (count[it.id] || 0) + qty
    if (!Number.isNaN(p)) listYuan += p * qty
    if (c == null) calorieKnown = false
    else if (!Number.isNaN(c)) calorie += c * qty
  })
  // 券后下界：取「门槛达标且适用范围满足」的券中面额最大的一张
  // （叠加券理论上能让实付更低，所以用最大单张面额作为下界估计是安全的）
  let maxDiscount = 0
  coupons.forEach((cp) => {
    const th = Number(cp.thresholdYuan)
    if (!Number.isNaN(th) && listYuan < th) return
    const need = {}
    ;(cp.applicableMealIds || []).forEach((id) => { need[id] = (need[id] || 0) + 1 })
    const ok = Object.keys(need).every((id) => (count[id] || 0) >= need[id])
    if (!ok) return
    const d = Number(cp.discountYuan)
    if (!Number.isNaN(d) && d > maxDiscount) maxDiscount = d
  })
  return {
    listYuan,
    calorie: calorieKnown ? calorie : null,
    lowerBound: Math.max(listYuan - maxDiscount, 0)
  }
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min
  return Math.min(Math.max(n, min), max)
}

// ============ 归一化（真实接口）============
function normalizeMeal(m) {
  if (!m) return null
  return {
    // id 优先取 productCode：官方 calculate-price / create-order 的 items[].productCode
    // 需要餐品编码，本项目前端流转统一用 meal.id，因此 id 必须 = productCode
    id: m.productCode || m.mealId || m.id,
    name: m.mealName || m.name || m.productName,
    priceYuan: m.price != null ? String(m.price) : (m.priceYuan != null ? String(m.priceYuan) : undefined),
    calorie: m.calorie != null ? m.calorie : (m.energy != null ? m.energy : undefined),
    category: m.category || m.categoryName || undefined
  }
}

function normalizeMeals(data) {
  // 官方实测返回：{ success, code, message, data: { categories, meals } }
  //   categories: [{ name, meals: [{ code, tags }] }]（12 分类 / 107 编码）
  //   meals: { code: { name, image, currentPrice, originalPrice, canWithOrder } }（价格为「元」字符串）
  const d = data && data.data
  if (!d) return []
  const mealDict = d.meals || {}
  const categories = d.categories || []
  const out = []
  const seen = {}
  categories.forEach((cat) => {
    (cat.meals || []).forEach((m) => {
      const code = m.code
      if (!code || seen[code]) return
      const info = mealDict[code] || {}
      seen[code] = true
      out.push({
        id: code, // 餐品编码（productCode 口径，供算价/下单原样回传官方）
        name: info.name || ('餐品 ' + code),
        priceYuan: info.currentPrice != null ? String(info.currentPrice) : undefined, // 元，原样
        calorie: null, // 菜单接口不含热量 → 由营养表模块按名称匹配补充
        category: cat.name,
        tags: m.tags || []
      })
    })
  })
  return out
}

module.exports = { queryMeals, queryMealDetail, recommendCombos }
