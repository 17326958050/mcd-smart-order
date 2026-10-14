// 推荐页：按结构化条件（预算/热量/忌口/人数）筛选餐品组合，价格经实算后展示
// 核心卖点：标价最低的组合叠加券后未必最便宜 → 每项必须带 verified 标记
Page({
  data: {
    conditions: null,   // 来自 chat-parse 的结构化条件
    meals: [],          // 推荐结果：{ id, name, priceYuan(元字符串), calorie, verified }
    store: null
  },

  onLoad() {
    this.setData({
      conditions: wx.getStorageSync('parsedConditions') || null,
      store: wx.getStorageSync('selectedStore') || null
    })
    this.loadRecommend() // TODO(第 3 步)：接入 menus/nutrition/price 实算
  },

  async loadRecommend() {
    // TODO(第 3 步)：query-meals + list-nutrition-foods 筛选 → calculate-price 实算（verified）
    this.setData({ meals: [] })
  },

  onSelectMeal(e) {
    // TODO(第 3 步)：加入当前组合
    wx.showToast({ title: '骨架阶段，第 3 步接入', icon: 'none' })
  },

  goCheckout() {
    wx.navigateTo({ url: '/pages/checkout/checkout' })
  }
})
