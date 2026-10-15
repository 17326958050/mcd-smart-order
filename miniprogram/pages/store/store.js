// 门店选择页：城市 + 关键词搜索 → 门店列表 → 用户手动选择
// 隐私：不申请精确位置、不上传位置、不落库。
// 官方实测（BIZ_600058）：query-nearby-stores 要求 city 与 keyword 同时传入，
// 故城市必填；关键词为空时用「麦当劳」兜底（用户可改为具体门店名）。
const { callFunction, toastError } = require('../../utils/request.js')

const app = getApp()

Page({
  data: {
    city: '',          // 城市（官方接口必填）
    keyword: '',       // 手动搜索关键词（官方接口必填，空时兜底「麦当劳」）
    stores: [],        // 门店列表（mcp-proxy / store.queryNearby）
    loading: false,
    empty: false,
    emptyReason: '',
    locTip: '输入城市搜索附近麦当劳门店，精确门店由你手动选择',
    mock: false
  },

  onCityInput(e) {
    this.setData({ city: e.detail.value })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  async onSearch() {
    await this.query()
  },

  // 统一查询入口（官方接口要求 city + keyword 双必填）
  async query() {
    const city = (this.data.city || '').trim()
    if (!city) {
      this.setData({ stores: [], empty: true, emptyReason: '请先输入城市（官方接口要求城市必填）' })
      return
    }
    this.setData({ loading: true, empty: false, emptyReason: '' })
    const payload = { city, keyword: (this.data.keyword || '').trim() || '麦当劳' }
    const res = await callFunction('mcp-proxy', { action: 'store.queryNearby', payload })
    this.setData({ loading: false })
    if (!res.ok) {
      this.setData({ stores: [], empty: true, emptyReason: res.message || '查询失败' })
      return toastError(res)
    }
    const stores = (res.data && res.data.stores) || []
    this.setData({
      stores,
      mock: !!(res.data && res.data.mock),
      empty: stores.length === 0,
      emptyReason: stores.length === 0 ? '该城市暂无可用门店，换个城市或关键词试试' : ''
    })
  },

  // 用户手选门店 → 进入推荐页
  onSelectStore(e) {
    const store = e.currentTarget.dataset.store
    app.globalData.store = store
    wx.setStorageSync('selectedStore', store) // 本地暂存，用于本次会话
    wx.navigateTo({ url: '/pages/recommend/recommend' })
  },

  onShareAppMessage() {
    return { title: '麦麦智能点单助手（非麦当劳官方产品）', path: '/pages/index/index' }
  }
})
