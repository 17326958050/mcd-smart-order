// MCP 工具封装：优惠券（对应官方工具 query-store-coupons / available-coupons / auto-bind-coupons / query-my-coupons）
// 用途：实现核心卖点——标价最低的组合叠加券后未必最便宜，必须实算对比
// TODO(第 4 步)：接入 MCP 连接模块后实现真实调用

module.exports = {
  // 门店可用券
  async queryStoreCoupons({ storeId } = {}) {
    // TODO(第 4 步)：调用 query-store-coupons
    throw new Error('TODO: 第 4 步实现 query-store-coupons')
  },

  // 当前可用券（含可用条件）
  async availableCoupons({ storeId, items } = {}) {
    // TODO(第 4 步)：调用 available-coupons
    throw new Error('TODO: 第 4 步实现 available-coupons')
  },

  // 自动绑定可用券
  async autoBindCoupons({ storeId } = {}) {
    // TODO(第 4 步)：调用 auto-bind-coupons
    throw new Error('TODO: 第 4 步实现 auto-bind-coupons')
  },

  // 我的券
  async queryMyCoupons() {
    // TODO(第 4 步)：调用 query-my-coupons
    throw new Error('TODO: 第 4 步实现 query-my-coupons')
  }
}
