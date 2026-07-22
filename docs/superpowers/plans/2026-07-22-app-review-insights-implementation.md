# App Review Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete stable interview version of App Review Insights from the approved design spec.

**Architecture:** Keep the existing Node.js HTTP server and Vue single-page app, but harden the analysis pipeline, add Element Plus UI, add bilingual UI text, strengthen DeepSeek-driven semantic analysis, and expand validation, tests, and README. The app runs without MySQL by default and uses MySQL only when environment variables are configured.

**Tech Stack:** Node.js 18+, Vue 3, Element Plus, DeepSeek chat completions API, optional MySQL through `mysql2`, Apple RSS customer reviews, JSON/CSV import, Node `assert` tests.

---

## File Structure

- Modify `package.json`: add Element Plus dependency and keep simple `start`, `dev`, and `test` scripts.
- Modify `server.js`: serve Element Plus JS/CSS from local `node_modules`, add run lookup endpoint, improve API error status codes.
- Modify `src/analysis/pipeline.js`: harden collection, scoping, DeepSeek prompting, model output sanitization, deliverable generation, and validation.
- Modify `src/db/store.js`: keep memory store default and expose optional run lookup consistently.
- Modify `public/index.html`: load local Element Plus CSS/JS vendor assets before `public/app.js`.
- Replace `public/app.js`: Vue 3 app with Element Plus components, bilingual UI labels, result tabs, import flow, and clear model/source limitations.
- Replace `public/styles.css`: blue Element Plus dashboard styling and responsive layout refinements.
- Modify `tests/run-tests.js`: expand deterministic, import, model sanitization, validation, and end-to-end sample tests.
- Modify `README.md`: English-first delivery documentation.
- Modify `.env.example`: document DeepSeek, Apple RSS page limit, port, and optional MySQL settings.

## Task 1: Add Element Plus Local Vendor Support

**Files:**
- Modify: `package.json`
- Modify: `server.js`
- Modify: `public/index.html`
- Test: `tests/run-tests.js`

- [ ] **Step 1: Update dependencies**

Modify `package.json` so `dependencies` contains Element Plus:

```json
"dependencies": {
  "element-plus": "^2.14.3",
  "mysql2": "^3.11.5",
  "vue": "^3.5.13"
}
```

Run: `npm install`

Expected: `node_modules/element-plus` exists and `package-lock.json` is created or updated.

- [ ] **Step 2: Serve local Element Plus assets**

In `server.js`, add these routes before `return serveStatic(url.pathname, res);`:

```js
    if (req.method === "GET" && url.pathname === "/vendor/element-plus/index.full.min.js") {
      return serveVendorFile(res, path.join(__dirname, "node_modules", "element-plus", "dist", "index.full.min.js"), "application/javascript; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/vendor/element-plus/index.css") {
      return serveVendorFile(res, path.join(__dirname, "node_modules", "element-plus", "dist", "index.css"), "text/css; charset=utf-8");
    }
```

Add this helper near `sendText`:

```js
function serveVendorFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    return sendText(res, "Run npm install to install frontend vendor assets.", 404);
  }
  res.writeHead(200, { "Content-Type": contentType });
  return fs.createReadStream(filePath).pipe(res);
}
```

- [ ] **Step 3: Load Element Plus in HTML**

Modify `public/index.html` so the head loads Element Plus CSS and the body loads Element Plus JS before `app.js`:

```html
<link rel="stylesheet" href="/vendor/element-plus/index.css">
<link rel="stylesheet" href="/styles.css">
```

```html
<script src="/vendor/vue.global.prod.js"></script>
<script src="/vendor/element-plus/index.full.min.js"></script>
<script src="/app.js"></script>
```

- [ ] **Step 4: Verify syntax and existing tests**

Run: `node -c server.js`

Expected: no output and exit code 0.

Run: `npm test`

Expected: `All tests passed.`

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json server.js public/index.html tests/run-tests.js
git commit -m "feat: add local Element Plus assets"
```

## Task 2: Harden Review Import, Scope, and Collection Metadata

**Files:**
- Modify: `src/analysis/pipeline.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Add failing tests for import aliases and insufficient scoped data**

Append these tests to `tests/run-tests.js`:

