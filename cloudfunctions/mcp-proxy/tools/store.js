// MCP 工具封装：门店（官方工具 query-nearby-stores / delivery-query-stores）
// 单位：本模块无价格字段
// 行为：有 MCP_TOKEN 走真实接口；无 Token 且 Mock 开启时返回离线演示数据
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 查询附近可用门店（入参为模糊坐标或关键词）
  // 返回：{ mock: Boolean, stores: [{ id, name, address, distanceMeters? }] }
  async queryNearbyStores({ latitude, longitude, keyword } = {}) {
    if (isMockMode()) {
      let list = mockData.stores
      if (keyword) list = list.filter((s) => (s.name + s.address).indexOf(keyword) >= 0)
      return { mock: true, stores: list }
    }
    const args = {}
    if (latitude != null && longitude != null) args.location = { latitude, longitude }
    if (keyword) args.keyword = keyword
    const data = await callTool('query-nearby-stores', args)
    return { mock: false, stores: normalizeStores(data) }
  },

  // 外送场景：查询可配送门店
  async queryDeliveryStores({ addressId } = {}) {
    if (isMockMode()) return { mock: true, stores: mockData.stores }
    const data = await callTool('delivery-query-stores', { addressId })
    return { mock: false, stores: normalizeStores(data) }
  }
}

// 归一化官方返回结构，只保留项目需要的字段（不猜字段含义，缺失则为 undefined）
function normalizeStores(data) {
  const raw = (data && (data.stores || data.list || data.data)) || []
  if (!Array.isArray(raw)) return []
  return raw.map((s) => ({
    id: s.storeId || s.id || s.storeCode,
    name: s.storeName || s.name,
    address: s.address || s.storeAddress,
    distanceMeters: s.distance != null ? s.distance : s.distanceMeters
  }))
}
