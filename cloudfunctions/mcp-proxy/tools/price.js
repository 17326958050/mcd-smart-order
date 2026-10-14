// MCP 工具封装：算价（官方工具 calculate-price）
// ★ 价格单位铁律：calculate-price 返回「分」（无引号整数）。
//   全项目只有本文件允许做一次 ÷100，出参统一为「元」字符串。
//   上层与其他工具一律不得再次换算。
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

// 分 → 元：仅在本文件使用（唯一换算点）
function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return null // 非整数分视为异常，不猜、不静默兜底
  return (n / 100).toFixed(2)
}

module.exports = {
  // 实算价格：入参 stores + items，出参 { mock, priceYuan（元字符串）, verified: true }
  async calculatePrice({ storeId, items = [], couponIds } = {}) {
    if (isMockMode()) {
      return { mock: true, ...mockCalculate(items, storeId, couponIds) }
    }
    const args = {
      storeId,
      // 官方入参以餐品编码列表为准；数量用重复项表达（待真实联调确认，标 TODO）
      // TODO(联调)：确认 calculate-price 的 items 结构（数量字段名）
      meals: items.map((i) => ({ mealId: i.id, quantity: i.quantity || 1 }))
    }
    if (couponIds && couponIds.length) args.couponIds = couponIds
    const data = await callTool('calculate-price', args)

    // 官方返回的金额字段为「分」，在此做唯一一次换算
    const fen = pickFen(data)
    const priceYuan = fenToYuan(fen)
    if (priceYuan === null) {
      return { mock: false, verified: false, priceYuan: null, error: '算价返回格式异常，未做任何换算' }
    }
    return { mock: false, verified: true, priceYuan, raw: undefined }
  },

  // 暴露给测试：兑换规则自检用
  _fenToYuan: fenToYuan
}

// 从官方返回中取「分」整数字段（字段名可能随接口版本变化，取到即用、取不到返回 null）
function pickFen(data) {
  if (!data) return null
  const cands = [data.totalPrice, data.totalFee, data.price, data.amount, data.payableAmount]
  for (const c of cands) {
    if (c != null && Number.isInteger(Number(c))) return Number(c)
  }
  if (data.data) return pickFen(data.data)
  return null
}

// Mock 算价：直接按「元」字符串求和并减券，标注 mock
function mockCalculate(items, storeId, couponIds) {
  const list = items.map((i) => {
    const m = mockData.meals.find((x) => x.id === i.id) || {}
    return { id: i.id, name: m.name || i.name, priceYuan: m.priceYuan || '0.00', quantity: i.quantity || 1 }
  })
  const totalYuan = list.reduce((s, i) => s + Number(i.priceYuan) * i.quantity, 0)

  // 券叠加（演示逻辑，仅用于展示「标价最低组合未必最省」）
  let discount = 0
  const applied = []
  ;(couponIds || []).forEach((cid) => {
    const c = mockData.coupons.find((x) => x.id === cid)
    if (!c) return
    if (totalYuan >= Number(c.thresholdYuan)) {
      discount += Number(c.discountYuan)
      applied.push(c.id)
    }
  })

  const payable = Math.max(totalYuan - discount, 0)
  return {
    verified: true,
    priceYuan: payable.toFixed(2),
    listPriceYuan: totalYuan.toFixed(2),
    savedYuan: discount.toFixed(2),
    appliedCouponIds: applied,
    items: list
  }
}
