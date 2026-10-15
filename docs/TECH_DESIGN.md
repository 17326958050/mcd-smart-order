# 麦麦智能点单助手 — 技术方案

> 麦当劳程序员节创意开发大赛参赛作品，**非麦当劳官方产品**。
> 本文档对应开发计划「第 1 步」，是后续所有实现的基准。

## 1. 一句话定位

用户用一句话描述需求（预算上限、热量上限、忌口、人数），自动推荐餐品并完成下单链路，账单页展示省了多少钱。

## 2. 架构总览（双层结构）

```
┌─────────────────────────────┐
│  小程序前端（微信原生）        │
│  pages × 5 / components × 3 │
│  utils/request.js → wx.cloud.callFunction
└──────────────┬──────────────┘
               │ 云调用（自带 openid 注入）
┌──────────────▼──────────────┐
│  云函数（微信云开发）          │
│  mcp-proxy ──→ 麦当劳 MCP（https://mcp.mcd.cn，Token 仅在环境变量）
│  chat-parse ──→ 需求解析（清洗 + 结构化）
│  order-service ──→ 云数据库 orders 集合（openid 隔离）
└─────────────────────────────┘
```

**铁律**：MCP Token 只允许存在于 mcp-proxy 云函数环境变量（`MCP_TOKEN`），前端一律经云函数中转，禁止 `wx.request` 直连 `https://mcp.mcd.cn`。

## 3. 前后端分工

| 层 | 模块 | 职责 | 不做什么 |
|---|---|---|---|
| 前端 | pages/index | 对话式需求输入首页（chat-bar） | 不解析自然语言 |
| 前端 | pages/store | 门店列表（模糊定位→用户手选） | 不拿精确位置 |
| 前端 | pages/recommend | 推荐结果（meal-card + price-tag + verified 标记） | 不算价 |
| 前端 | pages/checkout | 账单页：券对比、省钱金额、>¥150 复述确认 | 不直接调 MCP |
| 前端 | pages/order-detail | 订单详情/状态 | 不展示他人订单 |
| 前端 | utils/money.js | 全站唯一的单位换算点（分→元只在此发生一次） | 不做二次换算 |
| 前端 | utils/request.js | callFunction 封装 + 401/429 用户提示 | 不 retry 401 |
| 云函数 | mcp-proxy | MCP streamable-http 客户端；tools 六模块 | 不写业务逻辑 |
| 云函数 | chat-parse | 清洗不可信输入 → 结构化条件 | 不拼提示词注入 |
| 云函数 | order-service | 订单落库/查询，openid 强制过滤 | 不跨用户读单 |

## 4. 调用链路（主流程）

```
1. index 页输入一句话 ──→ chat-parse（清洗→结构化：预算/热量/忌口/人数）
2. store 页 ──→ mcp-proxy/store.query-nearby-stores（城市+关键词双输入）
                 ──→ 用户手选门店（联调实测：官方要求 city 与 keyword 同时传）
3. recommend ──→ mcp-proxy/menu.query-meals + nutrition.list-nutrition-foods
                 ──→ 按结构化条件筛选 ──→ mcp-proxy/price.calculate-price 实算
                 （每项打 verified 标记；未实算灰显「未经实算验证，仅为标价参考」）
4. checkout ──→ mcp-proxy/coupon.available-coupons 对比券后价
                 ──→ 展示省钱金句卡（省>0 红卡 / 省=0 如实浅卡）；>¥150 弹窗复述确认
                 ──→ 仅查询模式拦截 / 用户显式开启下单 ──→ mcp-proxy/order.create-order
                 （下单必带 takeWayCode，取自算价返回的 takeWayList）
5. order-service 落库 orders（绑定 openid）──→ order-detail 页 query-order 查状态
```

## 5. 异常分支表

| 场景 | 检测点 | 行为 | 用户提示 |
|---|---|---|---|
| 401 Token 无效/过期 | mcp-proxy | **不重试**，直接报错 | 「凭证失效，请重新配置 MCP Token」 |
| 429 限流（600 次/分） | mcp-proxy | 退避一次后仍 429 则报错 | 「请求太频繁，请稍后再试」 |
| 无 Token | mcp-proxy | 检查环境变量，走 Mock（若开启） | 「当前为离线演示数据」 |
| 输入超长/含注入 | chat-parse | 截断 200 字 + 去控制字符 | 静默清洗，不报错 |
| 金额 >¥150 | checkout | 复述弹窗（金额/餐品/门店） | 「请确认：…」 |
| 仅查询模式 | checkout | 拦截 create-order | 「仅查询模式已开启，不会真实下单」 |
| 门店查询为空 | store | 展示空态 | 「附近暂无可用门店，请手动搜索」 |
| 网络/部署异常 | request.js | 统一 errMsg 归一化 | 「服务繁忙，请稍后重试」 |

