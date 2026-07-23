# 业务面 Demo 讲解稿

这份文档用于第二轮业务面试，重点讲清楚 Homework 的思路、设计和实现过程。演示时先讲业务闭环，再讲技术实现，最后讲风险控制和可扩展性。

## 1. 开场说明

可以这样开场：

> 这个 Homework 我做成了一个可运行的 App Store Review 分析工具。它不是单纯展示页面，而是把用户评论转成产品交付物：先采集或导入评论，再清洗和筛选数据，然后调用 DeepSeek 做语义分析，最后输出产品发现、版本计划、PRD、测试用例和追踪校验。

核心关键词：

- Review in：App Store 评论或导入数据进入系统。
- AI analysis：DeepSeek 做主题发现、问题归纳和需求草拟。
- Product output：输出发现、PRD、版本计划和测试用例。
- Evidence traceability：所有结论都能追溯回评论 ID。

## 2. 演示路径

启动项目：

```bash
npm install
npm test
npm start
```

打开：

```text
http://localhost:8080
```

演示顺序：

1. 先展示首页，说明默认英文、可切中文。
2. 切到中文，说明交付语言默认英文，但支持中文场景。
3. 介绍左侧输入：
   - App Store 链接：用于指定分析对象。
   - 分析目标或约束：用于告诉模型重点关注什么。
4. 点击“使用缓存样例”。
5. 等结果出来后看左侧摘要：
   - 模型是 `deepseek-chat`，说明实际走了大模型。
   - 清洗后评论数量、平均评分、低评分数量用于快速理解数据质量。
6. 按 Tab 讲输出结果。

## 3. 每个 Tab 怎么讲

### 概览

说明数据来源、模型、清洗后评论数、平均评分、有效追踪链接和无效链接。

重点句：

> 我这里不仅生成内容，还做了 traceability 校验。无效链接为 0，说明 review、finding、requirement、test case 之间的引用关系是完整的。

### 评论

展示进入分析的数据，包括 rating、version、review id 和内容。

重点句：

> 后续每个 finding 和 requirement 都会引用这些 review id，避免大模型输出没有证据来源。

### 主题与发现

展示模型归纳出的主题和产品发现。

重点句：

> DeepSeek 负责动态发现主题，不是我写死几个分类。每个发现都带证据评论、置信度和冲突反馈。

### 版本计划

展示需求被安排到 V1、V2 或 Later。

重点句：

> V1 优先解决评论证据最强、影响最大的阻塞点；V2 做进一步体验优化；低置信度或大范围需求放到 Later。

### PRD

展示需求标题、问题描述、优先级、版本、来源 finding 和来源 review。

重点句：

> 这个 PRD 是从评论证据生成的产品文档雏形，不是泛泛总结。

### 测试用例

展示每个 requirement 对应的 QA 验证用例。

重点句：

> 我把需求继续转成测试用例，是为了形成从用户反馈到 QA 验证的闭环。

### 追踪校验

展示 review_to_finding、finding_to_requirement、review_to_requirement、requirement_to_test_case、review_to_test_case。

重点句：

> 这里是防幻觉设计。模型可以生成内容，但后端会校验它引用的 ID 是否真实存在。

### 原始 JSON

展示完整结构化结果。

重点句：

> 原始 JSON 方便后续接入其他系统，比如 Jira、飞书文档、测试平台或数据库。

## 4. 架构讲解

可以用这条主线讲：

```text
Vue UI -> Node API -> Review Collection / Import -> Cleaning & Scoping -> DeepSeek -> Sanitization -> Deliverables -> Traceability Validation
```

对应实现：

- 前端用 Vue 3 + Element Plus，负责表单、语言切换和结果展示。
- 后端用 Node HTTP 服务，负责接口、静态资源和环境变量读取。
- 分析 pipeline 负责采集、清洗、调用模型、构造交付物和校验链路。
- 存储层默认 memory，MySQL 可选，降低面试官本地运行门槛。

## 5. 设计取舍

### 为什么数据库可选

可以这样回答：

> 这个作业的核心是分析能力和可运行交付，所以默认不强依赖数据库。这样 HR 或面试官 clone 后只要配置 DeepSeek key 就能跑。需要生产化时，可以启用 MySQL 保存历史分析记录。

### 为什么有缓存样例

可以这样回答：

> App Store RSS 和网络在面试现场可能不稳定，所以我提供缓存样例保证演示可控。但缓存样例仍然会触发完整 pipeline 和 DeepSeek 分析，并且 UI 会明确标注来源，避免伪装成实时采集。

### 为什么要 fallback

可以这样回答：

> 大模型服务有可能超时或失败。系统不会假装模型成功，而是明确标注 fallback。正式评估时看 `usedModel` 和模型名，能区分 DeepSeek 结果和离线兜底结果。

### 为什么做 traceability

可以这样回答：

> 大模型容易生成看起来合理但没有证据的内容，所以我把 review id 作为硬约束，模型输出后后端还会二次清洗和校验。没有有效证据的 finding 或 requirement 会被过滤或标记 warning。

## 6. 文件说明

- `server.js`：Node 服务入口，提供 `/api/health`、`/api/sample`、`/api/analysis`、`/api/import`、`/api/runs/:id`，并托管前端静态文件。
- `public/index.html`：前端 HTML 入口，加载 Vue、Element Plus、样式和业务脚本。
- `public/app.js`：Vue 应用主逻辑，包含中英文文案、表单状态、接口调用和所有结果 Tab 展示。
- `public/styles.css`：页面样式，蓝色基调、双栏布局、卡片、表格和响应式适配。
- `src/analysis/pipeline.js`：核心分析 pipeline，包含 App ID 提取、Apple RSS 采集、评论清洗、目标筛选、DeepSeek 调用、结果清洗、PRD/测试用例生成和追踪校验。
- `src/db/store.js`：存储层，默认 memory，可选 MySQL。
- `db/schema.sql`：MySQL 表结构，用于生产化持久化。
- `sample-data/workout-for-women-us-reviews.json`：缓存样例评论，用于稳定演示。
- `tests/run-tests.js`：自动测试，覆盖采集、导入、清洗、筛选、模型超时兜底、追踪校验和前端语法。
- `.env.example`：环境变量模板，不包含真实 key。
- `.env`：本地真实环境变量，不提交 GitHub，不要现场展示。
- `render.yaml` / `railway.json`：部署平台配置。
- `README.md`：项目说明、启动方式、环境变量和评估说明。

## 7. 常见追问

### 这个项目是不是用了大模型？

> 是。核心语义分析调用 DeepSeek API，模型负责主题发现、问题归纳、冲突识别和需求草拟。规则部分主要做采集、清洗、校验和兜底。

### 如果 DeepSeek 挂了怎么办？

> 后端设置了模型请求超时，失败后会进入 deterministic fallback，并在 UI 中标注。这样演示不会卡死，也不会把兜底结果伪装成模型结果。

### 怎么判断模型没有乱编？

> Prompt 要求只引用允许的 review id；后端还会 sanitize 模型输出，删除不存在的 review id / finding id，并通过 traceability validation 检查链路。

### 如果要继续做，你会怎么扩展？

> 我会加历史运行列表、真实数据库持久化、更多 storefront 支持、导出 PRD/测试用例到 Markdown 或 CSV、以及人工审核/编辑模型结果的工作流。

## 8. 收尾总结

可以这样结束：

> 这个 Demo 的重点是完整闭环：从评论数据出发，经过清洗、目标约束和大模型分析，形成产品发现、需求、版本计划和测试用例，并且每一步都有证据追踪和失败处理。我优先保证了可运行性、可解释性和现场演示稳定性。
