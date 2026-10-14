// 云函数调用统一封装：错误归一化 + 用户提示
// 红线：401 不重试，必须报错提示重新配置凭证

// 调用云函数并归一化返回结构
// 成功：{ ok: true, data }
// 失败：{ ok: false, code, message }（code: '401' | '429' | 'NETWORK' | 'UNKNOWN'）
async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data })
    const r = res.result || {}
    if (r.ok === false) {
      return { ok: false, code: r.code || 'UNKNOWN', message: r.error || '服务返回错误' }
    }
    return { ok: true, data: r }
  } catch (e) {
    const msg = String((e && e.errMsg) || e)
    return { ok: false, code: 'NETWORK', message: msg }
  }
}

// 根据错误码给出用户可读提示（不自动重试 401）
function toastError(result) {
  let title = '服务繁忙，请稍后重试'
  if (result.code === '401') title = '凭证失效，请重新配置 MCP Token'
  else if (result.code === '429') title = '请求太频繁，请稍后再试'
  wx.showToast({ title, icon: 'none', duration: 2500 })
}

module.exports = { callFunction, toastError }
