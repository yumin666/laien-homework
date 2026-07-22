const crypto = require("crypto");

const DEFAULT_APP_URL = "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684";
const MIN_SCOPED_REVIEWS = 3;

async function runAnalysis({ appUrl = DEFAULT_APP_URL, goal = "", importedReviews, store, env = process.env }) {
  const stages = [];
  const startedAt = new Date().toISOString();
  const appId = extractAppId(appUrl);
  const runId = `run_${Date.now()}`;
  const logs = [];

  stages.push(stage("scope", "done", `Goal applied: ${goal || "general product planning"}`));

  let rawReviews = [];
  let collection = { source: "import", limitations: [] };
  if (Array.isArray(importedReviews) && importedReviews.length > 0) {
    rawReviews = importedReviews.map(normalizeReview);
    collection.limitations.push("Reviews were supplied by user import; original storefront cannot be independently verified.");
  } else {
    if (!appId) throw new Error("Invalid App Store URL. It must contain an id like id839285684.");
    try {
      rawReviews = await collectAppleReviews(appId, Number(env.MAX_REVIEW_PAGES || 5));
      collection = {
        source: "Apple RSS customer reviews, US storefront",
        appId,
        limitations: ["Apple RSS exposes a limited recent review feed, not the complete review history."]
      };
    } catch (error) {
      logs.push(`Collection failed: ${error.message}`);
      throw error;
    }
  }
  if (rawReviews.length === 0) {
    throw new Error("Apple RSS returned no usable reviews for this app. Use Cached Sample for the assessment demo, or import JSON/CSV reviews supplied by the evaluator.");
  }
  stages.push(stage("collect", "done", `${rawReviews.length} reviews collected`));

  const cleanedReviews = cleanReviews(rawReviews);
  if (cleanedReviews.length === 0) throw new Error("No usable reviews remained after cleaning.");
  stages.push(stage("clean", "done", `${cleanedReviews.length} unique usable reviews`));

  const stats = summarizeReviews(cleanedReviews);
  const scopeSelection = selectScopeWithMetadata(cleanedReviews, goal);
  const scopedReviews = scopeSelection.reviews;
  collection.limitations.push(...scopeSelection.limitations);
  stages.push(stage("scope-data", "done", `${scopedReviews.length} reviews selected for semantic analysis`));

  const deterministic = deterministicAnalysis(scopedReviews, goal);
  let modelResult = await analyzeWithDeepSeek(scopedReviews, goal, env).catch((error) => {
    logs.push(`DeepSeek analysis failed: ${error.message}`);
    return {
      usedModel: false,
      provider: "deepseek",
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      error: error.message
    };
  });
  if (!modelResult.usedModel) {
    modelResult = { ...modelResult, parsed: deterministic };
  }
  stages.push(stage(
    "semantic",
    modelResult.usedModel ? "done" : "warning",
    modelResult.usedModel ? "DeepSeek semantic analysis completed" : "Using deterministic fallback because model is unavailable"
  ));

  const deliverables = buildDeliverables({ reviews: scopedReviews, stats, deterministic, modelResult, goal });
  for (const warning of deliverables.warnings || []) logs.push(`Model output warning: ${warning}`);
  stages.push(stage("plan", "done", `${deliverables.requirements.length} requirements and ${deliverables.testCases.length} test cases generated`));

  const validation = validateTraceability(scopedReviews, deliverables);
  stages.push(stage(
    "validate",
    validation.invalidLinks.length || validation.warnings.length ? "warning" : "done",
    `${validation.validLinks.length} valid trace links, ${validation.invalidLinks.length} issues`
  ));
  stages.push(stage("complete", "done", "Analysis run completed"));

  const result = {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    appUrl,
    goal,
    collection,
    model: {
      provider: modelResult.provider || "deepseek",
      model: modelResult.model || env.DEEPSEEK_MODEL || "deepseek-chat",
      usedModel: Boolean(modelResult.usedModel),
      note: modelResult.usedModel
        ? "Core semantic analysis was model-driven."
        : "Model not configured or failed; deterministic fallback is labeled in the UI and is not a substitute for formal model-driven analysis."
    },
    stages,
    stats,
    rawReviews,
    cleanedReviews,
    scopedReviews,
    deliverables,
    validation,
    logs
  };

  if (store) await store.saveRun(result).catch((error) => logs.push(`Database save failed: ${error.message}`));
  return result;
}

