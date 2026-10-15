// MCP 工具封装：订单（官方工具 create-order / cancel-order / query-order / order-list）
// 安全约束（项目红线）：
// 1. 仅查询模式下禁止 create-order
// 2. 不代付、不模拟支付成功、不绕过官方支付跳转：拿到官方返回的支付参数后原样交前端唤起
// 3. 单位：金额字段为「元」（字符串），原样透传，不做换算
const { callTool, isMockMode } = require('../mcp-client')

module.exports = {
  // 创建订单（真实下单）
  // takeWayCode：到店必传，由账单页从 calculate-price 返回的 takeWayList 中选取后传入
  async createOrder({ storeId, items, takeWayCode, queryOnlyMode } = {}) {
    if (queryOnlyMode) {
      // 双重拦截的第一层（前端 checkout 页为第一层）
      return { ok: false, code: 'QUERY_ONLY', error: '仅查询模式下不会真实下单' }
    }
    if (isMockMode()) {
      return {
        mock: true,
        orderId: 'MOCK-ORDER-' + Date.now(),
        status: 'MOCK_CREATED',
        statusText: '演示订单（未真实下单）',
        amountYuan: null, // 不编造金额，由前端用本地实算结果显示
        note: '演示模式：未向官方发起真实订单，也不会产生任何支付',
        payParams: null // 演示模式不提供支付参数，避免误导
      }
    }
    // 官方 inputSchema（mcp.tools 实拉）：
    //   必传 storeCode + orderType + beType；items[].productCode + quantity
    //   takeWayCode 到店场景必传 —— 值来自 calculate-price 返回的 takeWayList[].code
    //   needTableware 布尔。到店自提（beType=1）beCode 不传。
    // 不传任何支付相关字段（官方支付参数由返回给出，本项目原样交前端、不实现支付跳转）。
    const data = await callTool('create-order', {
      storeCode: storeId,
      orderType: 1,
      beType: 1,
      items: (items || []).map((i) => ({ productCode: i.id, quantity: i.quantity || 1 })),
      takeWayCode: takeWayCode || undefined,
      needTableware: true
    })
    return {
      mock: false,
      orderId: (data && (data.orderId || data.id)) || undefined,
      status: (data && data.status) || undefined,
      amountYuan: data && data.amount != null ? String(data.amount) : undefined, // 元，原样
      payParams: data && data.payParams ? data.payParams : null // 交由前端走官方支付跳转
    }
  },

  // 查询订单状态
  async queryOrder({ orderId } = {}) {
    if (isMockMode()) {
      // ★ 演示模式下绝不用 PAID / SUCCESS 之类字样：那会被读成「已支付成功」，
      //   触碰「禁止模拟支付成功」的红线。统一用中性状态 + 明确说明。
      return {
        mock: true,
        order: {
          orderId,
          status: 'MOCK_CREATED',
          statusText: '演示订单（未真实下单）',
          amountYuan: null, // 演示模式不编造金额
          note: '演示数据：未向麦当劳官方渠道发起任何请求'
        }
      }
    }
    const data = await callTool('query-order', { orderId })
    const o = (data && (data.order || data)) || {}
    return {
      mock: false,
      order: {
        orderId: o.orderId || orderId,
        status: o.status,
        statusText: o.statusText || o.status, // 官方若给出可读文案则原样使用，否则不编造
        amountYuan: o.amount != null ? String(o.amount) : (o.payableAmount != null ? String(o.payableAmount) : null)
      }
    }
  },

  // 取消订单（交易类操作，前端需二次确认）
  async cancelOrder({ orderId } = {}) {
    if (isMockMode()) return { mock: true, orderId, cancelled: true }
    const data = await callTool('cancel-order', { orderId })
    return { mock: false, orderId, cancelled: !!(data && (data.success || data.cancelled)) }
  },

  // 订单列表
  async orderList({ page } = {}) {
    if (isMockMode()) return { mock: true, orders: [] }
    const data = await callTool('order-list', { page: page || 1 })
    const raw = (data && (data.orders || data.list)) || []
    return {
      mock: false,
      orders: Array.isArray(raw)
        ? raw.map((o) => ({
            orderId: o.orderId || o.id,
            status: o.status,
            amountYuan: o.amount != null ? String(o.amount) : undefined // 元，原样
          }))
        : []
    }
  }
}
