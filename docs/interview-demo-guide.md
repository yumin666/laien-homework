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

## 9. 我的整体思路

拿到题目后，我先把它拆成三个层次：

1. 数据层：评论从哪里来，如何导入，如何清洗，如何避免脏数据影响模型。
2. 分析层：哪些部分交给规则，哪些部分交给大模型，模型输出如何被约束和校验。
3. 交付层：分析结果不能只停留在 summary，要变成产品、研发和测试都能使用的产物。

我的判断是，这个 Homework 的重点不是“做一个漂亮页面”，而是证明我能把模糊的用户反馈转成结构化的产品决策材料。所以我把核心目标定成：

- 输入：App Store 链接、分析目标、评论数据。
- 处理：采集、导入、清洗、去重、目标筛选、DeepSeek 语义分析。
- 输出：topics、findings、version plan、PRD、test cases、traceability。
- 保障：模型输出清洗、证据 ID 校验、失败降级、缓存样例。

面试时可以这样说：

> 我的第一步不是先写 UI，而是先定义数据闭环：评论如何进入、如何被清洗、如何被大模型分析、最后如何变成产品和测试可用的交付物。然后再围绕这个 pipeline 做前后端实现。

## 10. 设计过程

### 为什么采用 Vue + Node

选择 Vue 3 + Element Plus 是因为：

- 页面交互简单清晰，适合快速展示表单、步骤、表格和结果 Tab。
- Element Plus 能快速提供稳定的表单、按钮、表格、步骤条和标签。
- 面试官本地运行成本低，只需要 `npm install` 和 `npm start`。

选择 Node HTTP 服务是因为：

- 不需要额外框架，项目结构更透明。
- 可以同时托管前端静态文件和 API。
- 更容易让面试官看懂请求入口：`server.js` 里每个接口都很直接。

面试时可以这样说：

> 我没有引入太重的框架，因为这是面试作业，重点是业务闭环和可运行性。Node 原生 HTTP 足够支撑这个 demo，也能让代码结构更直接。

### 为什么规则和大模型分工

规则负责确定性工作：

- App ID 提取。
- Apple RSS 评论采集。
- JSON/CSV 导入。
- 字段归一化。
- 空评论过滤。
- 评分合法性校验。
- 评论去重。
- 目标范围筛选。
- 统计指标。
- 模型输出校验。
- traceability validation。

DeepSeek 负责语义工作：

- 动态主题发现。
- 相似问题合并。
- 产品发现生成。
- 冲突反馈识别。
- 需求草拟。

面试时可以这样说：

> 我没有把所有逻辑都丢给模型。确定性、可校验的部分用规则做；需要语义理解和归纳的部分交给 DeepSeek。这样结果更稳定，也更容易解释。

### 为什么要做模型输出清洗

大模型可能出现三个问题：

- 引用不存在的 review id。
- 生成没有证据支撑的 finding。
- 输出格式不完全符合预期。

所以后端做了 sanitize：

- 只保留存在于 scopedReviews 里的 review id。
- 删除没有有效证据的 finding。
- 删除没有有效 finding/review 来源的 requirement。
- 把 warning 写入 logs。
- 再做 traceability validation。

面试时可以这样说：

> Prompt 是第一层约束，后端 sanitize 是第二层约束，traceability validation 是第三层约束。这样即使模型输出不完美，也不会直接污染最终结果。

## 11. 实现过程

可以按这个顺序讲：

1. 先实现后端 pipeline。
   - 提取 App Store app id。
   - 支持 Apple RSS 采集。
   - 支持 JSON/CSV 导入。
   - 做评论归一化、清洗和去重。

2. 再接入 DeepSeek。
   - 构造 prompt，要求严格 JSON。
   - 要求模型只能引用传入的 review id。
   - 设置 temperature 较低，降低随机性。
   - 增加模型超时，避免现场演示一直等待。

3. 再生成业务交付物。
   - findings：产品洞察。
   - requirements：PRD 需求。
   - versionPlan：版本计划。
   - testCases：测试用例。
   - validation：追踪校验。

4. 最后做前端展示。
   - 左侧配置区。
   - 顶部语言切换。
   - 步骤条展示 pipeline 状态。
   - 多个 Tab 展示不同交付物。

5. 最后补测试和文档。
   - 单测覆盖清洗、导入、筛选、模型超时、追踪校验。
   - README 写启动方式。
   - Demo guide 写面试讲解路径。