async function collectAppleReviews(appId, pages) {
  const reviews = [];
  const maxPages = Math.max(1, Math.min(Number.isFinite(pages) ? pages : 5, 10));
  for (let page = 1; page <= maxPages; page += 1) {
    const endpoint = `https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
    const response = await fetch(endpoint, { headers: { "User-Agent": "app-review-insights/1.0" } });
    if (!response.ok) throw new Error(`Apple RSS request failed on page ${page}: HTTP ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data.feed?.entry) ? data.feed.entry : [];
    const pageReviews = entries.filter((entry) => entry["im:rating"]).map((entry, index) => ({
      id: String(entry.id?.label || `${appId}-${page}-${index}`),
      title: String(entry.title?.label || "").trim(),
      content: String(entry.content?.label || "").trim(),
      rating: Number(entry["im:rating"]?.label || 0),
      version: String(entry["im:version"]?.label || "unknown"),
      author: String(entry.author?.name?.label || "anonymous"),
      updatedAt: String(entry.updated?.label || ""),
      source: "apple-rss-us"
    }));
    if (pageReviews.length === 0) break;
    reviews.push(...pageReviews);
  }
  return reviews;
}

function cleanReviews(rawReviews) {
  const seen = new Set();
  const cleaned = [];
  for (const raw of rawReviews.map(normalizeReview)) {
    if (!raw.content || raw.content.length < 3 || !raw.rating || raw.rating < 1 || raw.rating > 5) continue;
    const key = hash(`${raw.author}|${raw.rating}|${raw.title}|${raw.content}`.toLowerCase().replace(/\s+/g, " "));
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ ...raw, dedupeKey: key, wordCount: raw.content.split(/\s+/).filter(Boolean).length });
  }
  return cleaned;
}

function selectScope(reviews, goal) {
  const text = String(goal || "").toLowerCase();
  let selected = reviews;
  const wantsLowRating = /\b(low|bad|negative|poor|1-star|2-star|one-star|two-star)\b/.test(text) || /低评|差评|一星|二星/.test(String(goal || ""));
  if (wantsLowRating) {
    selected = reviews.filter((review) => review.rating <= 3);
  }
  const versionMatch = String(goal || "").match(/version\s*([\d.]+)/i) || String(goal || "").match(/版本\s*([\d.]+)/);
  if (versionMatch) {
    const versionScoped = selected.filter((review) => String(review.version).includes(versionMatch[1]));
    if (versionScoped.length >= MIN_SCOPED_REVIEWS) selected = versionScoped;
  }
  return selected.length >= MIN_SCOPED_REVIEWS ? selected : reviews;
}

function selectScopeWithMetadata(reviews, goal) {
  const scoped = selectScope(reviews, goal);
  const limitations = [];
  if (scoped.length === reviews.length && String(goal || "").trim()) {
    limitations.push("The requested goal or filter did not leave enough evidence, so the broader cleaned review set was analyzed.");
  }
  return { reviews: scoped, limitations };
}

function summarizeReviews(reviews) {
  const rating = {};
  const versions = {};
  let totalRating = 0;
  for (const review of reviews) {
    rating[review.rating] = (rating[review.rating] || 0) + 1;
    versions[review.version] = (versions[review.version] || 0) + 1;
    totalRating += review.rating;
  }
  return {
    total: reviews.length,
    averageRating: reviews.length ? Number((totalRating / reviews.length).toFixed(2)) : 0,
    ratingDistribution: rating,
    topVersions: Object.entries(versions).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([version, count]) => ({ version, count })),
    lowRatingCount: reviews.filter((review) => review.rating <= 2).length,
    positiveCount: reviews.filter((review) => review.rating >= 4).length
  };
}