```js
const importedObject = parseImportedReviews(JSON.stringify({
  reviews: [{ review_id: "json-1", subject: "Hard to cancel", body: "I cannot cancel the subscription", score: 1, app_version: "2.4.0", user: "alice", date: "2026-07-01" }]
}));
assert.strictEqual(importedObject[0].id, "json-1");
assert.strictEqual(importedObject[0].title, "Hard to cancel");
assert.strictEqual(importedObject[0].version, "2.4.0");

const csvWithQuotes = parseImportedReviews('id,title,content,rating,version,author,date\ncsv-1,"Price, unclear","Trial terms are unclear",2,3.1,bob,2026-07-02');
assert.strictEqual(csvWithQuotes[0].title, "Price, unclear");
assert.strictEqual(csvWithQuotes[0].content, "Trial terms are unclear");

const scopedFallback = selectScope(cleaned, "version 9.9 low rating");
assert.strictEqual(scopedFallback.length, cleaned.length);
```

Update the import list at the top:

```js
  selectScope,
```

Run: `npm test`

Expected: failure because `selectScope` is not exported.

- [ ] **Step 2: Export `selectScope`**

In `src/analysis/pipeline.js`, add `selectScope` to `module.exports`:

```js
  deterministicAnalysis,
  selectScope,
  extractAppId
```

- [ ] **Step 3: Fix garbled low-rating and version matching**

Replace `selectScope` with:

```js
function selectScope(reviews, goal) {
  const text = String(goal || "").toLowerCase();
  let selected = reviews;
  const wantsLowRating = /\b(low|bad|negative|poor|1-star|2-star|one-star|two-star)\b/.test(text) || /低评|差评|一星|二星/.test(goal);
  if (wantsLowRating) {
    selected = reviews.filter((review) => review.rating <= 3);
  }
  const versionMatch = String(goal || "").match(/version\s*([\d.]+)/i) || String(goal || "").match(/版本\s*([\d.]+)/);
  if (versionMatch) {
    const versionScoped = selected.filter((review) => String(review.version).includes(versionMatch[1]));
    if (versionScoped.length >= 3) selected = versionScoped;
  }
  return selected.length >= 3 ? selected : reviews;
}
```

- [ ] **Step 4: Normalize review ratings and generated import IDs**

Replace `normalizeReview` with:

```js
function normalizeReview(review, index = 0) {
  const fallbackHash = hash(JSON.stringify(review)).slice(0, 8);
  const rating = Number(review.rating || review.score || 0);
  return {
    id: String(review.id || review.reviewId || review.review_id || `import-${index}-${fallbackHash}`),
    title: String(review.title || review.subject || "").trim(),
    content: String(review.content || review.body || review.review || review.text || "").trim(),
    rating: Number.isFinite(rating) ? rating : 0,
    version: String(review.version || review.appVersion || review.app_version || "unknown"),
    author: String(review.author || review.userName || review.user || "anonymous"),
    updatedAt: String(review.updatedAt || review.updated || review.date || ""),
    source: String(review.source || "import")
  };
}
```

- [ ] **Step 5: Record scope fallback limitation**

In `runAnalysis`, replace:

```js
  const scopedReviews = selectScope(cleanedReviews, goal);
```

with:

```js
  const scopeSelection = selectScopeWithMetadata(cleanedReviews, goal);
  const scopedReviews = scopeSelection.reviews;
  collection.limitations.push(...scopeSelection.limitations);
```

Add:

```js
function selectScopeWithMetadata(reviews, goal) {
  const scoped = selectScope(reviews, goal);
  const limitations = [];
  if (scoped.length === reviews.length && String(goal || "").trim()) {
    limitations.push("The requested goal or filter did not leave enough evidence, so the broader cleaned review set was analyzed.");
  }
  return { reviews: scoped, limitations };
}
```

- [ ] **Step 6: Verify tests**

Run: `npm test`

Expected: `All tests passed.`

- [ ] **Step 7: Commit**

Run:

```bash
git add src/analysis/pipeline.js tests/run-tests.js
git commit -m "fix: harden review scoping and imports"
```

## Task 3: Strengthen DeepSeek Analysis Contract and Sanitization

