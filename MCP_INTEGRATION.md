# 麦当劳 MCP 集成说明

> 本文件说明本项目**实际使用**的麦当劳 MCP Server、Tool、调用流程与业务价值。
> 全部内容基于 MCP_TOKEN 配置后的真实联调实测（详见 `docs/TECH_DESIGN.md` 第 11 节），
> 非猜测性描述。

## 1. 接入的 MCP Server

| 项 | 值 |
|---|---|
| Server | 麦当劳中国官方 MCP Server（`https://mcp.mcd.cn`） |
| 传输协议 | Streamable HTTP（JSON-RPC 2.0，SSE 响应流） |
| 认证方式 | Bearer Token（仅存放于云函数环境变量 `MCP_TOKEN`，零前端暴露） |
| 握手结果 | `initialize` → `tools/list` 成功，官方提供 **35 个工具** |
| 实际调用 | 其中 **8 个业务工具** 构成本项目全链路（见下表） |

## 2. 实际使用的 Tool 清单（8 个）

| # | 官方 Tool | 用途 | 关键入参（实测） | 在项目中的角色 |
|---|---|---|---|---|
| 1 | `query-nearby-stores` | 门店查询 | `beType=1`（到店）`searchType=2` `city`+`keyword`（实测两者须同时传，否则业务错误 600058） | 选店页：真实门店列表，用户手动选择 |
| 2 | `query-meals` | 菜单查询 | `storeCode`+`orderType=1`+`beType=1`；返回分类目录+编码字典（含名称/价格，单位元） | 推荐引擎的餐品池（实测单店 122 个餐品） |
| 3 | `query-meal-detail` | 餐品详情 | `code`+`storeCode`+`orderType`+`beType` | 单品详情补充（备用通道） |
| 4 | `calculate-price` | **官方实算价格** | `storeCode`+`items[{productCode,quantity}]`（券为 item 级 `couponId`）；返回金额单位**分**+`takeWayList` | **核心卖点支撑**：推荐排序与账单复核均以实算价为准 |
| 5 | `create-order` | 创建订单 | `storeCode`+`orderType`+`beType`+`items[].productCode`+`takeWayCode`（取自算价返回） | 下单（默认被「仅查询模式」拦截，用户显式开启） |
| 6 | `query-order` | 订单查询 | 官方订单标识 | 订单详情页（与本地落库双源比对） |
| 7 | `query-store-coupons` | 门店可用券 | `orderType`+`beType`+`storeCode` | 叠券省钱计算（当前无券则如实展示，不虚构） |
| 8 | `list-nutrition-foods` | 营养成分表 | 无参数；返回 CSV 文本（约 160 条经典餐品，按名称匹配） | 热量约束过滤 + 营养信息展示（匹配率如实透出） |

## 3. 端到端调用流程

```
用户输入「预算60，2人，不吃鱼」
        │
        ▼
[chat-parse 云函数]  纯规则解析（无 LLM，原文不进任何提示词）
        │  结构化：{ budgetYuan: 60, people: 2, avoidKeywords: ['鱼'] }
        ▼
[store 页] ── store.queryNearby ──→ ① query-nearby-stores ──→ 用户手选门店
        │
        ▼
[recommend 页] ── menu.recommend 编排：
        │    ├─ ② query-meals（拉取 122 个餐品池）
        │    ├─ ⑧ list-nutrition-foods（热量匹配，覆盖率 14% 如实透出）
        │    ├─ 忌口过滤（实测「鱼」剔除 10 个含鱼餐品）
        │    ├─ 组合生成（预算/热量/人数多维约束）
        │    └─ 逐组合 ④ calculate-price 实算 ──→ 每项带 verified 标记
        ▼
[checkout 页] ── ④ calculate-price 二次复核（防推荐价与结算价不一致）
        │         ── 返回 takeWayList（堂食/外带/得来速）供下单选择
        ▼
[下单] ── ⑤ create-order（takeWayCode + 仅查询模式双重保护）
        │
        ▼
[order-detail 页] ── ⑥ query-order（官方）+ 本地 orders 落库双源查询
```

**调用纪律（安全设计）：**
- 所有 MCP 调用仅发生在云函数 `mcp-proxy` 内，前端零直连
- 401 不重试；429 仅退避重试 1 次
- 金额单位全链路「元」，`calculate-price` 返回「分」仅在 `tools/price.js` 唯一换算点 ÷100
- 实测算不到合法金额时灰显 `--`，绝不兜底 ¥0.00

## 4. 业务价值

1. **「标价最低 ≠ 实付最低」**：推荐排序不信任菜单标价，每个候选组合都经
   `calculate-price` 官方实算后排序——标价 ¥47.50 叠券后 ¥35.50 低于标价 ¥38.50 的组合，
   只有官方实算链路才能发现，这是本项目区别于「菜单展示类」应用的核心价值。
2. **多约束组合推荐**：预算、热量上限、忌口、用餐人数四维结构化约束，
   依托官方真实菜单 + 营养表生成组合，而非固定套餐库。
3. **健康饮食决策辅助**：营养表按名称匹配套餐热量，热量未知如实标注不过滤，
   帮助身材管理人群「吃得明白」。
4. **省钱透明可分享**：账单页拆解「标价 → 券后实付 → 本单省」，
   官方无券时不虚构优惠，诚实展示本身即信任资产。
5. **全链路真实数据**：门店、菜单、价格、订单均为官方 MCP 实时数据
   （实测大连 5 门店/122 餐品），无一处演示数据冒充。

## 5. 工程实测细节（联调踩坑沉淀）

以下结论均为真实调用验证，已沉淀至 `docs/TECH_DESIGN.md` 第 11 节：

- 官方返回为「说明文字 + 内嵌 JSON」混合文本，客户端需括号平衡提取，业务错误
  `success:false` 藏于 HTTP 200 的文本体内，需结构化上抛而非静默
- `create-order` 的 `takeWayCode` 必须取自 `calculate-price` 返回的 `takeWayList[].code`
- 云函数默认超时 3 秒无法支撑「逐组合实算」（约 10~25 秒），已在云开发控制台调整为 60 秒
- 仓库存有自建联调自检入口：`mcp.status`（握手状态）/ `mcp.tools`（官方工具清单）/
  `mcp.raw`（只读工具原始返回，手机号字段脱敏）