function deterministicAnalysis(reviews, goal) {
  const terms = extractTerms(reviews, goal);
  const topics = terms.slice(0, 6).map((term, index) => {
    const hits = reviews.filter((review) => `${review.title} ${review.content}`.toLowerCase().includes(term));
    return {
      id: `TOPIC-${index + 1}`,
      name: titleCase(term),
      summary: `Recurring language around "${term}" appears in ${hits.length} scoped reviews.`,
      reviewIds: hits.slice(0, 8).map((review) => review.id),
      confidence: hits.length >= 5 ? "high" : hits.length >= 3 ? "medium" : "low",
      conflicts: findConflicts(hits, term)
    };
  });
  const findings = topics.map((topic, index) => ({
    id: `FIND-${index + 1}`,
    title: `${topic.name} is a review-backed opportunity`,
    insight: topic.summary,
    evidenceReviewIds: topic.reviewIds,
    sampleCount: topic.reviewIds.length,
    confidence: topic.confidence,
    conflicts: topic.conflicts,
    generatedBy: "deterministic-fallback"
  }));
  const requirements = findings.map((finding, index) => ({
    id: `REQ-${index + 1}`,
    title: `Improve ${finding.title.replace(" is a review-backed opportunity", "").toLowerCase()} experience`,
    problem: finding.insight,
    priority: index < 2 ? "P0" : index < 4 ? "P1" : "P2",
    version: index < 3 ? "V1" : "V2",
    sourceFindingIds: [finding.id],
    sourceReviewIds: finding.evidenceReviewIds,
    assumptions: finding.sampleCount < 3 ? ["Evidence is limited; validate with more reviews or analytics before release."] : []
  }));
  return { topics, findings, requirements };
}

