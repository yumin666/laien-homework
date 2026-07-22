# App Review Insights Design

Date: 2026-07-22

## Goal

Build a complete, locally runnable interview deliverable for the LaienTech iOS App Review Analysis and Version Planning Assessment.

The application must let an evaluator enter a valid U.S. App Store app URL and an analysis goal, then run an end-to-end workflow that collects or imports reviews, cleans and scopes them, performs model-driven semantic analysis with DeepSeek, generates a version plan, PRD, and test cases, and validates traceability from source reviews to final test cases.

The implementation should be conservative and reliable rather than over-engineered. All required assessment capabilities stay in scope.

## Product Scope

The first screen is the working analysis tool, not a marketing page.

Users can:

- Enter a U.S. App Store URL.
- Enter an analysis goal or constraint, such as subscription conversion, workout usability, low-rating blockers, a specific version, or conflicting feedback.
- Select the UI language. English is the default; Chinese is available for demos.
- Start a live analysis using the Apple RSS customer review feed.
- Load cached sample data for offline review.
- Import compatible JSON or CSV review data.
- Inspect progress, intermediate outputs, errors, limitations, and final deliverables.

The app must not rely on app-specific hard-coded categories, findings, requirements, or test cases.

## Architecture

### Frontend

Use Vue 3 with Element Plus.

The UI style is a blue-based operational dashboard:

- Element Plus forms, buttons, steps, tabs, alerts, tags, tables, and loading states.
- Blue as the primary color.
- Green for successful states, yellow for warnings, and red for failures.
- English UI by default, with a Chinese language switch.
- Compact, professional layout suitable for interview review.

Main UI areas:

- Header: product name, model status, language selector.
- Setup area: App Store URL, analysis goal, Start Analysis, Use Cached Sample, Import JSON/CSV.
- Progress area: Scope, Collect, Clean, Analyze, Plan, Validate, Complete.
- Result tabs: Overview, Reviews, Topics & Findings, Version Plan, PRD, Test Cases, Traceability, Raw JSON.

### Backend

Use the existing Node.js HTTP server.

API surface:

- `GET /api/health`: returns service, storage, model, and data-source readiness.
- `GET /api/sample`: returns cached sample data.
- `POST /api/import`: parses JSON or CSV review data into the supported review schema.
- `POST /api/analysis`: runs the full pipeline and returns all deliverables.
- Optional `GET /api/runs/:id`: returns a saved run when MySQL persistence is configured.

### Storage

The app runs without a required database.

- Default: in-memory run storage.
- Optional: MySQL persistence when `MYSQL_HOST`, `MYSQL_USER`, and `MYSQL_DATABASE` are configured.

MySQL must not be required for local evaluation.

## Data Collection

Use the Apple RSS customer review feed for the U.S. storefront:

`https://itunes.apple.com/us/rss/customerreviews/page={page}/id={appId}/sortby=mostrecent/json`

Rules:

- Extract the numeric app ID from the App Store URL.
- Fetch a bounded number of pages to avoid excessive requests.
- Normalize Apple RSS entries into the internal review schema.
- Stop when a page has no usable reviews.
- Display the data source and limitations in the UI.

Known limitation:

Apple RSS provides a limited recent review feed, not the complete historical review set. The UI and README must state this clearly.

Import support:

- JSON can be an array of reviews or an object with a `reviews` array.
- CSV must include documented headers such as `id`, `title`, `content`, `rating`, `version`, `author`, and `date`.
- Imported data is marked as user supplied, and original storefront authenticity is not independently verified.

## Analysis Pipeline

### 1. Scope

Use deterministic rules to interpret basic constraints from the goal:

- Low-rating focus.
- Version-specific focus.
- General product-planning focus when no narrow constraint is supplied.

The pipeline should preserve enough reviews for analysis. If filtering leaves too little evidence, it falls back to the broader cleaned set and records a limitation.

