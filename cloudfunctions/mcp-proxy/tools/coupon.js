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

  // 当前可领取的麦麦省券列表
  // TODO(联调)：官方文档只说明「查询用户当前可领取的券」，未公开入参结构。
  // 暂不传参（最保守做法：宁可少传，也不凭猜测编造字段名）；
  // 配好 MCP_TOKEN 后用 action='mcp.tools' 拉取 inputSchema 校正。
  async availableCoupons({ storeId, items } = {}) {
    if (isMockMode()) return { mock: true, coupons: mockData.coupons.map((c) => ({ ...c })) }
    const data = await callTool('available-coupons', {})
    return { mock: false, coupons: normalizeCoupons(data) }
  },

  // 一键领取麦麦省所有可领券（官方文档明确「无需指定具体的优惠券和 couponId」）
  // 属于「会改变账户状态」的操作：真实模式下必须由用户显式点击触发，前端需二次确认
  async autoBindCoupons() {
    if (isMockMode()) return { mock: true, bound: [], note: '演示模式：未调用官方领券接口' }
    const data = await callTool('auto-bind-coupons', {})
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
