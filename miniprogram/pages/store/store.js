// 门店选择页：模糊定位 → 附近门店列表 → 用户手动选择
// 隐私：只申请模糊位置（scope.userFuzzyLocation），精确门店由用户手动选，不落库
const { callFunction, toastError } = require('../../utils/request.js')

Page({
  data: {
    keyword: '',        // 手动搜索关键词
    stores: [],         // 门店列表（第 3 步接入 query-nearby-stores）
    loading: false,
    empty: false
  },

  onLoad() {
    // TODO(第 3 步)：调用 wx.getFuzzyLocation 获取模糊坐标后查询门店
    this.setData({ empty: true }) // 骨架阶段：无数据即空态
  },

  // 手动搜索门店（关键词为空则回到定位结果）
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  async onSearch() {
    // TODO(第 3 步)：mcp-proxy/store.query-nearby-stores({ keyword })
    this.setData({ loading: true })
    const res = await callFunction('mcp-proxy', { action: 'store.queryNearby', payload: { keyword: this.data.keyword } })
    this.setData({ loading: false })
    if (!res.ok) return toastError(res)
    this.setData({ stores: (res.data && res.data.stores) || [], empty: !(res.data && res.data.stores || []).length })
  },

  // 用户手选门店 → 进入推荐页
  onSelectStore(e) {
    const store = e.currentTarget.dataset.store
    wx.setStorageSync('selectedStore', store) // 仅本地暂存，用于本次会话
    wx.navigateTo({ url: '/pages/recommend/recommend' })
  }
})
