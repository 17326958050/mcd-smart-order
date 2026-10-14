// 首页（第 0 步临时承担连通性验证：调用 mcp-proxy 的 ping）
Page({
  data: {
    checking: false,
    result: null,        // ping 原始返回
    checks: null,        // 四项验证结果
    expectedEnv: 'cloud1-d5gheb18zd0b42967',
    expectedAppid: 'wxb417c25671e997a4'
  },

  // 触发连通性验证
  async onPing() {
    this.setData({ checking: true, result: null, checks: null })
    try {
      const res = await wx.cloud.callFunction({
        name: 'mcp-proxy',
        data: { action: 'ping' }
      })
      const r = res.result || {}
      // 逐项对照验证清单：① ok ② env ③ openid 非空 ④ appid 正确
      const checks = {
        ok: r.ok === true,
        env: r.env === this.data.expectedEnv,
        openid: typeof r.openid === 'string' && r.openid.length > 0,
        appid: r.appid === this.data.expectedAppid
      }
      this.setData({ result: r, checks })
    } catch (e) {
      this.setData({ result: { error: String((e && e.errMsg) || e) } })
      wx.showToast({ title: '调用失败，请检查云函数是否已部署', icon: 'none' })
    } finally {
      this.setData({ checking: false })
    }
  }
})
