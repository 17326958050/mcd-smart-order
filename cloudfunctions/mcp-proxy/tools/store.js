// MCP 工具封装：门店（对应官方工具 query-nearby-stores / delivery-query-stores）
// TODO(第 2 步)：接入 MCP 连接模块后实现真实调用；enable_mock 时返回内置演示数据
// 出参约定：价格类字段一律为「元」字符串（本模块不含价格）

module.exports = {
  // 查询附近可用门店（入参为模糊坐标或关键词）
  async queryNearbyStores({ latitude, longitude, keyword } = {}) {
    // TODO(第 2 步)：调用 query-nearby-stores
    throw new Error('TODO: 第 2 步实现 query-nearby-stores')
  },

  // 外送场景查询可配送门店
  async queryDeliveryStores({ addressId } = {}) {
    // TODO(第 2 步)：调用 delivery-query-stores
    throw new Error('TODO: 第 2 步实现 delivery-query-stores')
  }
}
