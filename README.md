# LaienTech iOS App Review Analysis and Version Planning Assessment

## Background

This assessment is based on a real iOS app listed on the Apple App Store:

https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684

If you have access to an overseas network environment, use the U.S. App Store link above. If not, and the U.S. link cannot be opened or redirects, use the China App Store link only to open the app detail page:

https://apps.apple.com/cn/app/workout-for-women-home-gym/id839285684

Regardless of which link is used to open the page, the review data used in this assessment must come from the U.S. App Store storefront.

You are expected to complete a full product analysis workflow around this app's user reviews, covering data collection, review cleaning, review classification, issue analysis, version planning, PRD writing, and test case design. The final results should be presented through a runnable UI.

This assessment focuses on the candidate's vibe coding ability. Candidates should use vibe coding to complete the full process: collecting data, cleaning and analyzing reviews, abstracting product requirements, planning versions, designing test cases, and productizing the analysis workflow into an interactive experience.

## Objective

Build a runnable tool or web application. In the UI, the user should be able to enter the following App Store link:

```text
https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684
```

After the user clicks "Start", the system should automatically complete the following workflow and display the results in the UI:

1. Collect review data for the app.
2. Clean and structure the review data.
3. Classify and analyze the reviews.
4. Create an update plan for the next version based on the analysis, and produce a PRD.
5. If the required scope is too large, split it into a multi-version release plan.
6. Generate test cases based on the PRD.
7. Mark the corresponding or source user review for every test case.
8. Display the progress of the full workflow in the UI, including stages such as collection, cleaning, classification, analysis, PRD generation, and test case generation.
9. Display the interim deliverables for the current stage, such as raw review data, cleaned data, classification results, analysis findings, PRD draft, and test case draft.
10. Display the final analysis results, PRD, and test cases in the UI.

## Deliverables

Submit a GitHub project link and ensure the project can run locally.

The GitHub project should include complete source code, dependency configuration, running instructions, an explanation of the data collection method, and any necessary sample output or cached data so that interviewers can review the results even when external network access is unavailable.

The GitHub project should preserve a complete commit history to show the candidate's implementation process, iteration process, and use of vibe coding.

## Technical Requirements and Notes

- There is no restriction on the tech stack.
- You may use frontend frameworks, backend frameworks, data analysis libraries, visualization libraries, natural language processing models, or large language model APIs.
- You may use public APIs or third-party data collection libraries, but you must clearly explain the data source and its limitations.
- Pay attention to request rate limits and avoid placing abnormal load on the target site.
- A non-runnable document-only submission is not acceptable.

## Evaluation Criteria

This assessment focuses on whether the candidate can turn real user reviews into an executable product plan. The evaluation will mainly consider:

- Whether the data is authentic and reproducible, with a clear explanation of its source and limitations.
- Whether review cleaning, classification, and analysis are reasonable, and whether they surface concrete user problems.
- Whether the PRD is grounded in user problems, with clear requirement boundaries, priorities, and version planning.
- Whether the test cases cover the PRD and can be traced back to the corresponding user reviews.
- Whether the UI clearly presents the workflow and results, and whether the project can run locally with clear delivery instructions.

## Important Notes

- This is not merely a web scraping task, nor is it merely a UI presentation task.
- The core challenge is to identify problems from real user reviews and turn them into executable product requirements and test plans.
- Review data should not be collected by scraping only the visible content of the page. There are more appropriate ways to retrieve App Store review data; candidates are expected to explore them independently and explain their implementation.
- Requirements in the PRD must be traceable to specific user reviews.
- Test cases must be able to verify whether the corresponding requirements solve the problems raised in those reviews.
- If AI is used to generate analysis results, the original review evidence must be retained, and the submission should explain how hallucinations or inaccurate conclusions were avoided.
- If the amount of available data is limited or data collection is constrained, state this transparently in the results. Do not fabricate data.