面试时可以这样说：

> 实现顺序上，我先做核心 pipeline，确保业务逻辑闭环可跑，再做 UI 展示。这样即使 UI 还没完善，核心分析能力也能先被验证。

## 12. 我是如何使用 Codex 的

这个 Homework 过程中，我主要把 Codex 当成一个结对开发助手，而不是直接“一键生成代码”。

我用 Codex 做了这些事情：

1. 需求拆解
   - 和 Codex 一起把题目拆成采集、分析、PRD、测试用例、追踪校验几个模块。
   - 明确哪些功能必须满足题目要求，哪些属于加分项。

2. 技术方案选择
   - 讨论是否需要数据库。
   - 最后选择默认 memory store、MySQL 可选，降低运行门槛。
   - 讨论 UI 语言，最后做成默认英文、可切中文。

3. 代码实现
   - 让 Codex 根据设计实现 Node API、Vue 页面、DeepSeek 调用和测试。
   - 我负责确认方向、补充业务要求、检查最终效果。

4. 调试和测试
   - 用 Codex 跑 `npm test`。
   - 检查 `/api/health`、`/api/sample`、`/api/analysis`。
   - 发现并修复中文文案、前端语法、模型超时等问题。

5. 文档和演示准备
   - 让 Codex 整理 README。
   - 生成业务面 Demo 讲解稿。
   - 准备常见追问回答。

面试时建议这样说，比较真实也不心虚：

> 这个项目我有使用 Codex 辅助开发，主要用它做需求拆解、代码生成、调试测试和文档整理。但架构取舍、功能确认、题目要求校验和最终演示路径是我自己主导的。我把 Codex 当作结对开发工具，提高实现效率，而不是绕过理解过程。

如果面试官继续问“哪些地方是你自己判断的”，可以说：

- 是否使用数据库是我判断的：默认不依赖数据库，保证本地运行简单。
- 大模型必须接入是我判断的：所以 DeepSeek 是核心分析链路，不是装饰。
- 缓存样例是我判断的：为了面试现场稳定，但仍然明确标注来源。
- traceability 是我判断的：用来控制模型幻觉，体现工程可靠性。

## 13. Demo 每一步怎么展示、怎么说

### Step 1：启动项目

命令：

```bash
npm test
npm start
```

说法：

> 我先跑一下测试，确认核心 pipeline、导入、清洗、模型超时和追踪校验都通过。然后启动本地服务。

### Step 2：打开首页

地址：

```text
http://localhost:8080
```

说法：

> 这是首页，左侧是输入和运行摘要，右侧是分析阶段和结果区。默认是英文，因为题目交付可以面向英文评估，但右上角可以切中文。

### Step 3：切中文

操作：点击右上角 `中文`。

说法：

> 这里我做了中英文切换。中文模式下，表单、摘要、Tab 和阶段名都会切换，方便中文业务沟通。

### Step 4：介绍输入区

指左侧两个输入框：

说法：

> App Store 链接用来指定分析对象。分析目标或约束用来告诉系统关注什么，比如低评分、订阅转化、某个版本、可用性问题，或者未来两个版本规划。

### Step 5：使用缓存样例

操作：点击 `使用缓存样例`。

说法：

> 这里我用缓存样例演示，主要是避免现场 Apple RSS 或网络不稳定。但它不是静态假结果，仍然会走完整 pipeline，并调用 DeepSeek 做语义分析。结果里也会明确标注 source 是 cached sample reviews。

### Step 6：看运行摘要

等结果出来后，看左侧：

说法：

> 这里模型显示 deepseek-chat，说明这次语义分析是大模型驱动。下面是清洗后的评论数量、平均评分和低评分数量，用来快速判断数据范围。

### Step 7：讲概览

操作：停留在 `概览`。

说法：

> 概览看整体结果，包括数据来源、模型、评论数和追踪校验结果。这里无效链接是 0，说明生成结果里的证据链是完整的。

### Step 8：讲评论

操作：点击 `评论`。

说法：

> 这里展示进入分析的评论。后面的 finding 和 requirement 都会引用这些 review id，确保结论能回到原始评论。

### Step 9：讲主题与发现

操作：点击 `主题与发现`。

说法：

> 这一页是 DeepSeek 对评论做的主题归纳和产品发现。每个 finding 都有 evidenceReviewIds、sampleCount 和 confidence，不只是自然语言总结。

### Step 10：讲版本计划

操作：点击 `版本计划`。

