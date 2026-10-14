// MCP 工具封装：优惠券（官方工具 query-store-coupons / available-coupons / auto-bind-coupons / query-my-coupons）
// 售点：用于实现「标价最低的组合叠券后未必最便宜」的实算对比
// 单位：券门槛与面额均为「元」（字符串），原样透传
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 门店可用券
  async queryStoreCoupons({ storeId } = {}) {
    if (isMockMode()) return { mock: true, coupons: mockData.coupons.map((c) => ({ ...c })) }
    const data = await callTool('query-store-coupons', { storeId })
    return { mock: false, coupons: normalizeCoupons(data) }
  },

  // 当前可用券（结合购物车餐品）
  async availableCoupons({ storeId, items } = {}) {
    if (isMockMode()) return { mock: true, coupons: mockData.coupons.map((c) => ({ ...c })) }
    const data = await callTool('available-coupons', {
      storeId,
      meals: (items || []).map((i) => ({ mealId: i.id, quantity: i.quantity || 1 }))
    })
    return { mock: false, coupons: normalizeCoupons(data) }
  },

  // 自动绑定可用券（会产生真实券绑定，属于交易类操作，前端需二次确认）
  async autoBindCoupons({ storeId, couponIds } = {}) {
    if (isMockMode()) return { mock: true, bound: (couponIds || []).slice() }
    const data = await callTool('auto-bind-coupons', { storeId, couponIds })
    return { mock: false, bound: (data && (data.boundCouponIds || data.couponIds)) || [] }
  },

  // 我的券
  async queryMyCoupons() {
    if (isMockMode()) return { mock: true, coupons: mockData.coupons.map((c) => ({ ...c })) }
    const data = await callTool('query-my-coupons', {})
    return { mock: false, coupons: normalizeCoupons(data) }
  }
}

// 归一化：金额字段一律为「元」字符串，不做换算
function normalizeCoupons(data) {
  const raw = (data && (data.coupons || data.list || data.data)) || []
  if (!Array.isArray(raw)) return []
  return raw.map((c) => ({
    id: c.couponId || c.id || c.code,
    name: c.couponName || c.name,
    thresholdYuan: c.threshold != null ? String(c.threshold) : (c.minAmount != null ? String(c.minAmount) : undefined),
    discountYuan: c.discount != null ? String(c.discount) : (c.amount != null ? String(c.amount) : undefined),
    applicableMealIds: c.mealIds || c.applicableMealIds || undefined
  }))
}