## 6. 鉴权与隐私方案

- **身份**：openid 只从 `cloud.getWXContext()` 取，前端不传、不信前端传的任何身份字段
- **隔离**：orders 集合每条记录写 `_openid`；所有查询强制 `where({_openid})`，从机制上杜绝跨人串号
- **最小化**：不收集手机号、精确位置；模糊位置仅用于门店推荐且不落库
- **凭证**：MCP_TOKEN 只存云函数环境变量；仓库/日志/前端零出现；`.gitignore` 已排除含 token/secret 文件
- **不可信输入**：chat-parse 对自然语言做长度限制（≤200 字）+ 清洗（去控制字符/指令注入片段），禁止直接拼接进任何系统指令

## 7. 价格单位规则（最高优先级）

1. 全站只允许出现「元」
2. **唯一例外**：`calculate-price` 返回「分」（无引号整数）→ 在 mcp-proxy 的 tools/price.js 内做一次 `÷100`，出参即「元」
3. 其余工具（query-meals、create-order、query-order 等）返回「元」（字符串）→ **原样透传**，禁止统一换算或二次 ÷100
4. 前端 `utils/money.js` 只做格式化展示，不做单位猜测

## 8. 仅查询模式与 Mock

- 默认 `queryOnlyMode: true`（对齐 mcp-config.example.json），下单开关用户显式打开，UI 显著标注「将真实下单」
- `enableMock: true` 时，无 Token 也能演示全流程：mcp-proxy 各 tools 模块内置 Mock 数据，返回结构同真实接口
- Mock 数据在 UI 角标注明「演示数据」

## 9. 目录结构

```
miniprogram/
  pages/{index,store,recommend,checkout,order-detail}/
  components/{chat-bar,meal-card,price-tag}/
  utils/{request.js,money.js}
  app.js / app.json / app.wxss / sitemap.json
cloudfunctions/
  mcp-proxy/    index.js + tools/{store,menu,price,order,coupon,nutrition}.js
  chat-parse/   index.js
  order-service/ index.js
project.config.json
```

## 10. 已确认的环境事实（第 0 步结论）

- 云环境 ID：`cloud1-d5gheb18zd0b42967`（原计划 ID 经核实不存在，已报备变更）
- AppID：`wxb417c25671e997a4`；环境变量：`MY_ENV_ID`、`MCP_TOKEN` 均已配置生效

## 11. Token 联调实测结论（第 2~5 步实测修正）

> 以下均为 MCP_TOKEN 生效后用官方 inputSchema 与真实调用逐项验证的结论，
> 与初版设计的「猜测字段」有出入，以此为准。

1. **入参**：官方工具用 `storeCode`（非 storeId）、`orderType`+`beType` 必传、
   商品用 `items[].productCode`、`create-order` 到店必传 `takeWayCode`（取自算价返回 takeWayList）
2. **门店查询**：`city` 与 `keyword` 必须同时传（错误码 600058），故门店页为城市+关键词双输入
3. **返回格式**：官方返回是「说明文字 + 内嵌 JSON」混合文本，mcp-client 用括号平衡提取；
   业务数据在 `data.data`；业务错误 `success:false` 转结构化错误上抛（不静默）
4. **菜单结构**：`query-meals` 返回分类目录（仅 code）+ `data.meals` 编码字典（含名称/价格，单位元）
5. **营养表**：返回 CSV 文本（约 160 条经典餐品），按名称匹配；匹配率如实透出为
   `nutritionCoverage`，热量未知的餐品不过滤、不猜
6. **价格**：`calculate-price` 返回「分」，在 tools/price.js 唯一换算点 ÷100 转元字符串
7. **券数据**：当前 MCP 账户与各实测门店暂无券（如实展示「无券不虚构」，Mock 保留叠券演示）
8. **云函数超时**：线上默认 3 秒且 CLI 无法修改，已在云开发控制台手动改为 60 秒
   （组合推荐需 10~25 秒：5 次实算）
9. **联调辅助入口**：`mcp.status`（Token 自检白名单字段）/ `mcp.tools`（官方工具清单）/
   `mcp.raw`（只读查询类工具原始返回，手机号字段脱敏）
