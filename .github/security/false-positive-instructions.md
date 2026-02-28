# DCYFR AI Framework False-Positive Filtering Instructions

<!-- TLP:AMBER -->
<!-- Referenced by .github/workflows/security-review.yml via false-positive-filtering-instructions -->
<!-- Plain English instructions telling Claude which findings to suppress or downgrade. -->

## Suppress These Categories Entirely

- **Environment variable presence checks**: Calls to `process.env.SOME_SECRET`
  or reading constructor arguments named `apiKey` are standard library
  patterns. Only report when an actual secret value is hardcoded in source.

- **"Consumer may pass untrusted input" warnings**: This is a TypeScript
  library. The library _cannot_ control what callers pass. Report injection
  risks only when the library itself performs an unsafe operation (exec, eval,
  SQL) on the value without documenting that the caller must sanitise first.

- **Missing authentication on exported functions**: Library functions do not
  authenticate callers — that is the consuming application's responsibility.
  Do not flag the absence of auth checks inside library utility functions.

- **Generic ReDoS on regex literals**: Only report ReDoS if the regex input
  comes from an untrusted external source at runtime. Regex patterns on
  static known-safe strings are not exploitable.

## Lower Severity (Report as Low / Informational Only)

- Test files (`*.test.ts`, `*.spec.ts`, `__tests__/`) — security issues in
  test infrastructure are noted but should not block PRs.
- Example scripts under `examples/` — demo code, not production.
- Benchmark scripts — performance code, not production logic.
- Generated type declaration files (`*.d.ts`) — not executable code.

## Always Report (Do Not Suppress Even If Matching Above)

- Any hardcoded API key, token, or credential string (even in test fixtures or
  comments intended to look like real tokens).
- Prototype pollution in any exported utility function that processes
  user-supplied objects (e.g., deep merge, object assign variants).
- `eval()`, `Function()`, or `new Function()` called with any non-static
  string — especially if the string comes from a library argument.
- Dynamic `require()` or `import()` where the module path is derived from
  a function argument or user input.
- Regular expressions with catastrophic backtracking on user-controlled input.
- Insecure defaults in exported configuration options (e.g., TLS validation
  disabled by default, unsafe deserialisation enabled by default).
- Supply chain risks: any `child_process` call in the published library code
  (not just test/build scripts).
