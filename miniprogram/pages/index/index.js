// 首页：一句话需求输入（对话式）+ 流程入口 + 连通性自检入口
// 需求文本属于不可信输入，仅原样上送云端 chat-parse 清洗解析，前端不做任何拼接
const { callFunction, toastError } = require('../../utils/request.js')

Page({
  data: {
    parsed: null,      // chat-parse 返回的结构化条件
    loading: false,
    // 连通性自检（第 0 步遗留能力，便于随时回归验证）
    checking: false,
    result: null,
    checks: null,
    expectedEnv: 'cloud1-d5gheb18zd0b42967',
    expectedAppid: 'wxb417c25671e997a4'
  },

  // 接收 chat-bar 的需求文本 → 云端清洗解析
  async onSendNeed(e) {
    const text = (e.detail && e.detail.text) || ''
    this.setData({ loading: true })
    const res = await callFunction('chat-parse', { text })
    this.setData({ loading: false })
    if (!res.ok) return toastError(res)
    const conditions = res.data.conditions || null
    wx.setStorageSync('parsedConditions', conditions)
    this.setData({ parsed: conditions })
  },

  goStore() {
    wx.navigateTo({ url: '/pages/store/store' })
  },

  goRecommend() {
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
  }
})