**Files:**
- Modify: `src/analysis/pipeline.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Add failing tests for invalid model review IDs**

Append this test to `tests/run-tests.js`:

```js
const sanitized = sanitizeModelOutput({
  topics: [{ id: "TOPIC-X", name: "Cancellation", summary: "Users mention cancellation problems.", reviewIds: ["a", "missing"], confidence: "high", conflicts: [] }],
  findings: [{ id: "FIND-X", title: "Cancellation is unclear", insight: "Users cannot cancel easily.", evidenceReviewIds: ["a", "missing"], sampleCount: 2, confidence: "high", conflicts: [], generatedBy: "deepseek" }],
  requirements: [{ id: "REQ-X", title: "Clarify cancellation", problem: "Users cannot cancel easily.", priority: "P0", version: "V1", sourceFindingIds: ["FIND-X"], sourceReviewIds: ["a", "missing"], assumptions: [] }]
}, new Set(cleaned.map((review) => review.id)), true);
assert.deepStrictEqual(sanitized.findings[0].evidenceReviewIds, ["a"]);
assert.deepStrictEqual(sanitized.requirements[0].sourceReviewIds, ["a"]);
assert.ok(sanitized.warnings.some((warning) => warning.includes("missing")));
```

Update the import list:

```js
  sanitizeModelOutput,
```

Run: `npm test`

Expected: failure because `sanitizeModelOutput` is not exported.

- [ ] **Step 2: Add `sanitizeModelOutput`**

Add this function after `buildDeliverables`:

```js
function sanitizeModelOutput(parsed, reviewIds, usedModel) {
  const warnings = [];
  const topics = (parsed.topics || []).map((topic, index) => {
    const originalIds = topic.reviewIds || topic.evidenceReviewIds || [];
    const reviewIdsForTopic = originalIds.map(String).filter((id) => reviewIds.has(id));
    for (const id of originalIds.map(String)) {
      if (!reviewIds.has(id)) warnings.push(`Removed invalid review id ${id} from topic ${topic.id || index + 1}.`);
    }
    return {
      id: topic.id || `TOPIC-${index + 1}`,
      name: topic.name || `Topic ${index + 1}`,
      summary: topic.summary || "",
      reviewIds: reviewIdsForTopic,
      confidence: normalizeConfidence(topic.confidence, reviewIdsForTopic.length),
      conflicts: Array.isArray(topic.conflicts) ? topic.conflicts : []
    };
  });
  const findings = sanitizeFindings(parsed.findings || [], reviewIds, usedModel, warnings);
  const requirements = sanitizeRequirements(parsed.requirements || [], findings, reviewIds, warnings);
  return { topics, findings, requirements, warnings };
}
```

Replace `sanitizeFindings` signature and invalid-ID logic:

```js
function sanitizeFindings(findings, reviewIds, usedModel, warnings = []) {
  return findings.map((finding, index) => {
    const originalIds = finding.evidenceReviewIds || finding.reviewIds || [];
    const evidenceReviewIds = originalIds.map(String).filter((id) => reviewIds.has(id));
    for (const id of originalIds.map(String)) {
      if (!reviewIds.has(id)) warnings.push(`Removed invalid review id ${id} from finding ${finding.id || index + 1}.`);
    }
    return {
      id: finding.id || `FIND-${index + 1}`,
      title: finding.title || `Finding ${index + 1}`,
      insight: finding.insight || finding.summary || "",
      evidenceReviewIds,
      sampleCount: evidenceReviewIds.length,
      confidence: normalizeConfidence(finding.confidence, evidenceReviewIds.length),
      conflicts: Array.isArray(finding.conflicts) ? finding.conflicts : [],
      generatedBy: usedModel ? "deepseek" : (finding.generatedBy || "deterministic-fallback"),
      unsupported: evidenceReviewIds.length === 0
    };
  }).filter((finding) => !finding.unsupported || finding.insight);
}
```

Replace `sanitizeRequirements` signature and invalid-ID logic:

```js
function sanitizeRequirements(requirements, findings, reviewIds, warnings = []) {
  const findingIds = new Set(findings.map((finding) => finding.id));
  return requirements.map((requirement, index) => {
    const originalFindingIds = requirement.sourceFindingIds || [];
    const sourceFindingIds = originalFindingIds.map(String).filter((id) => findingIds.has(id));
    for (const id of originalFindingIds.map(String)) {
      if (!findingIds.has(id)) warnings.push(`Removed invalid finding id ${id} from requirement ${requirement.id || index + 1}.`);
    }
    const originalReviewIds = requirement.sourceReviewIds || requirement.reviewIds || [];
    const sourceReviewIds = originalReviewIds.map(String).filter((id) => reviewIds.has(id));
    for (const id of originalReviewIds.map(String)) {
      if (!reviewIds.has(id)) warnings.push(`Removed invalid review id ${id} from requirement ${requirement.id || index + 1}.`);
    }
    return {
      id: requirement.id || `REQ-${index + 1}`,
      title: requirement.title || `Requirement ${index + 1}`,
      problem: requirement.problem || requirement.summary || "",
      priority: ["P0", "P1", "P2"].includes(requirement.priority) ? requirement.priority : index < 2 ? "P0" : "P1",
      version: requirement.version || (index < 3 ? "V1" : "V2"),
      sourceFindingIds,
      sourceReviewIds,
      assumptions: [
        ...(Array.isArray(requirement.assumptions) ? requirement.assumptions : []),
        ...(sourceReviewIds.length === 0 ? ["No valid review id was returned; treat as assumption until validated."] : [])
      ]
    };
  });
}
```

Add:

```js
function normalizeConfidence(value, sampleCount) {
  if (["low", "medium", "high"].includes(value)) return value;
  return sampleCount >= 5 ? "high" : sampleCount >= 2 ? "medium" : "low";
}
```

- [ ] **Step 3: Use the sanitizer in deliverable generation**

In `buildDeliverables`, replace:

```js
  const findings = sanitizeFindings(parsed.findings || deterministic.findings, reviewIds, modelResult.usedModel);
  const requirements = sanitizeRequirements(parsed.requirements || deterministic.requirements, findings, reviewIds);
