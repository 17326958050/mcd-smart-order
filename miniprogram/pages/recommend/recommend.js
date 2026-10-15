// 推荐页：按结构化条件筛选 → 组合逐个实算 → 按「实付」排序
// 核心卖点：标价最低的组合叠加券后未必最便宜 → 排序依据是实付，不是标价
// 数据来源：mcp-proxy / action=menu.recommend（云函数内完成 菜单+营养+券 的编排与实算）
const { callFunction, toastError } = require('../../utils/request.js')

const app = getApp()

Page({
  data: {
    conditions: null,
    store: null,
    loading: false,
    combos: [],
    insight: null,
    meals: [],      // 未实算的餐品（前端灰显，仅标价参考）
    pool: null,
    coupons: [],
    mock: false,
    errorMsg: ''
  },

  onLoad() {
    const store = app.globalData.store || wx.getStorageSync('selectedStore') || null
    const conditions = app.globalData.conditions || wx.getStorageSync('parsedConditions') || null
    this.setData({ store, conditions })
    this.loadRecommend()
  },

  async loadRecommend() {
    if (!this.data.store) {
      this.setData({ errorMsg: '还没有选择门店，请先回到上一步选择门店' })
      return
    }
    this.setData({ loading: true, errorMsg: '' })
    const res = await callFunction('mcp-proxy', {
      action: 'menu.recommend',
      payload: { storeId: this.data.store.id, conditions: this.data.conditions || {} }
    })
    this.setData({ loading: false })
    if (!res.ok) {
      this.setData({ errorMsg: res.message || '推荐失败' })
      return toastError(res)
    }
    const d = res.data || {}
    this.setData({
      combos: d.combos || [],
      insight: d.insight || null,
      meals: d.meals || [],
      pool: d.pool || null,
      coupons: d.coupons || [],
      mock: !!d.mock,
      errorMsg: (d.combos || []).length ? '' : '当前条件下没有可推荐的组合，试着放宽预算或放宽忌口'
    })
  },

  // 选定组合 → 进入账单页
  onSelectCombo(e) {
    const combo = e.currentTarget.dataset.combo
    app.globalData.cart = combo
    wx.setStorageSync('cart', combo)
    wx.navigateTo({ url: '/pages/checkout/checkout' })
  },

  goStore() {
    wx.navigateTo({ url: '/pages/store/store' })
  },

  // 分享：有推荐结果时带最优组合实付（官方实算值），否则用核心卖点文案
  onShareAppMessage() {
    const best = (this.data.combos || [])[0]
    let title = '麦麦智能点单：标价最低 ≠ 最便宜，我按实付帮你选'
    if (best && best.finalPriceYuan && Number(best.finalPriceYuan) > 0) {
      title = `麦麦智能点单帮你选好了：实付¥${best.finalPriceYuan}（官方实算）`
    }
    return { title: title + '（非官方作品）', path: '/pages/index/index' }
  }
})
