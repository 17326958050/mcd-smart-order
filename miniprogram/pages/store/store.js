// 门店选择页：模糊定位 → 附近门店列表 → 用户手动选择
// 隐私：只申请模糊位置（scope.userFuzzyLocation），不上传精确位置、不落库；
//       定位失败时自动降级为「按名称搜索」，保证在没有授权的设备上也能走通全流程
const { callFunction, toastError } = require('../../utils/request.js')

const app = getApp()

Page({
  data: {
    keyword: '',        // 手动搜索关键词
    stores: [],         // 门店列表（mcp-proxy / store.queryNearby）
    loading: false,
    empty: false,
    emptyReason: '',
    locTip: '',
    mock: false
  },

  onLoad() {
    this.loadByLocation()
  },

  // 尝试模糊定位；失败不是错误，只是降级
  async loadByLocation() {
    let loc = null
    try {
      const r = await new Promise((resolve, reject) => {
        wx.getFuzzyLocation({ type: 'wgs84', success: resolve, fail: reject })
      })
      if (r && r.latitude != null) {
        loc = { latitude: r.latitude, longitude: r.longitude }
        this.setData({ locTip: '已使用模糊位置推荐附近门店（精确门店由你手动选择）' })
      }
    } catch (e) {
      // 未授权 / 接口未开通 / 用户拒绝 —— 一律降级，不阻断
      this.setData({ locTip: '未获取到位置授权，已改为按名称搜索（不会上传任何位置信息）' })
    }
    await this.query(loc)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  async onSearch() {
    await this.query(null)
  },

  // 统一查询入口
  async query(loc) {
    this.setData({ loading: true, empty: false, emptyReason: '' })
    const payload = { keyword: this.data.keyword }
    if (loc && loc.latitude != null) {
      payload.latitude = loc.latitude
      payload.longitude = loc.longitude
    }
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
      emptyReason: stores.length === 0 ? '附近暂无可用门店，换个关键词试试' : ''
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