```

with:

```js
  const sanitized = sanitizeModelOutput({
    topics: parsed.topics || deterministic.topics,
    findings: parsed.findings || deterministic.findings,
    requirements: parsed.requirements || deterministic.requirements
  }, reviewIds, modelResult.usedModel);
  const findings = sanitized.findings;
  const requirements = sanitized.requirements;
```

Return sanitized topics and warnings:

```js
    topics: sanitized.topics,
    findings,
    requirements,
    versionPlan,
    prd: buildPrd(requirements, versionPlan, findings, goal),
    testCases,
    warnings: sanitized.warnings
```

- [ ] **Step 4: Export the sanitizer**

Add `sanitizeModelOutput` to `module.exports`.

- [ ] **Step 5: Verify tests**

Run: `npm test`

Expected: `All tests passed.`

- [ ] **Step 6: Commit**

Run:

```bash
git add src/analysis/pipeline.js tests/run-tests.js
git commit -m "feat: sanitize model analysis output"
```

## Task 4: Complete Deliverables and Traceability Warnings

**Files:**
- Modify: `src/analysis/pipeline.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Add end-to-end sample assertions**

Append this async test block to `tests/run-tests.js` before the final `console.log`:

```js
(async () => {
  const sampleReviews = parseImportedReviews(JSON.stringify({ reviews }));
  const result = await runAnalysis({
    appUrl: "https://apps.apple.com/us/app/foo/id839285684",
    goal: "Focus on subscription and beginner workout blockers",
    importedReviews: sampleReviews,
    store: null,
    env: {}
  });
  assert.ok(result.deliverables.prd.requirements.length > 0);
  assert.ok(result.deliverables.versionPlan.versions.some((version) => version.version === "V1"));
  assert.ok(result.deliverables.testCases.every((testCase) => testCase.requirementId));
  assert.ok(result.validation.validLinks.length > 0);
  assert.strictEqual(result.model.usedModel, false);
})();
```

Update imports:

```js
  runAnalysis,
```

Run: `npm test`

Expected: failure because current top-level test runner exits before awaited assertions are guaranteed or because exports are missing.

- [ ] **Step 2: Convert test runner to async main**

Wrap the whole contents of `tests/run-tests.js` in:

```js
async function main() {
  // existing assertions and the new await block go here
  console.log("All tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Remove the previous standalone `console.log("All tests passed.");`.

- [ ] **Step 3: Export `runAnalysis`**

Ensure `module.exports` in `src/analysis/pipeline.js` includes:

```js
  runAnalysis,
```

- [ ] **Step 4: Add validation warnings**

In `validateTraceability`, add a `warnings` array and push messages:

```js
  const warnings = [];
```

After finding loop:

```js
    if (finding.evidenceReviewIds.length === 0) warnings.push(`${finding.id} has no valid source reviews.`);
