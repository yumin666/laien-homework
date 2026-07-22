const assert = require("assert");
const { createStore } = require("../src/db/store");
const {
  runAnalysis,
  cleanReviews,
  summarizeReviews,
  validateTraceability,
  deterministicAnalysis,
  selectScope,
  sanitizeModelOutput,
  extractAppId,
  parseImportedReviews
} = require("../src/analysis/pipeline");

async function main() {
  const reviews = [
    { id: "a", title: "Paywall", content: "Subscription pricing is confusing", rating: 2, version: "1.0", author: "u1" },
    { id: "b", title: "Paywall", content: "Subscription pricing is confusing", rating: 2, version: "1.0", author: "u1" },
    { id: "c", title: "Workout", content: "Beginner workout is too fast", rating: 3, version: "1.1", author: "u2" },
    { id: "d", title: "Good", content: "Beginner workout is useful", rating: 5, version: "1.1", author: "u3" }
  ];

  assert.strictEqual(extractAppId("https://apps.apple.com/us/app/foo/id839285684"), "839285684");

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
