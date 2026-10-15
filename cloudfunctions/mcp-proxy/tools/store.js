// MCP 工具封装：门店（官方工具 query-nearby-stores / delivery-query-stores）
// 单位：本模块无价格字段
// 行为：有 MCP_TOKEN 走真实接口；无 Token 且 Mock 开启时返回离线演示数据
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 查询附近可用门店（入参为模糊坐标或关键词）
  // 返回：{ mock: Boolean, stores: [{ id, name, address, distanceMeters?, beCode? }] }
  async queryNearbyStores({ latitude, longitude, keyword, city } = {}) {
    if (isMockMode()) {
      let list = mockData.stores
      if (keyword) list = list.filter((s) => (s.name + s.address).indexOf(keyword) >= 0)
      return { mock: true, stores: list }
    }
    // 官方实测（BIZ_600058，错误文案「城市名或者关键词不能为空」有误导性）：
    // city 与 keyword 必须同时传入，缺任一都会被官方拒绝 —— 前端已做双输入 + 兜底
    if (!keyword || !city) {
      return { mock: false, stores: [], note: '官方接口要求城市与关键词同时填写' }
    }
    // 官方 inputSchema（mcp.tools 实拉）：必传 beType + searchType；可选 city / keyword
    // 本项目固定到店自提场景 beType=1；searchType=2 按位置搜索（位置由官方侧上下文处理，
    // 官方 Schema 无 latitude/longitude 字段，本地坐标不上传）
    // 实测：searchType=1 仅搜 MCP 账户收藏餐厅（返回空），故默认走 2
    const args = { beType: 1, searchType: 2 }
    if (keyword) args.keyword = keyword
    if (city) args.city = city
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
// 官方实测返回：{ success, code, message, data: [...] }，门店数组在 data.data
// id 优先取 storeCode：官方 calculate-price / create-order 均以 storeCode 标识门店，
// 而本项目前端流转统一用 store.id，因此 id 必须 = storeCode，才能在链路末端原样回传官方。
// beCode 一并保留（得来速/外送场景必传，当前到店自提场景不使用）。
function normalizeStores(data) {
  const raw = (data && (Array.isArray(data.data) ? data.data : (data.stores || data.list))) || []
  if (!Array.isArray(raw)) return []
  return raw.map((s) => ({
    id: s.storeCode || s.storeId || s.id,
    name: s.storeName || s.name,
    address: s.address || s.storeAddress,
    distanceMeters: s.distance != null ? s.distance : s.distanceMeters,
    beCode: s.beCode || undefined,
    businessStatus: s.businessStatus
  }))
}
