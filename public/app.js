const { createApp } = Vue;

const STORAGE_KEY = "app-review-insights-language";

const STAGES = [
  ["scope", "Scope"],
  ["collect", "Collect"],
  ["clean", "Clean"],
  ["scope-data", "Select"],
  ["semantic", "Analyze"],
  ["plan", "Plan"],
  ["validate", "Validate"],
  ["complete", "Complete"]
];

const COPY = {
  en: {
    title: "App Review Insights",
    subtitle: "Turn App Store reviews into evidence-grounded findings, version plans, PRDs, and test cases.",
    language: "Language",
    appUrl: "App Store URL",
    goal: "Analysis goal or constraint",
    start: "Start Analysis",
    running: "Running...",
    sample: "Use Cached Sample",
    import: "Import JSON/CSV",
    imported: "Imported {count} reviews. Click Start Analysis to run.",
    setup: "Analysis Setup",
    overview: "Overview",
    reviews: "Reviews",
    findings: "Topics & Findings",
    plan: "Version Plan",
    prd: "PRD",
    tests: "Test Cases",
    trace: "Traceability",
    raw: "Raw JSON",
    waiting: "Run an analysis, load the cached sample, or import reviews to begin.",
    summary: "Run Summary",
    source: "Source",
    model: "Model",
    storage: "Storage",
    cleanReviews: "Clean reviews",
    averageRating: "Average rating",
    lowRatings: "Low ratings",
    total: "Total",
    validLinks: "Valid links",
    invalidLinks: "Invalid links",
    limitations: "Limitations",
    logs: "Logs",
    fallback: "DeepSeek is not configured or failed. Deterministic fallback is for offline demonstration only.",
    noData: "No data"
  },
  zh: {
    title: "App Review Insights",
    subtitle: "把 App Store 评论转成有证据支撑的产品发现、版本计划、PRD 和测试用例。",
    language: "语言",
    appUrl: "App Store 链接",
    goal: "分析目标或约束",
    start: "开始分析",
    running: "分析中...",
    sample: "使用缓存样例",
    import: "导入 JSON/CSV",
    imported: "已导入 {count} 条评论。点击开始分析继续。",
    setup: "分析设置",
    overview: "概览",
    reviews: "评论",
    findings: "主题与发现",
    plan: "版本计划",
    prd: "PRD",
    tests: "测试用例",
    trace: "追踪校验",
    raw: "原始 JSON",
    waiting: "运行分析、加载缓存样例或导入评论后开始。",
    summary: "运行摘要",
    source: "来源",
    model: "模型",
    storage: "存储",
    cleanReviews: "清洗后评论",
    averageRating: "平均评分",
    lowRatings: "低评分",
    total: "总数",
    validLinks: "有效链接",
    invalidLinks: "无效链接",
    limitations: "限制说明",
    logs: "日志",
    fallback: "DeepSeek 未配置或调用失败。确定性兜底仅用于离线演示。",
    noData: "暂无数据"
  }
};

