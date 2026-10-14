// MCP 工具封装：订单（对应官方工具 create-order / cancel-order / query-order / order-list）
// 安全约束：
// 1. 仅查询模式下禁止调用 create-order（由上层 order-service 与前端双重拦截）
// 2. 不代付、不模拟支付成功、不绕过官方支付跳转
// TODO(第 2 步)：接入 MCP 连接模块后实现真实调用

module.exports = {
  // 创建订单（真实下单）：返回官方订单信息与支付跳转所需字段
  async createOrder({ storeId, items, queryOnlyMode } = {}) {
    if (queryOnlyMode) return { ok: false, code: 'QUERY_ONLY', error: '仅查询模式下不会真实下单' }
    // TODO(第 3 步)：调用 create-order
    throw new Error('TODO: 第 3 步实现 create-order')
  },

  // 查询订单状态（单位：元，字符串，原样透传）
  async queryOrder({ orderId } = {}) {
    // TODO(第 3 步)：调用 query-order
    throw new Error('TODO: 第 3 步实现 query-order')
  },

  // 取消订单
  async cancelOrder({ orderId } = {}) {
    // TODO(第 3 步)：调用 cancel-order
    throw new Error('TODO: 第 3 步实现 cancel-order')
  },

  // 订单列表
  async orderList({ page } = {}) {
    // TODO(第 3 步)：调用 order-list
    throw new Error('TODO: 第 3 步实现 order-list')
  }
}