### 2. Clean

Use deterministic processing for:

- Field normalization.
- Required content validation.
- Rating validation.
- Duplicate detection.
- Stable review IDs.
- Word count and basic metadata.

### 3. Summarize

Use deterministic statistics for:

- Total cleaned reviews.
- Average rating.
- Rating distribution.
- Low-rating count.
- Positive review count.
- Top app versions.

### 4. Semantic Analysis

DeepSeek is the required model-driven semantic analysis provider.

The model is responsible for:

- Dynamic topic discovery.
- Similar issue consolidation.
- Evidence-grounded findings.
- Conflicting feedback identification.
- Uncertainty and confidence notes.
- Requirement drafts grounded in review evidence.

The model must receive only bounded review content and existing review IDs. The prompt must require strict JSON output and must instruct the model not to invent review IDs or unsupported conclusions.

Deterministic fallback may exist for offline demonstration or model failure, but it must be clearly labeled and must not be presented as satisfying the assessment's model-driven analysis requirement.

## Output Schema

The final result includes:

- `rawReviews`
- `cleanedReviews`
- `scopedReviews`
- `stats`
- `topics`
- `findings`
- `versionPlan`
- `prd`
- `testCases`
- `validation`
- `logs`
- `collection`
- `model`
- `stages`

Every major finding includes:

- Finding ID.
- Title and insight.
- Source review IDs.
- Supporting sample count.
- Confidence.
- Conflicts.
- Generator label, such as `deepseek`.

Every requirement includes:

- Requirement ID.
- Title and problem statement.
- Priority.
- Target version.
- Source finding IDs.
- Source review IDs.
- Assumptions when evidence is limited.

Every test case includes:

- Test case ID.
- Linked requirement ID.
- Source review IDs.
- Preconditions.
- Steps.
- Expected result.
- Priority.

## Traceability Validation

The backend validates the chain:

review -> finding -> requirement -> test case

Validation rules:

- Finding review IDs must exist in the scoped review set.
- Requirements must reference existing findings and reviews.
- Test cases must reference existing requirements.
- Unsupported model conclusions are removed, downgraded, or explicitly marked as assumptions or needing review.
- The UI displays valid links, invalid links, warnings, and limitations.

## Error Handling

The UI and API must expose clear failure states:

- Invalid App Store URL.
- Apple RSS request failure.
- No reviews returned.
- JSON/CSV import parse failure.
- DeepSeek API key missing.
- DeepSeek request failure.
- Model output parse failure.
- Model output with invalid review IDs.
- Insufficient evidence after scoping.
- Optional database save failure.

The app must not fabricate reviews, findings, requirements, or test cases to hide failures.

## Documentation

The README remains English-first and explains:

- Project purpose.
- Local setup.
- `.env.example` configuration.
- DeepSeek provider, model, and required API key.
- Apple RSS source and limitations.
- JSON/CSV import format.
- Cached sample data usage.
- Default no-database mode and optional MySQL mode.
- Which stages use deterministic rules and which use the model.
- Prompting and hallucination mitigation strategy.
- Failure-handling strategy.
- Test command and expected result.

## Testing

Automated tests should cover:

- App ID extraction.
- JSON import parsing.
- CSV import parsing.
- Review normalization.
- Cleaning and deduplication.
- Scope filtering.
- Model output sanitization.
- Traceability validation.
- End-to-end sample pipeline execution.

Manual verification should cover:

- `npm install`
- `npm test`
- `npm start`
- Health endpoint.
- Cached sample analysis.
- JSON/CSV import analysis.
- Real Apple RSS analysis when network access is available.
- DeepSeek configured and missing-key behavior.

## Deferred Enhancements

After the complete stable interview version is working, optional enhancements can include:

- Richer progress streaming.
- Better charts.
- A visual traceability graph.
- More advanced model self-review.
- Export to Markdown or JSON.
- Run history UI when MySQL is configured.
