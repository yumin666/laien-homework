# App Review Insights

App Review Insights is a runnable interview project for turning App Store reviews into evidence-grounded product findings, version plans, PRDs, and QA test cases.

The app accepts a U.S. App Store URL plus an analysis goal, collects or imports reviews, cleans and scopes the data, uses DeepSeek for semantic analysis, and validates traceability from source reviews to generated requirements and test cases.

## What This Builds

- A local Node.js + Vue 3 web app.
- Apple U.S. App Store review collection through the RSS customer review feed.
- JSON and CSV review import for evaluator-supplied datasets.
- DeepSeek-driven topic discovery, issue consolidation, findings, and requirement drafts.
- Deterministic cleaning, deduplication, statistics, and traceability validation.
- A default English UI with a Chinese language switch.
- Optional MySQL persistence; the app runs without MySQL by default.

## Why DeepSeek Is Used

DeepSeek performs the core semantic analysis at runtime: dynamic topic discovery, issue consolidation, evidence-grounded findings, conflict and uncertainty analysis, and requirement drafting. Deterministic fallback output is labeled as offline fallback and is not presented as satisfying the assessment's model-driven analysis requirement.

The model is instructed to return strict JSON, cite only supplied review IDs, separate evidence from assumptions, and call out conflicts or uncertainty. The backend then sanitizes all model output before it is shown in the UI.

## Data Collection Method

The live collector uses Apple's U.S. RSS customer review feed:

```text
https://itunes.apple.com/us/rss/customerreviews/page={page}/id={appId}/sortby=mostrecent/json
```

The app extracts the numeric app ID from links such as:

```text
https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684
```

This feed exposes a limited recent review set rather than complete historical review data, so the UI and result payload report this limitation. Requests are bounded by `MAX_REVIEW_PAGES` to avoid unnecessary load.

If Apple RSS returns no entries for the assessment app or for a temporary storefront/network condition, use the cached sample or import JSON/CSV reviews. The app reports this transparently instead of fabricating live reviews.

## Local Setup

```bash
npm install
cp .env.example .env
npm test
npm start
```

Open:

```text
http://localhost:8080
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`:

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```dotenv
PORT=8080
MAX_REVIEW_PAGES=5

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=45000

MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=
```

`DEEPSEEK_API_KEY` is required for formal model-driven analysis. Do not commit `.env`.

`DEEPSEEK_TIMEOUT_MS` caps model latency for demos and interviews. If DeepSeek is unavailable or too slow, the UI labels the deterministic fallback instead of spinning indefinitely.

## Running Without MySQL

No database is required for local evaluation. If MySQL variables are empty, the server uses an in-memory store for analysis runs.

## Deploying on Render

This repository includes `render.yaml` for a Render web service.

Deployment steps:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the GitHub repository.
3. Use the included `render.yaml`, or configure:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables in Render:
   - `DEEPSEEK_API_KEY`
   - `DEEPSEEK_MODEL=deepseek-chat`
   - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
   - `DEEPSEEK_TIMEOUT_MS=45000`
   - `MAX_REVIEW_PAGES=5`
5. Deploy the service and open the Render public URL.

Do not put `DEEPSEEK_API_KEY` in source code or GitHub settings.

## Optional MySQL Persistence

To persist runs, create the schema in `db/schema.sql`, then set:

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=app_review_insights
```

When configured, analysis runs and cleaned reviews are saved through `mysql2`.

## Importing JSON or CSV Reviews

JSON can be either an array:

```json
[
  {
    "id": "review-1",
    "title": "Confusing trial",
    "content": "I did not understand when the subscription would start.",
    "rating": 2,
    "version": "3.2.1",
    "author": "user-a",
    "date": "2026-07-01"
  }
]
```

or an object with a `reviews` array:

```json
{
  "reviews": [
    {
      "review_id": "review-1",
      "subject": "Confusing trial",
      "body": "I did not understand when the subscription would start.",
      "score": 2,
      "app_version": "3.2.1",
      "user": "user-a",
      "date": "2026-07-01"
    }
  ]
}
```

CSV headers can include:

```csv
id,title,content,rating,version,author,date
review-1,Confusing trial,I did not understand when the subscription would start.,2,3.2.1,user-a,2026-07-01
```

Imported reviews are labeled as user supplied because the app cannot independently verify their original storefront.

## Cached Sample Data

`sample-data/workout-for-women-us-reviews.json` provides cached review data for offline demonstration. It is clearly labeled and does not replace live collection or evaluator-supplied imports.

## Deterministic Rules vs Model-Driven Analysis

Deterministic rules handle:

- App ID extraction.
- Apple RSS collection.
- JSON/CSV parsing.
- Field normalization.
- Empty-content filtering.
- Rating validation.
- Deduplication.
- Basic goal scoping.
- Rating and version statistics.
- Traceability validation.
- Model output sanitization.

DeepSeek handles:

- Dynamic topic discovery.
- Similar issue consolidation.
- Evidence-grounded product findings.
- Conflict and uncertainty analysis.
- Requirement drafting from review evidence.

## Traceability and Hallucination Controls

Every major finding includes source review IDs, sample count, confidence, conflicts, and a generator label. Every requirement references findings and reviews. Every test case references a requirement and source reviews.

The backend validates:

- Review IDs cited by model output exist in the scoped dataset.
- Requirements reference existing findings and reviews.
- Test cases reference existing requirements.
- Invalid IDs are removed and logged.
- Unsupported conclusions are marked with assumptions or warnings.

## Failure Handling

The app reports these conditions instead of fabricating output:

- Invalid App Store URL.
- Apple RSS request failure.
- No reviews returned.
- No usable reviews after cleaning.
- JSON or CSV parse failure.
- Missing DeepSeek API key.
- DeepSeek request failure.
- DeepSeek request timeout.
- Model JSON parse failure.
- Invalid review IDs in model output.
- Insufficient evidence after scoping.
- Optional database save failure.

## Tests

Run:

```bash
npm test
```

The test suite covers App ID extraction, JSON/CSV import, cleaning and deduplication, English and Chinese scope fallback, deterministic analysis, DeepSeek timeout fallback, model output sanitization, traceability validation, memory storage, frontend script syntax, and an end-to-end imported-review pipeline.

## Interview Demo Guide

For the business interview walkthrough, see `docs/interview-demo-guide.md`. It includes the demo flow, architecture explanation, file map, design tradeoffs, and common Q&A.

## Evaluation Notes

This project is not only a scraper and not only a UI presentation. The core workflow turns authentic or evaluator-supplied reviews into product planning artifacts that remain linked to source evidence.

For a formal evaluation run, configure DeepSeek in `.env`, use a valid U.S. App Store app link or import a compatible dataset, and inspect the Overview, Topics & Findings, Version Plan, PRD, Test Cases, Traceability, and Raw JSON tabs.
