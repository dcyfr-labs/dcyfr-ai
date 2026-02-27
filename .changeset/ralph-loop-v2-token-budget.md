---
"@dcyfr/ai": minor
---

Ralph Loop V2: prompt rewriting, pattern learning, and token budget management

- Added `DelegationManager.rewritePrompt()` with four failure-aware strategies: `wrong_direction`, `missing_context`, `wrong_format`, and `stuck_on_complexity` — each queries the memory layer for relevant context before rewriting
- Added `DelegationManager.runWithRetry()` for automatic retry with exponential backoff, rewriting on each attempt; emits structured `RetryResult` with per-attempt logs and Telegram escalation on persistent failure
- Added `DelegationManager.learnPattern()` and `queryHighConfidencePattern()` for persistent prompt pattern storage; high-confidence patterns (5+ successes) are applied as shortcuts before full rewrite
- Added token budget management: `estimateTokens()`, `TokenBudgetInfo` interface, automatic trimming to 80% of the model context window, and verbatim preservation of the 3 most recent injected blocks
- Exported `TokenBudgetInfo`, `PromptPattern`, `PatternLearningOptions`, `RetryOptions`, `RetryAttempt`, `RetryResult`, `RewriteTask`, `RewriteResult`, `FailureAnalysis` from `@dcyfr/ai`
- 111 new tests across 5 test files covering all new delegation manager capabilities