```

After requirement loop:

```js
    if (requirement.sourceReviewIds.length === 0) warnings.push(`${requirement.id} has no valid source reviews.`);
    if (requirement.sourceFindingIds.length === 0) warnings.push(`${requirement.id} has no valid source findings.`);
```

Return:

```js
  return { validLinks, invalidLinks, warnings };
```

- [ ] **Step 5: Attach deliverable warnings to logs**

In `runAnalysis`, after `const deliverables = buildDeliverables(...)`, add:

```js
  for (const warning of deliverables.warnings || []) logs.push(`Model output warning: ${warning}`);
```

- [ ] **Step 6: Verify tests**

Run: `npm test`

Expected: `All tests passed.`

- [ ] **Step 7: Commit**

Run:

```bash
git add src/analysis/pipeline.js tests/run-tests.js
git commit -m "feat: complete traceable deliverables"
```

## Task 5: Build Element Plus Bilingual UI

**Files:**
- Modify: `public/index.html`
- Replace: `public/app.js`
- Replace: `public/styles.css`

- [ ] **Step 1: Replace Vue app setup with Element Plus registration**

At the top of `public/app.js`, use:

```js
const { createApp } = Vue;

const STORAGE_KEY = "app-review-insights-language";
```

At the bottom, mount with Element Plus:

```js
const app = createApp(App);
app.use(ElementPlus);
app.mount("#app");
```

- [ ] **Step 2: Add bilingual copy map**

Add this object near the top of `public/app.js`:

```js
const COPY = {
  en: {
    title: "App Review Insights",
    subtitle: "Turn App Store reviews into evidence-grounded product plans, PRDs, and test cases.",
    appUrl: "App Store URL",
    goal: "Analysis goal or constraint",
    start: "Start Analysis",
    sample: "Use Cached Sample",
    import: "Import JSON/CSV",
    overview: "Overview",
    reviews: "Reviews",
    findings: "Topics & Findings",
    plan: "Version Plan",
    prd: "PRD",
    tests: "Test Cases",
    trace: "Traceability",
    raw: "Raw JSON",
    modelRequired: "DeepSeek is required for formal model-driven analysis.",
    fallback: "Deterministic fallback is for offline demonstration only.",
    waiting: "Run an analysis, load the cached sample, or import reviews to begin."
  },
  zh: {
    title: "App Review Insights",
    subtitle: "把 App Store 评论转成有证据支撑的产品计划、PRD 和测试用例。",
    appUrl: "App Store 链接",
    goal: "分析目标或约束",
    start: "开始分析",
    sample: "使用缓存样例",
    import: "导入 JSON/CSV",
    overview: "概览",
    reviews: "评论",
    findings: "主题与发现",
    plan: "版本计划",
    prd: "PRD",
    tests: "测试用例",
    trace: "追踪校验",
    raw: "原始 JSON",
    modelRequired: "正式模型驱动分析需要配置 DeepSeek。",
    fallback: "确定性兜底仅用于离线演示。",
    waiting: "运行分析、加载缓存样例或导入评论后开始。"
  }
};
```

- [ ] **Step 3: Implement UI state**

Inside the Vue component `data()`, include:

```js
language: localStorage.getItem(STORAGE_KEY) || "en",
appUrl: "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684",
goal: "Focus on subscription conversion, workout usability, low-rating blockers, conflicting feedback, and the next two release versions.",
importedReviews: null,
result: null,
loading: false,
error: "",
activeTab: "overview"
```

Add computed copy:

```js
t() {
  return COPY[this.language] || COPY.en;
}
```

Add language method:

```js
setLanguage(language) {
  this.language = language;
  localStorage.setItem(STORAGE_KEY, language);
}
```

- [ ] **Step 4: Replace template with Element Plus layout**

Use Element Plus components in the template:

```html
<el-container class="app-shell">
  <el-header class="app-header">
    <div>
      <h1>{{ t.title }}</h1>
      <p>{{ t.subtitle }}</p>
    </div>
    <div class="header-actions">
      <el-tag :type="result?.model?.usedModel ? 'success' : 'warning'">{{ result?.model?.model || 'DeepSeek' }}</el-tag>
      <el-segmented :model-value="language" :options="[{ label: 'EN', value: 'en' }, { label: '中文', value: 'zh' }]" @change="setLanguage"></el-segmented>
    </div>
  </el-header>
  <el-container>
    <el-aside width="340px" class="setup-panel">
      <el-form label-position="top">
        <el-form-item :label="t.appUrl">
          <el-input v-model="appUrl"></el-input>
        </el-form-item>
        <el-form-item :label="t.goal">
          <el-input v-model="goal" type="textarea" :rows="5"></el-input>
        </el-form-item>
        <el-button type="primary" :loading="loading" class="full-width" @click="start">{{ t.start }}</el-button>
        <el-button class="full-width secondary-action" :disabled="loading" @click="useSample">{{ t.sample }}</el-button>
        <label class="import-button">
          {{ t.import }}
          <input type="file" accept=".json,.csv" @change="importFile">
        </label>
      </el-form>
      <el-alert v-if="error" :title="error" :type="error.includes('Imported') ? 'success' : 'error'" show-icon :closable="false"></el-alert>
    </el-aside>
    <el-main class="result-panel">
      <el-empty v-if="!result" :description="t.waiting"></el-empty>
      <template v-else>
        <el-steps :active="completedStageCount" finish-status="success" class="stage-steps">
          <el-step v-for="[id, label] in stageLabels" :key="id" :title="label" :description="stageMap[id]?.detail || ''"></el-step>
        </el-steps>
        <el-alert v-if="result.collection?.limitations?.length" type="warning" show-icon :closable="false" class="result-alert" :title="result.collection.limitations.join(' ')"></el-alert>
        <el-alert v-if="!result.model?.usedModel" type="warning" show-icon :closable="false" class="result-alert" :title="t.fallback"></el-alert>
        <el-tabs v-model="activeTab">
          <el-tab-pane :label="t.overview" name="overview">
            <div class="metric-grid">
              <el-card><span>Clean reviews</span><strong>{{ stats.total || 0 }}</strong></el-card>
              <el-card><span>Average rating</span><strong>{{ stats.averageRating || '-' }}</strong></el-card>
              <el-card><span>Low ratings</span><strong>{{ stats.lowRatingCount || 0 }}</strong></el-card>
              <el-card><span>Findings</span><strong>{{ result.deliverables.findings.length }}</strong></el-card>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t.findings" name="findings">
            <el-card v-for="finding in result.deliverables.findings" :key="finding.id" class="result-card">
              <template #header>{{ finding.id }} · {{ finding.title }}</template>
              <p>{{ finding.insight }}</p>
              <el-tag>{{ finding.confidence }}</el-tag>
              <el-tag :type="finding.generatedBy === 'deepseek' ? 'success' : 'warning'">{{ finding.generatedBy }}</el-tag>
              <p class="muted">Evidence: {{ reviewText(finding.evidenceReviewIds).join(' | ') }}</p>
            </el-card>
          </el-tab-pane>
          <el-tab-pane :label="t.plan" name="plan">
            <el-card v-for="version in result.deliverables.versionPlan.versions" :key="version.version" class="result-card">
              <template #header>{{ version.version }}</template>
              <p>{{ version.objective }}</p>
              <el-tag v-for="id in version.requirements" :key="id">{{ id }}</el-tag>
            </el-card>
          </el-tab-pane>
          <el-tab-pane :label="t.prd" name="prd">
            <el-card class="result-card">
              <template #header>{{ result.deliverables.prd.title }}</template>
              <p>{{ result.deliverables.prd.goal }}</p>
              <el-collapse>
                <el-collapse-item v-for="req in result.deliverables.prd.requirements" :key="req.id" :title="req.id + ' · ' + req.title">
                  <p>{{ req.problem }}</p>
                  <el-tag>{{ req.priority }}</el-tag>
                  <el-tag>{{ req.version }}</el-tag>
                  <p class="muted">Reviews: {{ req.sourceReviewIds.join(', ') }}</p>
                </el-collapse-item>
              </el-collapse>
            </el-card>
          </el-tab-pane>
          <el-tab-pane :label="t.tests" name="tests">
            <el-table :data="result.deliverables.testCases" border>
              <el-table-column prop="id" label="ID" width="120"></el-table-column>
              <el-table-column prop="requirementId" label="Requirement" width="140"></el-table-column>
              <el-table-column label="Steps"><template #default="{ row }">{{ row.steps.join(' -> ') }}</template></el-table-column>
              <el-table-column prop="expectedResult" label="Expected"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="t.trace" name="trace">
            <el-alert :type="result.validation.invalidLinks.length ? 'warning' : 'success'" show-icon :closable="false" :title="result.validation.validLinks.length + ' valid links, ' + result.validation.invalidLinks.length + ' invalid links'"></el-alert>
            <pre>{{ json(result.validation) }}</pre>
          </el-tab-pane>
          <el-tab-pane :label="t.reviews" name="reviews">
            <el-table :data="result.scopedReviews" border>
              <el-table-column prop="rating" label="Rating" width="90"></el-table-column>
              <el-table-column prop="version" label="Version" width="120"></el-table-column>
              <el-table-column prop="title" label="Title" width="220"></el-table-column>
              <el-table-column prop="content" label="Content"></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="t.raw" name="raw">
            <pre>{{ json(result) }}</pre>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-main>
  </el-container>
