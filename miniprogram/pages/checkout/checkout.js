// 账单页：券对比 + 省钱展示 + 下单入口（含安全约束）
// 安全约束：
// 1) 默认「仅查询模式」开启，拦截真实下单
// 2) 金额 >¥150 必须复述确认（金额/餐品/门店逐项念出）
// 3) 不做代付、不模拟支付成功、不绕过 create-order 支付跳转
Page({
  data: {
    store: null,
    listPriceYuan: '0.00',   // 标价合计（元）
    finalPriceYuan: '0.00',  // 券后实付（元）
    savedYuan: '0.00',       // 本单省（元）
    queryOnlyMode: true,     // 默认仅查询模式
    confirmed: false         // 高金额复述确认标记
  },

  onLoad() {
    this.setData({
      store: wx.getStorageSync('selectedStore') || null,
      queryOnlyMode: getApp().globalData.queryOnlyMode
    })
    // TODO(第 4 步)：available-coupons 计算券后价与省钱金额
  },

  // 切换仅查询模式（关闭时明确提示会真实下单）
  onToggleQueryOnly(e) {
    const on = e.detail.value
    if (!on) {
      wx.showModal({
        title: '关闭仅查询模式',
        content: '关闭后点击下单将向麦当劳官方渠道发起真实订单，可能产生实际支付。确认关闭？',
        success: (r) => {
          if (r.confirm) { getApp().globalData.queryOnlyMode = false; this.setData({ queryOnlyMode: false }) }
          else this.setData({ queryOnlyMode: true })
        }
      })
    } else {
      getApp().globalData.queryOnlyMode = true
      this.setData({ queryOnlyMode: true })
    }
  },

  // 下单：先做模式与金额校验
  async onSubmit() {
    if (this.data.queryOnlyMode) {
      wx.showToast({ title: '仅查询模式已开启，不会真实下单', icon: 'none', duration: 2500 })
      return
    }
    // 金额 >¥150 复述确认
    if (Number(this.data.finalPriceYuan) > 150 && !this.data.confirmed) {
      wx.showModal({
        title: '请确认订单',
        content: `门店：${this.data.store ? this.data.store.name : '未选'}\n金额：¥${this.data.finalPriceYuan}\n确认后将真实下单`,
        success: (r) => { if (r.confirm) { this.setData({ confirmed: true }); this.onSubmit() } }
      })
      return
    }
    // TODO(第 3 步)：mcp-proxy/order.create-order，成功后跳订单详情
    wx.showToast({ title: '骨架阶段，第 3 步接入下单', icon: 'none' })
  }
})
