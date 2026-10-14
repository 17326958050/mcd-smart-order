// MCP 工具封装：算价（官方工具 calculate-price）
// ★ 价格单位铁律：calculate-price 返回「分」（无引号整数）。
//   全项目只有本文件允许做一次 ÷100，出参统一为「元」字符串。
//   上层与其他工具一律不得再次换算。
//
// 本模块是「verifed 标记」的唯一来源：只有经过 calculate-price 实算的金额才允许 verified: true。
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

// 分 → 元：仅在本文件使用（全项目唯一换算点）
function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return null // 非整数分视为异常，不猜、不静默兜底
  return (n / 100).toFixed(2)
}

module.exports = {
  // 实算价格：入参 { storeId, items:[{id,quantity}], couponIds }
  // 出参（元字符串，全站唯一口径）：
  //   { mock, verified, priceYuan, listPriceYuan, savedYuan, appliedCouponIds, items }
  async calculatePrice({ storeId, items = [], couponIds } = {}) {
    if (isMockMode()) {
      return { mock: true, ...mockCalculate(items, storeId, couponIds) }
    }

    // TODO(联调)：官方 calculate-price 的入参结构（餐品编码字段名 / 数量字段名 / 券字段名）
    // 未经 MCP_TOKEN 实测确认，暂按最通用命名构造；联调后请用 mcp-proxy 的
    // action='mcp.toolsSchema' 拉取官方 inputSchema 再校正，不做无根据的猜测扩散。
    const args = {
      storeId,
      meals: items.map((i) => ({ mealId: i.id, quantity: i.quantity || 1 }))
    }
    if (couponIds && couponIds.length) args.couponIds = couponIds
    const data = await callTool('calculate-price', args)

    // 官方返回的金额字段为「分」，在此做唯一一次换算
    const fen = pickFen(data)
    const priceYuan = fenToYuan(fen)
    if (priceYuan === null) {
      // 取不到合法「分」整数 → 一律视为未验证，绝不猜测、绝不兜底成 0
      return { mock: false, verified: false, priceYuan: null, error: '算价返回格式异常（未取到整数分），未做任何换算' }
    }
    const listFen = pickFen(data, ['originalPrice', 'totalOriginalPrice', 'listPrice'])
    const discountFen = pickFen(data, ['discountAmount', 'discount', 'couponAmount'])
    return {
      mock: false,
      verified: true,
      priceYuan,
      // 以下三项官方可能不返回，取不到则为 null（前端据此决定是否灰显，不猜）
      listPriceYuan: listFen == null ? null : fenToYuan(listFen),
      savedYuan: discountFen == null ? null : fenToYuan(discountFen),
      appliedCouponIds: (data && (data.appliedCouponIds || data.couponIds)) || undefined
    }
  },

  // 暴露给测试：换算规则自检用
  _fenToYuan: fenToYuan
}

// 从官方返回中取「分」整数字段（字段名可能随接口版本变化，取到即用、取不到返回 null）
function pickFen(data, cands) {
  if (!data) return null
  const keys = cands || ['totalPrice', 'totalFee', 'price', 'amount', 'payableAmount']
  for (const c of keys) {
    if (data[c] != null && Number.isInteger(Number(data[c]))) return Number(data[c])
  }
  if (data.data) return pickFen(data.data, keys)
  return null
}

// ============ Mock 算价（离线演示，结构与真实一致）============
// 单位：全部为「元」字符串。演示用途，非官方实时价格。
function mockCalculate(items, storeId, couponIds) {
  const list = (items || []).map((i) => {
    const m = mockData.meals.find((x) => x.id === i.id) || {}
    const qty = i.quantity || 1
    return {
      id: i.id,
      name: m.name || i.name || '未知餐品',
      priceYuan: m.priceYuan || '0.00', // 元，原样
      quantity: qty,
      calorie: m.calorie != null ? m.calorie : null
    }
  })

  const listYuan = list.reduce((s, i) => s + Number(i.priceYuan) * i.quantity, 0)

  // 券叠加：门槛 + 适用范围双重校验（演示逻辑，模拟官方「券有指定适用餐品」的真实行为）
  let discount = 0
  const applied = []
  const cartCount = {}
  list.forEach((i) => { cartCount[i.id] = (cartCount[i.id] || 0) + i.quantity })

  ;(couponIds || []).forEach((cid) => {
    const c = mockData.coupons.find((x) => x.id === cid)
    if (!c) return
    if (listYuan < Number(c.thresholdYuan)) return // 未达门槛
    const need = {}
    ;(c.applicableMealIds || []).forEach((id) => { need[id] = (need[id] || 0) + 1 })
    const applicable = Object.keys(need).every((id) => (cartCount[id] || 0) >= need[id])
    if (!applicable) return // 不在券的适用范围内
    discount += Number(c.discountYuan)
    applied.push(c.id)
  })

  const payable = Math.max(listYuan - discount, 0)
  const totalCalorie = list.reduce((s, i) => s + (i.calorie || 0) * i.quantity, 0)

  return {
    verified: true, // Mock 也算「已实算」——因为它走的是同一套算价规则；UI 另行标注「演示数据」
    priceYuan: payable.toFixed(2),      // 券后实付（元）
    listPriceYuan: listYuan.toFixed(2), // 标价合计（元）
    savedYuan: discount.toFixed(2),     // 本单省（元）
    appliedCouponIds: applied,
    totalCalorie,
    items: list
  }
}