async function analyzeWithDeepSeek(reviews, goal, env) {
  if (!env.DEEPSEEK_API_KEY) {
    return {
      usedModel: false,
      provider: "deepseek",
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      error: "DEEPSEEK_API_KEY is not configured."
    };
  }
  const payload = {
    model: env.DEEPSEEK_MODEL || "deepseek-chat",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a senior product analyst.",
          "Return strict JSON only.",
          "Never invent review ids.",
          "Every topic, finding, and requirement must cite source review ids from the supplied list.",
          "Separate evidence from assumptions and mention conflicts or uncertainty."
        ].join(" ")
      },
      { role: "user", content: buildDeepSeekPrompt(reviews, goal) }
    ]
  };
  const response = await fetch(`${env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`DeepSeek request failed: HTTP ${response.status}`);
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  return { usedModel: true, provider: "deepseek", model: payload.model, raw, parsed: parseJson(raw) };
}

function buildDeepSeekPrompt(reviews, goal) {
  return JSON.stringify({
    analysisGoal: goal || "General app review analysis and version planning",
    instructions: [
      "Discover topics dynamically from review language instead of using app-specific hard-coded categories.",
      "Every topic, finding, and requirement must cite only review ids from the provided reviews.",
      "Mark weak evidence as low confidence or an assumption instead of inventing support.",
      "Include material conflicts when positive and negative reviews disagree about the same issue."
    ],
    requiredSchema: {
      topics: [{ id: "TOPIC-1", name: "dynamic topic", summary: "short", reviewIds: ["existing review id"], confidence: "low|medium|high", conflicts: ["short"] }],
      findings: [{ id: "FIND-1", title: "short", insight: "evidence-grounded", evidenceReviewIds: ["existing review id"], sampleCount: 3, confidence: "low|medium|high", conflicts: ["short"], generatedBy: "deepseek" }],
      requirements: [{ id: "REQ-1", title: "short", problem: "review-backed problem", priority: "P0|P1|P2", version: "V1|V2|Later", sourceFindingIds: ["FIND-1"], sourceReviewIds: ["existing review id"], assumptions: ["only if needed"] }]
    },
    allowedReviewIds: reviews.map((review) => review.id),
    reviews: reviews.slice(0, 120).map((review) => ({
      id: review.id,
      rating: review.rating,
      version: review.version,
      title: review.title,
      content: review.content.slice(0, 1200)
    }))
  });
}

function buildDeliverables({ reviews, stats, deterministic, modelResult, goal }) {
  const parsed = modelResult.parsed || deterministic;
  const reviewIds = new Set(reviews.map((review) => review.id));
  const sanitized = sanitizeModelOutput({
    topics: parsed.topics || deterministic.topics,
    findings: parsed.findings || deterministic.findings,
    requirements: parsed.requirements || deterministic.requirements
  }, reviewIds, modelResult.usedModel);
  const findings = sanitized.findings;
  const requirements = sanitized.requirements;
  const versionPlan = buildVersionPlan(requirements, findings, stats, goal);
  const testCases = buildTestCases(requirements);
  return {
    topics: sanitized.topics,
    findings,
    requirements,
    versionPlan,
    prd: buildPrd(requirements, versionPlan, findings, goal),
    testCases,
    warnings: sanitized.warnings
  };
}

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
  }).filter((finding) => !finding.unsupported);
}

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
  }).filter((requirement) => requirement.sourceFindingIds.length > 0 && requirement.sourceReviewIds.length > 0);
}

function normalizeConfidence(value, sampleCount) {
  if (["low", "medium", "high"].includes(value)) return value;
  return sampleCount >= 5 ? "high" : sampleCount >= 2 ? "medium" : "low";
}

function buildVersionPlan(requirements, findings, stats, goal) {
  const versions = ["V1", "V2", "Later"].map((version) => ({
    version,
    objective: version === "V1" ? "Address strongest review-backed blockers first." : version === "V2" ? "Broaden improvements after validating V1 impact." : "Hold lower-confidence or larger-scope ideas.",
    requirements: requirements.filter((requirement) => requirement.version === version || (version === "Later" && !["V1", "V2"].includes(requirement.version))).map((requirement) => requirement.id)
  }));
  return {
    goal,
    evidenceSummary: `${stats.total} cleaned reviews, average rating ${stats.averageRating}, ${stats.lowRatingCount} low-rating reviews.`,
    findingsConsidered: findings.length,
    versions
  };
}

function buildPrd(requirements, versionPlan, findings, goal) {
  return {
    title: "Review-grounded update PRD",
    goal: goal || "Improve user satisfaction using App Store review evidence.",
    nonGoals: ["Do not introduce findings without review evidence.", "Do not optimize for app-specific hard-coded categories."],
    successMetrics: ["Decrease repeat low-rating complaint themes.", "Improve rating trend for targeted versions.", "Increase completion or conversion metrics for affected flows."],
    requirements: requirements.map((requirement) => ({
      ...requirement,
      acceptanceCriteria: [
        `Given a user affected by "${requirement.problem}", when the changed flow is used, then the issue is mitigated or clearly explained.`,
        "Analytics or QA evidence can be linked back to the original requirement."
      ]
    })),
    versionPlan,
    evidenceNotes: findings.map((finding) => `${finding.id}: ${finding.sampleCount} source reviews, confidence ${finding.confidence}`)
  };
}

function buildTestCases(requirements) {
  return requirements.flatMap((requirement, index) => [
    {
      id: `TC-${index + 1}-A`,
      requirementId: requirement.id,
      title: `Verify ${requirement.title}`,
      priority: requirement.priority,
      sourceReviewIds: requirement.sourceReviewIds,
      preconditions: ["App build includes the planned requirement implementation."],
      steps: ["Open the affected user flow.", "Reproduce the review-backed scenario.", "Complete the updated flow and observe feedback."],
      expectedResult: "The review-backed problem is resolved, reduced, or explicitly handled without regression."
    }
  ]);
}

function validateTraceability(reviews, deliverables) {
  const reviewIds = new Set(reviews.map((review) => review.id));
  const findingIds = new Set(deliverables.findings.map((finding) => finding.id));
  const requirementIds = new Set(deliverables.requirements.map((requirement) => requirement.id));
  const validLinks = [];
  const invalidLinks = [];
  const warnings = [];
  for (const finding of deliverables.findings) {
    for (const reviewId of finding.evidenceReviewIds) {
      (reviewIds.has(reviewId) ? validLinks : invalidLinks).push({ from: reviewId, to: finding.id, type: "review_to_finding" });
    }
    if (finding.evidenceReviewIds.length === 0) warnings.push(`${finding.id} has no valid source reviews.`);
  }
  for (const requirement of deliverables.requirements) {
    for (const findingId of requirement.sourceFindingIds) {
      (findingIds.has(findingId) ? validLinks : invalidLinks).push({ from: findingId, to: requirement.id, type: "finding_to_requirement" });
    }
    for (const reviewId of requirement.sourceReviewIds) {
      (reviewIds.has(reviewId) ? validLinks : invalidLinks).push({ from: reviewId, to: requirement.id, type: "review_to_requirement" });
    }
    if (requirement.sourceReviewIds.length === 0) warnings.push(`${requirement.id} has no valid source reviews.`);
    if (requirement.sourceFindingIds.length === 0) warnings.push(`${requirement.id} has no valid source findings.`);
    for (const findingId of requirement.sourceFindingIds) {
      if (!findingIds.has(findingId)) warnings.push(`${requirement.id} references missing finding ${findingId}.`);
    }
  }
  for (const testCase of deliverables.testCases) {
    (requirementIds.has(testCase.requirementId) ? validLinks : invalidLinks).push({ from: testCase.requirementId, to: testCase.id, type: "requirement_to_test_case" });
    for (const reviewId of testCase.sourceReviewIds || []) {
      (reviewIds.has(reviewId) ? validLinks : invalidLinks).push({ from: reviewId, to: testCase.id, type: "review_to_test_case" });
      if (!reviewIds.has(reviewId)) warnings.push(`${testCase.id} references missing review ${reviewId}.`);
    }
  }
  return { validLinks, invalidLinks, warnings };
}

function parseImportedReviews(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : parsed.reviews || []).map(normalizeReview);
  }
  const [headerLine, ...rows] = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(headerLine).map((header) => header.trim());
  return rows.map((row, index) => {
    const values = splitCsvLine(row);
    const item = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] || ""]));
    return normalizeReview(item, index);
  });
}

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

function extractTerms(reviews, goal) {
  const stop = new Set("the and for with this that was are you app but not have from workout workouts exercise exercises just very really can will would there they your into after before about".split(" "));
  const counts = new Map();
  const goalWords = String(goal).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
  for (const word of goalWords) counts.set(word, (counts.get(word) || 0) + 3);
  for (const review of reviews) {
    const words = `${review.title} ${review.content}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
    for (const word of words) {
      if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

function findConflicts(reviews, term) {
  const positives = reviews.filter((review) => review.rating >= 4).length;
  const negatives = reviews.filter((review) => review.rating <= 2).length;
  return positives && negatives ? [`"${term}" appears in both positive (${positives}) and negative (${negatives}) reviews.`] : [];
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function extractAppId(appUrl) {
  const match = String(appUrl).match(/id(\d{6,})/);
  return match ? match[1] : "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function stage(id, status, detail) {
  return { id, status, detail, at: new Date().toISOString() };
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = {
  runAnalysis,
  parseImportedReviews,
  cleanReviews,
  summarizeReviews,
  validateTraceability,
  deterministicAnalysis,
  selectScope,
  sanitizeModelOutput,
  extractAppId
};