说法：

> 这里把需求安排到 V1、V2 或 Later。我的思路是 V1 处理证据最强、影响最大的阻塞问题，V2 做体验增强，Later 放低置信度或范围更大的需求。

### Step 11：讲 PRD

操作：点击 `PRD`。

说法：

> PRD 里每个 requirement 都有问题描述、优先级、版本、来源 finding 和来源 review。这个部分可以作为产品文档初稿。

### Step 12：讲测试用例

操作：点击 `测试用例`。

说法：

> 我把需求进一步转成 QA 测试用例，包括前置条件、步骤和预期结果。这样从用户反馈到产品需求，再到测试验证，是一个闭环。

### Step 13：讲追踪校验

操作：点击 `追踪校验`。

说法：

> 这个是防止模型幻觉的关键。系统会检查 review 到 finding、finding 到 requirement、requirement 到 test case 的关系。如果模型引用了不存在的 id，会被过滤并记录 warning。

### Step 14：讲原始 JSON

操作：点击 `原始 JSON`。

说法：

> 原始 JSON 用于后续系统集成，比如导出到 Jira、飞书、测试平台或数据库。也方便评估人员检查模型输出结构。

## 14. 可测试 App Store 链接

现场最稳建议先用缓存样例。如果想测试 live App Store RSS，可以试下面这些官方 App Store 链接。不同 App 的 Apple RSS 可能会因为地区、评论可用性或网络返回空，这时使用缓存样例是正常兜底路径。

### 健康/健身类

```text
https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684
```

适合约束：

```text
Focus on subscription conversion, workout usability, low-rating blockers, conflicting feedback, and the next two release versions.
```

```text
https://apps.apple.com/us/app/strava-run-bike-walk/id426826309
```

适合约束：

```text
Focus on tracking accuracy, social sharing friction, subscription value perception, Apple Watch experience, and V1/V2 release planning.
```

```text
https://apps.apple.com/us/app/calm/id571800810
```

适合约束：

```text
Focus on onboarding, sleep content discovery, subscription trial confusion, low-rating complaints, and retention improvements.
```

```text
https://apps.apple.com/us/app/headspace-sleep-meditation/id493145008
```

适合约束：

```text
Focus on meditation onboarding, content navigation, subscription cancellation pain points, beginner user friction, and QA test cases.
```

### 教育/效率类

```text
https://apps.apple.com/us/app/duolingo-language-lessons/id570060128
```

适合约束：

```text
Focus on lesson flow, paywall friction, streak motivation, beginner confusion, conflicting feedback, and next two versions.
```

```text
https://apps.apple.com/us/app/todoist-to-do-list-calendar/id572688855
```

适合约束：

```text
Focus on task capture speed, calendar integration, reminder reliability, collaboration friction, and high-priority product fixes.
```

### 音乐/内容类

```text
https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580
```

适合约束：

```text
Focus on playback reliability, playlist discovery, ads or Premium conversion friction, offline listening, and regression test cases.
```

## 15. 更多分析约束模板

你可以直接复制到“分析目标或约束”里试。

### 通用产品分析

```text
Identify the top review-backed product problems, separate high-confidence findings from assumptions, and propose V1/V2 requirements with test cases.
```

### 低评分专项

```text
Focus only on low-rating and negative reviews. Find the blockers most likely to improve rating if fixed in the next release.
```

中文版本：

```text
重点关注低评、差评和负面反馈，找出下个版本最应该优先修复的问题，并生成 PRD 和测试用例。
```

### 订阅转化

```text
Focus on subscription conversion, paywall clarity, trial expectations, cancellation confusion, and pricing-related conflicts.
```

### 新手体验

```text
Focus on first-time user onboarding, beginner confusion, setup friction, and the first successful task completion.
```

### 某版本专项

```text
Focus on version 2.0 feedback, regressions, low-rating issues, and the highest-priority fixes for V1.
```

中文版本：

```text
重点分析版本 2.0 的用户反馈，关注回归问题、低评分原因和下一版最优先修复项。
```

### 测试用例专项

```text
Prioritize QA output. For each requirement, generate concrete test cases with preconditions, steps, expected results, and source review ids.
```

### 冲突反馈专项

```text
Find areas where positive and negative reviews disagree, explain the conflict, and propose validation steps before implementation.
```

### 版本计划专项

```text
Create a two-release plan. V1 should address urgent review-backed blockers, and V2 should improve broader experience and retention.
```
