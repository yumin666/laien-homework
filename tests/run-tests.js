const assert = require("assert");
const { execFileSync } = require("child_process");
const { createStore } = require("../src/db/store");
const {
  runAnalysis,
  cleanReviews,
  summarizeReviews,
  validateTraceability,
  deterministicAnalysis,
  selectScope,
  sanitizeModelOutput,
  collectAppleReviews,
  extractAppId,
  parseImportedReviews
} = require("../src/analysis/pipeline");

async function main() {
  execFileSync(process.execPath, ["-c", "public/app.js"], { cwd: require("path").join(__dirname, "..") });

  const reviews = [
    { id: "a", title: "Paywall", content: "Subscription pricing is confusing", rating: 2, version: "1.0", author: "u1" },
    { id: "b", title: "Paywall", content: "Subscription pricing is confusing", rating: 2, version: "1.0", author: "u1" },
    { id: "c", title: "Workout", content: "Beginner workout is too fast", rating: 3, version: "1.1", author: "u2" },
    { id: "d", title: "Good", content: "Beginner workout is useful", rating: 5, version: "1.1", author: "u3" }
  ];

  assert.strictEqual(extractAppId("https://apps.apple.com/us/app/foo/id839285684"), "839285684");

  const originalFetch = global.fetch;
  const fetchedUrls = [];
  global.fetch = async (url) => {
    fetchedUrls.push(url);
    return {
      ok: true,
      async json() {
        return {
          feed: {
            entry: [
              {
                id: { label: "live-1" },
                title: { label: "Live review" },
                content: { label: "This app is useful but the pricing is unclear." },
                "im:rating": { label: "3" },
                "im:version": { label: "1.0" },
                author: { name: { label: "tester" } },
                updated: { label: "2026-07-22T00:00:00Z" }
              }
            ]
          }
        };
      }
    };
  };
  const liveReviews = await collectAppleReviews("6448311069", 1);
  global.fetch = originalFetch;
  assert.strictEqual(liveReviews.length, 1);
  assert.ok(fetchedUrls[0].includes("/rss/customerreviews/id=6448311069/sortby=mostrecent/json"));

  const cleaned = cleanReviews(reviews);
  assert.strictEqual(cleaned.length, 3);

  const stats = summarizeReviews(cleaned);
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.lowRatingCount, 1);

  const imported = parseImportedReviews("id,title,content,rating,version\nx,Hello,World,4,2.0");
  assert.strictEqual(imported[0].id, "x");
  assert.strictEqual(imported[0].rating, 4);

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

  const chineseScopeReviews = [
    { id: "low-1", title: "Bad", content: "Too expensive", rating: 1, version: "2.0", author: "u1" },
    { id: "low-2", title: "Poor", content: "Trial is unclear", rating: 2, version: "2.0", author: "u2" },
    { id: "low-3", title: "Slow", content: "Workout flow is hard", rating: 3, version: "2.0", author: "u3" },
    { id: "high-1", title: "Good", content: "Useful daily plan", rating: 5, version: "3.0", author: "u4" }
  ];
  const chineseLowScope = selectScope(chineseScopeReviews, "关注低评和差评");
  assert.deepStrictEqual(chineseLowScope.map((review) => review.id), ["low-1", "low-2", "low-3"]);
  const chineseVersionScope = selectScope(chineseScopeReviews, "版本 2.0");
  assert.deepStrictEqual(chineseVersionScope.map((review) => review.id), ["low-1", "low-2", "low-3"]);

  const analysis = deterministicAnalysis(cleaned, "subscription beginner");
  assert.ok(analysis.findings.length > 0);
  assert.ok(analysis.requirements.length > 0);

  const sanitized = sanitizeModelOutput({
    topics: [{ id: "TOPIC-X", name: "Cancellation", summary: "Users mention cancellation problems.", reviewIds: ["a", "missing"], confidence: "high", conflicts: [] }],
    findings: [{ id: "FIND-X", title: "Cancellation is unclear", insight: "Users cannot cancel easily.", evidenceReviewIds: ["a", "missing"], sampleCount: 2, confidence: "high", conflicts: [], generatedBy: "deepseek" }],
    requirements: [{ id: "REQ-X", title: "Clarify cancellation", problem: "Users cannot cancel easily.", priority: "P0", version: "V1", sourceFindingIds: ["FIND-X"], sourceReviewIds: ["a", "missing"], assumptions: [] }]
  }, new Set(cleaned.map((review) => review.id)), true);
  assert.deepStrictEqual(sanitized.findings[0].evidenceReviewIds, ["a"]);
  assert.deepStrictEqual(sanitized.requirements[0].sourceReviewIds, ["a"]);
  assert.ok(sanitized.warnings.some((warning) => warning.includes("missing")));

  const unsupported = sanitizeModelOutput({
    topics: [],
    findings: [{ id: "FIND-BAD", title: "Unsupported", insight: "No valid evidence.", evidenceReviewIds: ["missing"], confidence: "high", conflicts: [] }],
    requirements: [{ id: "REQ-BAD", title: "Unsupported req", problem: "No valid evidence.", priority: "P0", version: "V1", sourceFindingIds: ["FIND-BAD"], sourceReviewIds: ["missing"], assumptions: [] }]
  }, new Set(cleaned.map((review) => review.id)), true);
  assert.strictEqual(unsupported.findings.length, 0);
  assert.strictEqual(unsupported.requirements.length, 0);

  const validation = validateTraceability(cleaned, {
    findings: analysis.findings,
    requirements: analysis.requirements,
    testCases: [{ id: "TC-1", requirementId: analysis.requirements[0].id }]
  });
  assert.ok(validation.validLinks.length > 0);
  assert.ok(validation.validLinks.some((link) => link.type === "finding_to_requirement"));
  assert.strictEqual(validation.invalidLinks.length, 0);

  const invalidFindingValidation = validateTraceability(cleaned, {
    findings: analysis.findings,
    requirements: [{ ...analysis.requirements[0], sourceFindingIds: ["missing-finding"] }],
    testCases: [{ id: "TC-2", requirementId: analysis.requirements[0].id }]
  });
  assert.ok(invalidFindingValidation.invalidLinks.some((link) => link.type === "finding_to_requirement"));
  assert.ok(invalidFindingValidation.warnings.some((warning) => warning.includes("missing-finding")));

  const invalidTestReviewValidation = validateTraceability(cleaned, {
    findings: analysis.findings,
    requirements: analysis.requirements,
    testCases: [{ id: "TC-3", requirementId: analysis.requirements[0].id, sourceReviewIds: ["missing-review"] }]
  });
  assert.ok(invalidTestReviewValidation.invalidLinks.some((link) => link.type === "review_to_test_case"));
  assert.ok(invalidTestReviewValidation.warnings.some((warning) => warning.includes("missing-review")));

  const sampleReviews = parseImportedReviews(JSON.stringify({ reviews }));
  const fetchBeforeTimeoutTest = global.fetch;
  global.fetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
  const timeoutResult = await runAnalysis({
    appUrl: "https://apps.apple.com/us/app/foo/id839285684",
    goal: "Focus on subscription blockers",
    importedReviews: sampleReviews,
    reviewSource: "cached-sample",
    store: null,
    env: { DEEPSEEK_API_KEY: "test-key", DEEPSEEK_TIMEOUT_MS: "1" }
  });
  global.fetch = fetchBeforeTimeoutTest;
  assert.strictEqual(timeoutResult.model.usedModel, false);
  assert.ok(timeoutResult.logs.some((log) => log.includes("timed out")));

  const result = await runAnalysis({
    appUrl: "https://apps.apple.com/us/app/foo/id839285684",
    goal: "Focus on subscription and beginner workout blockers",
    importedReviews: sampleReviews,
    reviewSource: "cached-sample",
    store: null,
    env: {}
  });
  assert.strictEqual(result.collection.source, "cached sample reviews");
  assert.ok(result.collection.limitations.some((limitation) => limitation.includes("offline demonstration")));
  assert.ok(result.deliverables.prd.requirements.length > 0);
  assert.ok(result.deliverables.versionPlan.versions.some((version) => version.version === "V1"));
  assert.ok(result.deliverables.testCases.every((testCase) => testCase.requirementId));
  assert.ok(result.deliverables.testCases.every((testCase) => Array.isArray(testCase.preconditions)));
  assert.ok(result.validation.validLinks.some((link) => link.type === "review_to_test_case"));
  assert.ok(result.validation.validLinks.length > 0);
  assert.strictEqual(result.model.usedModel, false);

  const store = createStore({});
  await store.saveRun({ runId: "run-test", appUrl: "x", goal: "", model: {}, cleanedReviews: [] });
  const saved = await store.getRun("run-test");
  assert.strictEqual(saved.runId, "run-test");

  console.log("All tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