</el-container>
```

Add these computed properties:

```js
stageMap() {
  return Object.fromEntries((this.result?.stages || []).map((stage) => [stage.id, stage]));
},
stats() {
  return this.result?.stats || {};
},
stageLabels() {
  return [["scope", "Scope"], ["collect", "Collect"], ["clean", "Clean"], ["semantic", "Analyze"], ["plan", "Plan"], ["validate", "Validate"]];
},
completedStageCount() {
  return (this.result?.stages || []).filter((stage) => stage.status === "done" || stage.status === "warning").length;
}
```

- [ ] **Step 5: Replace CSS**

Set these base styles in `public/styles.css`:

```css
:root {
  --app-blue: #1677ff;
  --app-bg: #f5f7fa;
  --app-border: #dcdfe6;
  --app-text: #303133;
  --app-muted: #606266;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--app-bg);
  color: var(--app-text);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}

.app-shell {
  min-height: 100vh;
}

.app-header {
  height: auto;
  min-height: 76px;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.app-header h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.app-header p {
  margin: 6px 0 0;
  color: var(--app-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setup-panel {
  background: #fff;
  border-right: 1px solid var(--app-border);
  padding: 20px;
}

.result-panel {
  padding: 20px;
}

.full-width,
.import-button {
  width: 100%;
}

.secondary-action {
  margin: 10px 0 0;
}

.import-button {
  display: block;
  margin-top: 10px;
  padding: 9px 12px;
  border: 1px solid var(--app-blue);
  color: var(--app-blue);
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
}

.import-button input {
  display: none;
}

@media (max-width: 900px) {
  .app-header,
  .header-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .setup-panel {
    width: 100% !important;
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }

  .app-shell > .el-container {
    flex-direction: column;
  }
}
```

- [ ] **Step 6: Verify UI assets**

Run: `npm start`

Open: `http://localhost:8080`

Expected: page renders Element Plus styling, blue dashboard layout, language switch works, sample analysis can be started, and all result tabs are visible after analysis.

- [ ] **Step 7: Commit**

Run:

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: build bilingual Element Plus UI"
```

## Task 6: Add Run Lookup and Improve API Error Semantics

**Files:**
- Modify: `server.js`
- Modify: `src/db/store.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Add memory store lookup test**

Append this test inside `main()` in `tests/run-tests.js`:

```js
const { createStore } = require("../src/db/store");
const store = createStore({});
await store.saveRun({ runId: "run-test", appUrl: "x", goal: "", model: {}, cleanedReviews: [] });
const saved = await store.getRun("run-test");
assert.strictEqual(saved.runId, "run-test");
```

Run: `npm test`

Expected: pass if memory store remains compatible.

- [ ] **Step 2: Add `GET /api/runs/:id`**

In `server.js`, add before static serving:

```js
    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.replace("/api/runs/", ""));
      const run = await store.getRun(runId);
      if (!run) return sendJson(res, { error: "Run not found" }, 404);
      return sendJson(res, run);
    }
```

- [ ] **Step 3: Return user errors with 400 where possible**

In the `catch` block of `server.js`, replace:

```js
    return sendJson(res, { error: error.message || "Unexpected server error" }, 500);
```

with:

```js
    const message = error.message || "Unexpected server error";
    const status = /Invalid App Store URL|Unexpected token|CSV|JSON|No reviews/i.test(message) ? 400 : 500;
    return sendJson(res, { error: message }, status);
```

- [ ] **Step 4: Verify**

Run: `npm test`

Expected: `All tests passed.`

Run: `node -c server.js`

Expected: no output and exit code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add server.js src/db/store.js tests/run-tests.js
git commit -m "feat: add analysis run lookup"
```

## Task 7: Update README and Environment Documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Use these keys:

```dotenv
PORT=8080
MAX_REVIEW_PAGES=5

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com

MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=
```

- [ ] **Step 2: Update README sections**

Ensure `README.md` includes these exact section headings:

```markdown
## What This Builds
## Why DeepSeek Is Used
## Data Collection Method
## Local Setup
## Environment Variables
## Running Without MySQL
## Optional MySQL Persistence
## Importing JSON or CSV Reviews
## Cached Sample Data
## Deterministic Rules vs Model-Driven Analysis
## Traceability and Hallucination Controls
## Failure Handling
## Tests
## Evaluation Notes
```

In `Why DeepSeek Is Used`, state:

```markdown
DeepSeek performs the core semantic analysis at runtime: dynamic topic discovery, issue consolidation, evidence-grounded findings, conflict and uncertainty analysis, and requirement drafting. Deterministic fallback output is labeled as offline fallback and is not presented as satisfying the assessment's model-driven analysis requirement.
```

In `Data Collection Method`, include the Apple RSS endpoint and limitation:

```markdown
The live collector uses Apple's U.S. RSS customer review feed: `https://itunes.apple.com/us/rss/customerreviews/page={page}/id={appId}/sortby=mostrecent/json`. This feed exposes a limited recent review set rather than complete historical review data, so the UI and result payload report this limitation.
```

- [ ] **Step 3: Verify README commands**

Run: `npm test`

Expected: `All tests passed.`

Run: `npm start`

Expected: console prints `App Review Insights running at http://localhost:8080`.

- [ ] **Step 4: Commit**

Run:

```bash
git add README.md .env.example
git commit -m "docs: document interview delivery workflow"
```

## Task 8: Final Verification and GitHub Readiness

**Files:**
- Modify only if verification reveals an issue.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short
```

Expected: no unintended tracked changes. Untracked files are acceptable only if they are intentionally excluded or ready to add.

- [ ] **Step 2: Run automated verification**

Run:

```bash
npm test
```

Expected: `All tests passed.`

- [ ] **Step 3: Run server smoke test**

Run:

```bash
npm start
```

Expected: server starts at `http://localhost:8080`.

Open `http://localhost:8080` and verify:

- Element Plus styles render.
- English UI is default.
- Chinese switch changes labels.
- Cached sample run produces findings, PRD, test cases, and traceability results.
- Missing DeepSeek key is clearly labeled as fallback or formal-analysis unavailable.

- [ ] **Step 4: Commit verification fixes**

If files changed during verification, run:

```bash
git add <changed-files>
git commit -m "fix: address final verification issues"
```

If no files changed, record the verification result in the final response.

- [ ] **Step 5: Prepare GitHub push**

When the user provides the GitHub repository URL, run:

```bash
git remote add origin <github-repo-url>
git push -u origin main
```

If `origin` already exists, run:

```bash
git remote -v
git push -u origin main
```

Expected: GitHub contains the complete project, commit history, README, sample data, source code, and tests.

## Self-Review

Spec coverage:

- Local runnable tool: Tasks 1, 5, 8.
- Apple RSS collection and import: Tasks 2, 7.
- Cleaning, deduplication, scoping, statistics: Tasks 2, 4.
- DeepSeek model-driven semantic analysis: Tasks 3, 7.
- Findings, PRD, version plan, test cases: Tasks 3, 4, 5.
- Traceability validation: Tasks 3, 4, 5.
- Progress, intermediate results, errors, limitations: Tasks 5, 6, 7.
- Default no database and optional MySQL: Tasks 6, 7.
- English default and Chinese switch: Task 5.
- README and tests: Tasks 7, 8.

Red-flag scan:

- The plan contains no unresolved markers, deferred implementation notes, or unnamed edge-case instructions.

Type consistency:

- Public API names are consistent: `runAnalysis`, `parseImportedReviews`, `selectScope`, `sanitizeModelOutput`, `validateTraceability`, and `createStore`.
- Output property names are consistent with the design spec: `rawReviews`, `cleanedReviews`, `scopedReviews`, `stats`, `deliverables`, `validation`, `logs`, `collection`, `model`, and `stages`.