const App = {
  data() {
    return {
      language: localStorage.getItem(STORAGE_KEY) || "en",
      appUrl: "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684",
      goal: "Focus on subscription conversion, workout usability, low-rating blockers, conflicting feedback, and the next two release versions.",
      importedReviews: null,
      reviewSource: null,
      result: null,
      loading: false,
      error: "",
      notice: "",
      activeTab: "overview",
      stages: STAGES,
      tabs: [
        ["overview", "overview"],
        ["reviews", "reviews"],
        ["findings", "findings"],
        ["plan", "plan"],
        ["prd", "prd"],
        ["tests", "tests"],
        ["trace", "trace"],
        ["raw", "raw"]
      ]
    };
  },
  computed: {
    t() {
      return COPY[this.language] || COPY.en;
    },
    stageMap() {
      return Object.fromEntries((this.result?.stages || []).map((stage) => [stage.id, stage]));
    },
    completedStageCount() {
      return (this.result?.stages || []).filter((stage) => stage.status === "done" || stage.status === "warning").length;
    },
    stats() {
      return this.result?.stats || {};
    },
    deliverables() {
      return this.result?.deliverables || {};
    },
    topics() {
      return this.deliverables.topics || [];
    },
    findingsRows() {
      return this.deliverables.findings || [];
    },
    requirements() {
      return this.deliverables.prd?.requirements || [];
    },
    versionRows() {
      return this.deliverables.versionPlan?.versions || [];
    },
    testRows() {
      return this.deliverables.testCases || [];
    },
    reviewRows() {
      return this.result?.scopedReviews || [];
    },
    validation() {
      return this.result?.validation || { validLinks: [], invalidLinks: [], warnings: [] };
    }
  },
  watch: {
    appUrl(newValue, oldValue) {
      if (oldValue && newValue !== oldValue && this.reviewSource === "cached-sample") {
        this.importedReviews = null;
        this.reviewSource = null;
        this.notice = "";
      }
    }
  },
  methods: {
    setLanguage(language) {
      this.language = language;
      localStorage.setItem(STORAGE_KEY, language);
    },
    async start() {
      this.loading = true;
      this.error = "";
      this.notice = "";
      try {
        const response = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appUrl: this.appUrl, goal: this.goal, importedReviews: this.importedReviews, reviewSource: this.reviewSource })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Analysis failed");
        this.result = data;
        this.activeTab = "overview";
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async useSample() {
      this.error = "";
      this.notice = "";
      const response = await fetch("/api/sample");
      const data = await response.json();
      this.importedReviews = data.reviews;
      this.reviewSource = "cached-sample";
      this.appUrl = data.appUrl || this.appUrl;
      await this.start();
    },
    async importFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const response = await fetch("/api/import", { method: "POST", body: text });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Import failed");
        this.importedReviews = data.reviews;
        this.reviewSource = "user-import";
        this.notice = this.t.imported.replace("{count}", data.reviews.length);
      } catch (error) {
        this.error = error.message;
      } finally {
        event.target.value = "";
      }
    },
    chooseFile() {
      this.$refs.fileInput.click();
    },
    reviewText(ids) {
      const reviews = this.result?.scopedReviews || [];
      return (ids || []).map((id) => {
        const review = reviews.find((item) => item.id === id);
        return review ? `${id}: ${review.title || review.content.slice(0, 70)}` : id;
      });
    },
    join(value, fallback = "") {
      return Array.isArray(value) && value.length ? value.join(" | ") : (value || fallback || this.t.noData);
    },
    json(value) {
      return JSON.stringify(value, null, 2);
    },
    tagType(value) {
      const text = String(value || "").toLowerCase();
      if (text.includes("high") || text.includes("done") || text.includes("p0")) return "success";
      if (text.includes("low") || text.includes("warning") || text.includes("p2")) return "warning";
      if (text.includes("error") || text.includes("failed")) return "danger";
      return "primary";
    }
  },
  template: `
    <el-container class="app-shell">
      <el-header class="app-header">
        <div>
          <h1>{{ t.title }}</h1>
          <p>{{ t.subtitle }}</p>
        </div>
        <div class="header-actions">
          <el-tag :type="result?.model?.usedModel ? 'success' : 'warning'">{{ result?.model?.model || 'DeepSeek' }}</el-tag>
          <el-segmented :model-value="language" :options="[{ label: 'EN', value: 'en' }, { label: '中文', value: 'zh' }]" @change="setLanguage" />
        </div>
      </el-header>

      <el-container class="body-shell">
        <el-aside width="360px" class="side-panel">
          <el-card shadow="never" class="setup-card">
            <template #header>{{ t.setup }}</template>
            <el-form label-position="top">
              <el-form-item :label="t.appUrl">
                <el-input v-model="appUrl" placeholder="https://apps.apple.com/us/app/.../id839285684" />
              </el-form-item>
              <el-form-item :label="t.goal">
                <el-input v-model="goal" type="textarea" :rows="6" />
              </el-form-item>
              <div class="action-stack">
                <el-button type="primary" :loading="loading" @click="start">{{ loading ? t.running : t.start }}</el-button>
                <el-button :disabled="loading" @click="useSample">{{ t.sample }}</el-button>
                <el-button :disabled="loading" @click="chooseFile">{{ t.import }}</el-button>
                <input ref="fileInput" class="file-input" type="file" accept=".json,.csv" @change="importFile">
              </div>
            </el-form>
          </el-card>

          <el-alert v-if="error" class="side-alert" :title="error" type="error" show-icon :closable="false" />
          <el-alert v-if="notice" class="side-alert" :title="notice" type="success" show-icon :closable="false" />

          <el-card shadow="never" class="summary-card">
            <template #header>{{ t.summary }}</template>
            <div class="metric"><span>{{ t.storage }}</span><strong>{{ result ? 'Saved' : 'Pending' }}</strong></div>
            <div class="metric"><span>{{ t.model }}</span><strong>{{ result?.model?.usedModel ? result.model.model : 'Fallback' }}</strong></div>
            <div class="metric"><span>{{ t.cleanReviews }}</span><strong>{{ stats.total || 0 }}</strong></div>
            <div class="metric"><span>{{ t.averageRating }}</span><strong>{{ stats.averageRating || '-' }}</strong></div>
            <div class="metric"><span>{{ t.lowRatings }}</span><strong>{{ stats.lowRatingCount || 0 }}</strong></div>
          </el-card>
        </el-aside>

        <el-main class="main-panel">
          <el-card shadow="never" class="stages-card">
            <el-steps :active="completedStageCount" finish-status="success" align-center>
              <el-step v-for="[id, label] in stages" :key="id" :title="label" :description="stageMap[id]?.detail || ''" :status="stageMap[id]?.status === 'warning' ? 'error' : undefined" />
            </el-steps>
          </el-card>

          <el-card shadow="never" class="workspace-card">
            <el-empty v-if="!result" :description="t.waiting">
              <el-button type="primary" :loading="loading" @click="start">{{ t.start }}</el-button>
            </el-empty>

            <template v-else>
              <el-alert v-if="result.collection?.limitations?.length" class="result-alert" type="warning" show-icon :closable="false" :title="t.limitations" :description="result.collection.limitations.join(' ')" />
              <el-alert v-if="!result.model?.usedModel" class="result-alert" type="warning" show-icon :closable="false" :title="t.fallback" />

              <el-tabs v-model="activeTab" class="result-tabs">
                <el-tab-pane v-for="[id, key] in tabs" :key="id" :name="id" :label="t[key]">
                  <section v-if="id === 'overview'" class="overview-grid">
                    <el-card shadow="never"><span>{{ t.source }}</span><strong>{{ result.collection.source }}</strong></el-card>
                    <el-card shadow="never"><span>{{ t.model }}</span><strong>{{ result.model.usedModel ? result.model.model : 'Fallback' }}</strong></el-card>
                    <el-card shadow="never"><span>{{ t.cleanReviews }}</span><strong>{{ stats.total || 0 }}</strong></el-card>
                    <el-card shadow="never"><span>{{ t.averageRating }}</span><strong>{{ stats.averageRating || '-' }}</strong></el-card>
                    <el-card shadow="never"><span>{{ t.validLinks }}</span><strong>{{ validation.validLinks.length }}</strong></el-card>
                    <el-card shadow="never"><span>{{ t.invalidLinks }}</span><strong>{{ validation.invalidLinks.length }}</strong></el-card>
                  </section>

                  <el-table v-if="id === 'reviews'" :data="reviewRows" stripe border>
                    <el-table-column prop="rating" label="Rating" width="90" />
                    <el-table-column prop="version" label="Version" width="120" />
                    <el-table-column prop="id" label="ID" width="180" />
                    <el-table-column label="Review" min-width="420">
                      <template #default="{ row }">
                        <strong>{{ row.title }}</strong>
                        <p class="table-text">{{ row.content }}</p>
                      </template>
                    </el-table-column>
                  </el-table>

                  <section v-if="id === 'findings'" class="findings-layout">
                    <el-card v-for="topic in topics" :key="topic.id" shadow="never" class="result-card">
                      <template #header>{{ topic.id }} · {{ topic.name }}</template>
                      <p>{{ topic.summary }}</p>
                      <el-tag :type="tagType(topic.confidence)">{{ topic.confidence }}</el-tag>
                      <p class="muted-note">{{ join(topic.reviewIds) }}</p>
                    </el-card>
                    <el-card v-for="finding in findingsRows" :key="finding.id" shadow="never" class="result-card">
                      <template #header>{{ finding.id }} · {{ finding.title }}</template>
                      <p>{{ finding.insight }}</p>
                      <el-tag :type="tagType(finding.confidence)">{{ finding.confidence }}</el-tag>
                      <el-tag type="info">{{ finding.generatedBy }}</el-tag>
                      <p class="muted-note">{{ reviewText(finding.evidenceReviewIds).join(' | ') }}</p>
                      <p v-if="finding.conflicts?.length" class="muted-note">{{ finding.conflicts.join(' ') }}</p>
                    </el-card>
                  </section>

                  <el-table v-if="id === 'plan'" :data="versionRows" stripe border>
                    <el-table-column prop="version" label="Version" width="140" />
                    <el-table-column prop="objective" label="Objective" min-width="320" />
                    <el-table-column label="Requirements" min-width="260">
                      <template #default="{ row }">{{ join(row.requirements) }}</template>
                    </el-table-column>
                  </el-table>

                  <section v-if="id === 'prd'" class="prd-layout">
                    <el-card shadow="never" class="result-card">
                      <template #header>{{ deliverables.prd?.title }}</template>
                      <p>{{ deliverables.prd?.goal }}</p>
                      <p class="muted-note">{{ join(deliverables.prd?.successMetrics) }}</p>
                    </el-card>
                    <el-card v-for="req in requirements" :key="req.id" shadow="never" class="result-card">
                      <template #header>{{ req.id }} · {{ req.title }}</template>
                      <p>{{ req.problem }}</p>
                      <el-tag :type="tagType(req.priority)">{{ req.priority }}</el-tag>
                      <el-tag type="primary">{{ req.version }}</el-tag>
                      <p class="muted-note">Findings: {{ join(req.sourceFindingIds) }}</p>
                      <p class="muted-note">Reviews: {{ join(req.sourceReviewIds) }}</p>
                      <p v-if="req.assumptions?.length" class="muted-note">Assumptions: {{ join(req.assumptions) }}</p>
                    </el-card>
                  </section>

                  <el-table v-if="id === 'tests'" :data="testRows" stripe border>
                    <el-table-column prop="id" label="ID" width="130" />
                    <el-table-column prop="requirementId" label="Requirement" width="150" />
                    <el-table-column label="Preconditions" min-width="220">
                      <template #default="{ row }">{{ join(row.preconditions) }}</template>
                    </el-table-column>
                    <el-table-column label="Steps" min-width="320">
                      <template #default="{ row }">{{ join(row.steps) }}</template>
                    </el-table-column>
                    <el-table-column prop="expectedResult" label="Expected" min-width="300" />
                    <el-table-column label="Reviews" min-width="180">
                      <template #default="{ row }">{{ join(row.sourceReviewIds) }}</template>
                    </el-table-column>
                  </el-table>

                  <section v-if="id === 'trace'" class="trace-layout">
                    <el-card shadow="never" class="result-card">
                      <template #header>{{ t.trace }}</template>
                      <div class="metric"><span>{{ t.validLinks }}</span><strong>{{ validation.validLinks.length }}</strong></div>
                      <div class="metric"><span>{{ t.invalidLinks }}</span><strong>{{ validation.invalidLinks.length }}</strong></div>
                      <p v-if="validation.warnings?.length" class="muted-note">{{ validation.warnings.join(' ') }}</p>
                    </el-card>
                    <el-table :data="validation.validLinks" stripe border>
                      <el-table-column prop="type" label="Type" width="190" />
                      <el-table-column prop="from" label="From" min-width="180" />
                      <el-table-column prop="to" label="To" min-width="180" />
                    </el-table>
                  </section>

                  <pre v-if="id === 'raw'" class="raw-json">{{ json(result) }}</pre>
                </el-tab-pane>
              </el-tabs>
            </template>
          </el-card>
        </el-main>
      </el-container>
    </el-container>
  `
};

const app = createApp(App);
app.use(ElementPlus);
app.mount("#app");
