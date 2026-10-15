// 账单页：实算复核 + 券对比 + 省钱展示 + 下单（含三重安全约束）
// 安全约束（项目红线）：
//   1) 默认「仅查询模式」开启，前端拦截 + 后端 mcp-proxy 再拦一次（以后端环境变量为准）
//   2) 金额 >¥150 必须复述确认（门店/金额/餐品逐项念出），确认后才允许继续
//   3) 不代付、不模拟支付成功、不绕过官方支付跳转：
//      官方返回的支付参数原样展示提示，不实现任何未经验证的支付跳转
const { callFunction, toastError } = require('../../utils/request.js')
const { formatYuan, savedAmount } = require('../../utils/money.js')

const app = getApp()

Page({
  data: {
    store: null,
    cart: null,
    items: [],
    // 金额一律「元」字符串
    listPriceYuan: '0.00',      // 标价合计
    noCouponPriceYuan: '0.00',  // 不用券实付（实算）
    finalPriceYuan: '0.00',     // 券后实付（实算）
    savedYuan: '0.00',          // 本单省
    couponSavedYuan: '0.00',    // 券省
    hasSaved: false,            // 省钱金句卡形态：省>0 红卡，否则浅色如实卡
    couponSavedText: '',        // 「，其中券省 ¥X」副文案
    appliedCouponNames: [],
    coupons: [],
    takeWayList: [],            // 官方算价返回的取餐方式（下单时选其一回传）
    queryOnlyMode: true,
    confirmed: false,
    verifying: false,
    submitting: false,
    mock: false,
    submitNote: ''
  },

  onLoad() {
    const cart = app.globalData.cart || wx.getStorageSync('cart') || null
    const store = app.globalData.store || wx.getStorageSync('selectedStore') || null
    this.setData({
      cart,
      store,
      queryOnlyMode: app.globalData.queryOnlyMode !== false,
      items: (cart && cart.items) || []
    })
    if (cart) this.reVerify(cart)
  },

  // 复核：对同一份购物车做两次实算（带券 / 不带券），差额即「券省」
  async reVerify(cart) {
    const storeId = this.data.store ? this.data.store.id : null
    if (!storeId) {
      this.setData({ submitNote: '未选择门店，无法实算' })
      return
    }
    this.setData({ verifying: true, submitNote: '' })
    const items = (cart.items || []).map((i) => ({ id: i.id, quantity: i.quantity || 1 }))
    const couponIds = (cart.appliedCouponIds || []).slice()

    const withCoupon = await callFunction('mcp-proxy', {
      action: 'price.calculate',
      payload: { storeId, items, couponIds }
    })
    const noCoupon = await callFunction('mcp-proxy', {
      action: 'price.calculate',
      payload: { storeId, items, couponIds: [] }
    })
    this.setData({ verifying: false })

    if (!withCoupon.ok) {
      this.setData({ submitNote: '实算失败：' + (withCoupon.message || '') })
      return toastError(withCoupon)
    }
    const wc = withCoupon.data || {}
    const nc = noCoupon.ok ? (noCoupon.data || {}) : {}
    if (wc.verified !== true) {
      // 未通过实算 → 绝不展示为「已实算」，也不允许下单
      this.setData({ submitNote: '算价未通过验证（' + (wc.error || '返回格式异常') + '），已阻止下单' })
      return
    }

    const listPrice = wc.listPriceYuan != null ? wc.listPriceYuan : (cart.listPriceYuan || '0.00')
    const finalPrice = wc.priceYuan
    const noCouponPrice = nc.verified === true ? nc.priceYuan : listPrice

    // 券名映射：组合卡里带过来的券名按顺序对齐；对不上就退回显示券 ID（不编造名称）
    const nameList = (this.data.cart && this.data.cart.couponNames) || []
    const appliedIds = wc.appliedCouponIds || []
    const appliedNames = appliedIds.map((id, idx) => nameList[idx] || id)

    const savedStr = savedAmount(listPrice, finalPrice) || '0.00'
    const couponSavedStr = savedAmount(noCouponPrice, finalPrice) || '0.00'
    const hasSaved = Number(savedStr) > 0
    const couponSavedText = Number(couponSavedStr) > 0 ? '，其中券省 ¥' + couponSavedStr : ''

    this.setData({
      items: wc.items || this.data.items,
      listPriceYuan: formatYuan(listPrice),
      noCouponPriceYuan: formatYuan(noCouponPrice),
      finalPriceYuan: formatYuan(finalPrice),
      savedYuan: savedStr,
      couponSavedYuan: couponSavedStr,
      hasSaved,
      couponSavedText,
      appliedCouponNames: appliedNames,
      mock: !!wc.mock,
      // 官方 create-order 到店场景必传 takeWayCode，取自算价返回的 takeWayList
      takeWayList: wc.takeWayList || []
    })
  },

  // 切换仅查询模式（关闭时明确提示会真实下单）
  onToggleQueryOnly(e) {
    const on = e.detail.value
    if (!on) {
      wx.showModal({
        title: '关闭仅查询模式',
        content: '关闭后点击下单将向麦当劳官方渠道发起真实订单，可能产生实际支付。确认关闭？',
        success: (r) => {
          if (r.confirm) { app.globalData.queryOnlyMode = false; this.setData({ queryOnlyMode: false }) }
          else this.setData({ queryOnlyMode: true })
        }
      })
    } else {
      app.globalData.queryOnlyMode = true
      this.setData({ queryOnlyMode: true, confirmed: false })
    }
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/order-detail/order-detail' })
  },

  goRecommend() {
    wx.navigateBack({ delta: 1 })
  },

  // 下单
  async onSubmit() {
    if (this.data.queryOnlyMode) {
      wx.showModal({
        title: '仅查询模式已开启',
        content: '本次已完成查价与券对比，不会产生任何真实订单。如需真实下单，请先关闭「仅查询模式」。',
        showCancel: false
      })
      return
    }
    if (this.data.submitting) return
    if (this.data.submitNote) return wx.showToast({ title: this.data.submitNote, icon: 'none', duration: 2500 })

    // 金额 >¥150 复述确认
    if (Number(this.data.finalPriceYuan) > 150 && !this.data.confirmed) {
      const names = (this.data.items || []).map((i) => `${i.name}×${i.quantity || 1}`).join('、')
      wx.showModal({
        title: '请复述确认这笔订单',
        content: `门店：${this.data.store ? this.data.store.name : '未选'}\n餐品：${names}\n券后实付：¥${this.data.finalPriceYuan}\n确认后将向官方渠道真实下单`,
        confirmText: '确认无误',
        success: (r) => {
          if (r.confirm) { this.setData({ confirmed: true }, () => this.onSubmit()) }
        }
      })
      return
    }

    const storeId = this.data.store ? this.data.store.id : null
    if (!storeId) return wx.showToast({ title: '未选择门店', icon: 'none' })

    this.setData({ submitting: true })
    const items = (this.data.items || []).map((i) => ({ id: i.id, quantity: i.quantity || 1 }))
    // takeWayCode：官方 create-order 到店必传，取算价返回 takeWayList 的第一项（默认取餐方式）
    const firstTakeWay = (this.data.takeWayList || [])[0] || {}
    const takeWayCode = firstTakeWay.code || undefined
    const res = await callFunction('mcp-proxy', {
      action: 'order.create',
      payload: { storeId, items, couponIds: (this.data.cart && this.data.cart.appliedCouponIds) || [], takeWayCode }
    })
    this.setData({ submitting: false })
    if (!res.ok) {
      // 401 不重试：直接提示重新配置凭证（request.js 已按 code 给出文案）
      return toastError(res)
    }

    const d = res.data || {}
    const orderId = d.orderId || ''
    const isMock = !!d.mock

    // 落库到本项目的 orders 集合（openid 由云端注入并强制隔离）
    await callFunction('order-service', {
      action: 'orders.create',
      payload: {
        orderId,
        storeId,
        storeName: this.data.store ? this.data.store.name : null,
        items: this.data.items,
        listPriceYuan: this.data.listPriceYuan,
        finalPriceYuan: this.data.finalPriceYuan,
        savedYuan: this.data.savedYuan,
        appliedCouponIds: (d.appliedCouponIds || (this.data.cart && this.data.cart.appliedCouponIds)) || [],
        status: d.status || 'UNKNOWN',
        source: isMock ? 'mock' : 'mcp'
      }
    })

    // 支付：官方返回支付参数时只做提示，不实现任何未经验证的跳转逻辑
    if (d.payParams) {
      wx.showModal({
        title: '订单已创建',
        content: '官方返回了支付参数。本项目未实现支付跳转（避免未经验证的支付逻辑），请在麦当劳官方渠道完成支付。',
        showCancel: false
      })
    } else if (isMock) {
      wx.showToast({ title: '演示模式：未产生真实订单', icon: 'none', duration: 2500 })
    }

    wx.navigateTo({ url: '/pages/order-detail/order-detail?orderId=' + encodeURIComponent(orderId) })
  },

  // 分享：标题带实付与省钱金额（金额均来自官方实算，杜绝虚构）；始终保留非官方声明
  onShareAppMessage() {
    const storeName = this.data.store ? (this.data.store.name || '') : ''
    const final = this.data.finalPriceYuan
    const saved = this.data.savedYuan
    let title
    if (this.data.hasSaved && Number(final) > 0) {
      title = `麦麦点单：${storeName}实付¥${final}，省了¥${saved}`
    } else if (Number(final) > 0) {
      title = `麦麦点单：${storeName}官方实算实付¥${final}`
    } else {
      title = '麦麦智能点单助手：一句话点单，官方实算不踩坑'
    }
    return { title: title + '（非官方作品）', path: '/pages/index/index' }
  }
})
