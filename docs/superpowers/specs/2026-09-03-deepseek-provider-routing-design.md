# DeepSeek 可切换 AI Provider 设计

日期：2026-09-03  
状态：待用户书面规格确认

## 目标

在不改动前端、数据库结果结构、额度事务和失败退款语义的前提下，让 AI 电商工作台可以由 Supabase Edge Function 在 OpenAI 与 DeepSeek 之间安全切换。首个线上配置使用 DeepSeek 完成真实图片分析测试；未来获得 OpenAI API 凭据后，只切换服务端 Secret，不再修改业务页面。

DeepSeek 官方 Responses API 支持 `deepseek-v4-flash-vision-exp` 图片输入和 `json_schema` 结构化输出：

- https://api-docs.deepseek.com/guides/responses_api/
- https://api-docs.deepseek.com/guides/vision/

## 范围

本次包含：

- 服务端 Provider 路由与 DeepSeek Responses 适配。
- DeepSeek/OpenAI 分离的密钥与模型配置。
- 通用超时配置及旧 `OPENAI_TIMEOUT_MS` 兼容。
- 请求、返回、错误脱敏和现有结果校验的自动化测试。
- 更新运维文档、部署 `analyze-commerce` 并完成受控 live smoke。

本次不包含：

- 前端 Provider 选择器或向普通用户展示供应商名称。
- 把模型密钥放入浏览器、GitHub Pages 变量或数据库。
- 用户自定义 API 地址、任意代理地址或任意模型名称。
- 改变额度、7 天资产策略、项目结构或 UI。

## 架构

保留现有 `AiProvider` 接口和业务调用边界，在 `_shared/ai-provider.ts` 内增加受限路由：

1. `createAiProvider()` 读取 `AI_PROVIDER`。
2. `deepseek` 创建 DeepSeek Responses 适配器；`openai` 创建现有 OpenAI 适配器。
3. 未配置或非法 Provider 采用 fail-closed，返回安全的 `PROVIDER_NOT_CONFIGURED`，不得静默发往其他供应商。
4. Provider endpoint 使用代码内固定 allowlist：OpenAI 为 `https://api.openai.com/v1/responses`，DeepSeek 为 `https://api.deepseek.com/responses`。环境变量不能覆盖域名。
5. `analyze-commerce` 只依赖 `AiProvider`，既有 begin、后台处理、一次结构修复、complete/fail/refund 流程保持不变。

## 服务端配置

DeepSeek 首发配置：

- `AI_PROVIDER=deepseek`
- `DEEPSEEK_API_KEY`：必填，只存 Supabase Edge Function Secrets。
- `DEEPSEEK_MODEL=deepseek-v4-flash-vision-exp`：可选；缺省使用该视觉模型。
- `AI_TIMEOUT_MS`：可选，继续限制在 5–90 秒；缺省 60 秒。

OpenAI 保留配置：

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_MS` 仅作为旧配置兼容回退；新部署优先读取 `AI_TIMEOUT_MS`。

`DEEPSEEK_API_KEY`、`OPENAI_API_KEY` 均不得出现在 `VITE_` 变量、仓库文件、GitHub Pages 构建环境、日志或错误响应中。

## DeepSeek 请求与数据流

DeepSeek 使用 Responses API：

- `model` 缺省并且当前只允许 `deepseek-v4-flash-vision-exp`。即使设置了 `DEEPSEEK_MODEL`，不在代码 allowlist 中也必须 fail-closed，避免非视觉模型忽略商品图；未来模型升级必须先改 allowlist 和测试。
- `input` 沿用一段 `input_text` 和最多六张 `input_image` 签名 URL。
- `text.format` 沿用 `json_schema`、`commerce_result` 名称和现有 schema。
- 不发送 DeepSeek 不支持的 `store` 参数。
- 默认关闭额外推理，优先控制首版测试的延迟与成本；后续只有在质量评估证明必要时才调整。
- 返回继续从 `output_text` 或 `output[].content[].text` 提取，并使用现有 schema validator 二次验证。

私有图片仍由服务端生成短期签名 URL。URL 只发送给当前选中的固定 Provider，不写入生成结果、错误、日志或浏览器可复制内容。

## 错误与退款

- 缺少选中 Provider 的 Key：`PROVIDER_NOT_CONFIGURED`。
- 网络不可达或 DeepSeek 非 2xx：映射为安全错误，不返回供应商正文、请求 ID、签名 URL 或密钥。
- 超时：继续返回 `PROVIDER_TIMEOUT`。
- JSON 无法解析或 schema 不合格：沿用一次修复重试；第二次失败进入既有原子 fail/refund。
- DeepSeek 失败不得自动回退 OpenAI，避免一次用户操作跨供应商重复发送图片或产生双重费用。

## 测试与上线门槛

自动化测试必须覆盖：

- `AI_PROVIDER=deepseek` 使用固定 DeepSeek endpoint、视觉模型、Bearer Key、图片内容块和 JSON Schema。
- DeepSeek 请求不含 `store`，且不允许环境变量覆盖 endpoint。
- `AI_PROVIDER=openai` 保持现有请求契约。
- 非法 Provider、缺少对应 Key、超时、网络错误、非 2xx、空输出和非法 JSON 均安全失败。
- `AI_TIMEOUT_MS` 优先级、5–90 秒 clamp 和旧超时变量兼容。
- 任何测试/日志/错误中不出现真实 Key 或签名 URL。
- Vitest、原生 Deno test、`npm.cmd run check:edge` 与生产构建全部通过。

线上顺序：

1. 用户在 Supabase Dashboard 保存 `DEEPSEEK_API_KEY`，不得粘贴到聊天。
2. CLI 设置非敏感 `AI_PROVIDER=deepseek` 与允许的模型名。
3. 重新部署 `analyze-commerce`。
4. 先做匿名拒绝和 CORS smoke，再由站长登录创建一次最小真实项目，上传一张测试图并生成一次结果。
5. 核对 generation 状态、模型名、额度只扣一次、失败只退一次、结果不含签名 URL和密钥。
6. 通过后才继续 GitHub Pages 发布；失败则保留数据库和上传函数，暂停 AI 入口上线并按安全错误排查。

## 验收标准

- 已登录用户能使用一张真实商品图得到满足现有 `CommerceResult` schema 的结果。
- 返回记录显示 DeepSeek 视觉模型，图片分析不是仅基于文字描述的伪结果。
- 匿名、跨用户和非法 Origin 仍被拒绝。
- 浏览器与仓库中没有 DeepSeek/OpenAI 密钥。
- 将 `AI_PROVIDER` 改为 `openai` 后，业务层和前端无需修改。
