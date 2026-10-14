// 首页：一句话需求输入（对话式）→ 云端清洗解析 → 选门店 → 看推荐
// 需求文本属于不可信输入：前端只做采集与长度提示，清洗与解析全部在云端 chat-parse 完成
const { callFunction, toastError } = require('../../utils/request.js')

const app = getApp()

Page({
  data: {
    parsed: null,       // chat-parse 返回的结构化条件
    loading: false,
    store: null,        // 已选门店（回显）
    examples: [
      '2 个人，预算 80 元以内，不要辣，热量别超 1200 千卡',
      '一个人，40 元以内，不要冰',
      '三个人，预算 100，不吃牛肉'
    ],
    // 连通性自检（第 0 步遗留能力，便于随时回归验证）
    checking: false,
    result: null,
    checks: null,
    expectedEnv: 'cloud1-d5gheb18zd0b42967',
    expectedAppid: 'wxb417c25671e997a4'
  },

  onShow() {
    // 回显这次会话里选定的门店
    this.setData({ store: app.globalData.store || null })
  },

  // 接收 chat-bar 或示例的需求文本 → 云端清洗解析
  async onSendNeed(e) {
    const text = (e.detail && e.detail.text) || (e.currentTarget && e.currentTarget.dataset.text) || ''
    if (!text) return
    this.setData({ loading: true })
    const res = await callFunction('chat-parse', { text })
    this.setData({ loading: false })
    if (!res.ok) return toastError(res)
    const conditions = res.data.conditions || null
    app.globalData.conditions = conditions
    wx.setStorageSync('parsedConditions', conditions) // 供后续页面兜底读取
    this.setData({ parsed: conditions })
    if (conditions && conditions.notes && conditions.notes.length) {
      wx.showToast({ title: conditions.notes.join('；'), icon: 'none', duration: 2500 })
    }
  },

  goStore() {
    wx.navigateTo({ url: '/pages/store/store' })
  },

  goRecommend() {
    if (!this.data.store) {
      wx.showToast({ title: '请先选择门店', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/recommend/recommend' })
  },

  // 连通性自检：调用 mcp-proxy 的 ping，逐项核对四项
  async onPing() {
    this.setData({ checking: true, result: null, checks: null })
    try {
      const res = await wx.cloud.callFunction({ name: 'mcp-proxy', data: { action: 'ping' } })
      const r = res.result || {}
      this.setData({
        result: r,
        checks: {
          ok: r.ok === true,
          env: r.env === this.data.expectedEnv,
          openid: typeof r.openid === 'string' && r.openid.length > 0,
          appid: r.appid === this.data.expectedAppid
        }
      })
    } catch (err) {
      this.setData({ result: { error: String((err && err.errMsg) || err) } })
      wx.showToast({ title: '调用失败，请检查云函数是否已部署', icon: 'none' })
    } finally {
      this.setData({ checking: false })
    }
  },

  onShareAppMessage() {
    return {
      title: '麦麦智能点单助手：一句话点单，还能算出省了多少钱（非官方产品）',
      path: '/pages/index/index'
    }
  }
})
