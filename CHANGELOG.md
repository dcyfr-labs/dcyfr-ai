# Changelog

## [3.5.3](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.5.2...v3.5.3) (2026-07-24)


### Bug Fixes

* **doc-parity:** unblock Doc Parity on release [#381](https://github.com/dcyfr-labs/dcyfr-ai/issues/381) (JSDoc reattach + npm-stat link timeout) ([0223efe](https://github.com/dcyfr-labs/dcyfr-ai/commit/0223efe390db275cb8b91844cb93e747f9b57245))


### Dependencies

* Bump the npm_and_yarn group across 1 directory with 2 updates ([#385](https://github.com/dcyfr-labs/dcyfr-ai/issues/385)) ([eed954e](https://github.com/dcyfr-labs/dcyfr-ai/commit/eed954ea66944e0314abe2f835ab4ce4e27745fb))

## [3.5.2](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.5.1...v3.5.2) (2026-07-22)


### Bug Fixes

* **mcp:** bind httpStream to loopback by default; report real host in banner ([24a4245](https://github.com/dcyfr-labs/dcyfr-ai/commit/24a4245d4f52afcd4a71cc818d4dc85dd368101a))
* **mcp:** loopback-default httpStream bind + accurate host banner ([7db0378](https://github.com/dcyfr-labs/dcyfr-ai/commit/7db037845e942cec85878962359b3acc00d4947b))
* **mcp:** sandbox design-tokens file reads to the project root ([#382](https://github.com/dcyfr-labs/dcyfr-ai/issues/382)) ([94275f8](https://github.com/dcyfr-labs/dcyfr-ai/commit/94275f8048c91d74d548903f6d6a22f4668cb0a3))

## [3.5.1](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.5.0...v3.5.1) (2026-07-21)


### Bug Fixes

* **release:** pin npm to ^11.5 in publish job (npm@latest→npm@12 broke publish) ([#379](https://github.com/dcyfr-labs/dcyfr-ai/issues/379)) ([8997b2c](https://github.com/dcyfr-labs/dcyfr-ai/commit/8997b2c032afeeecd95d77506da29d4782a38e7c))


### Dependencies

* bump cloudflare from 6.5.0 to 7.0.0 ([#358](https://github.com/dcyfr-labs/dcyfr-ai/issues/358)) ([69c8ad0](https://github.com/dcyfr-labs/dcyfr-ai/commit/69c8ad04e176254c56123ada040474fa36f938d5))

## [3.5.0](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.4.3...v3.5.0) (2026-07-21)


### Features

* add agent capability manifest interfaces for task delegation and execution ([46c8b0c](https://github.com/dcyfr-labs/dcyfr-ai/commit/46c8b0c132ff887301d2010edd74d6983484fa8b))
* add agent capability manifest types for intelligent task delegation ([c0b08a3](https://github.com/dcyfr-labs/dcyfr-ai/commit/c0b08a3316745951a8a3da53b00a7c2f868a4576))
* add benchmarking and integration tests for DelegationContractManager ([b37b1b4](https://github.com/dcyfr-labs/dcyfr-ai/commit/b37b1b436fc34d047b7bd0ff168c1051bb8be8f6))
* add bun &gt;= 1.1.0 to engines field ([1158336](https://github.com/dcyfr-labs/dcyfr-ai/commit/115833698cd43185eb7a423f20d50633515fd87d))
* add Liability Firebreak Enforcement Tests and Feature Flags Manager ([d499049](https://github.com/dcyfr-labs/dcyfr-ai/commit/d499049e78b8da6d415cbcbb4ef0b010e2284fc1))
* add SonarCloud analysis configuration and properties ([ca5941a](https://github.com/dcyfr-labs/dcyfr-ai/commit/ca5941ad52e17ac8b71ae28b6501aeff89918b2e))
* add support for execution modes in capability manifest and registry ([84ffe3b](https://github.com/dcyfr-labs/dcyfr-ai/commit/84ffe3b0a77e013eba3a744d809c86557eabc0d4))
* add telemetry schema and CLI dashboard for agent performance metrics ([f194846](https://github.com/dcyfr-labs/dcyfr-ai/commit/f194846fd37034f8490da1d0a9b88ea72b48ae89))
* add validation pipeline integration system with comprehensive testing and reporting ([6afed33](https://github.com/dcyfr-labs/dcyfr-ai/commit/6afed339094c378c159dc4e1b3e591b3ea3adcba))
* **agent-router:** update task context type and enhance global router initialization with dependencies ([20f5988](https://github.com/dcyfr-labs/dcyfr-ai/commit/20f598892fdf426dadc68e856e4238e89b0f978e))
* **agents:** add AgentPersona type system ([7fc763c](https://github.com/dcyfr-labs/dcyfr-ai/commit/7fc763cbbd3f41caf42ff4d63cd19c061306c417))
* **agents:** add comprehensive unit tests for persona system ([eb0dfcf](https://github.com/dcyfr-labs/dcyfr-ai/commit/eb0dfcf1274a085b10ffedade38003c72a157ec6))
* **capabilities:** expand capability database with new agent functions and optimizations ([e7e4244](https://github.com/dcyfr-labs/dcyfr-ai/commit/e7e424455c48143cad64200eb1a18f712eaaadd5))
* **ci:** add documentation-parity gates and fix stale VERSION export ([#277](https://github.com/dcyfr-labs/dcyfr-ai/issues/277)) ([1c21a08](https://github.com/dcyfr-labs/dcyfr-ai/commit/1c21a085a4dbfed435a1b827cbd3fbfa0b7bc8fb))
* **ci:** integrate 1Password secrets in workflows ([cec8048](https://github.com/dcyfr-labs/dcyfr-ai/commit/cec80481f6d07cf3991e8d2bcfc69abe8269c186))
* **container:** implement LocalDockerBackend, RemoteDockerBackend, and KubernetesBackend for container execution ([6517d46](https://github.com/dcyfr-labs/dcyfr-ai/commit/6517d462fe65bf10e09922dcbc2e61afefce0fed))
* **content-manager:** add ContentProvider interface and createContentManagerServer function ([655f3bf](https://github.com/dcyfr-labs/dcyfr-ai/commit/655f3bfce25420e0a8c6d7869038088363781760))
* **cowork:** Phase 4 - wire handoff_context to sessions ([28f2ed5](https://github.com/dcyfr-labs/dcyfr-ai/commit/28f2ed5009e32bdeb1e914fd9867caa78dbf191a))
* delegation framework improvements ([a0ca76d](https://github.com/dcyfr-labs/dcyfr-ai/commit/a0ca76d7565627097ea3d0f5d0454904dc1751b5))
* **delegation:** add barrel export index.ts for delegation module ([9dd93ba](https://github.com/dcyfr-labs/dcyfr-ai/commit/9dd93ba1efcefc142c08cf60ed49d7318a16fc30))
* **delegation:** add CapabilityManifestGenerator class wrapper ([81d385a](https://github.com/dcyfr-labs/dcyfr-ai/commit/81d385a7785b3d190a1caf9cfc369d962b68aaea))
* **delegation:** add plugin_security_enabled feature flag killswitch ([d0cf9be](https://github.com/dcyfr-labs/dcyfr-ai/commit/d0cf9be806287f4c2a9756347a2fff71998148a4))
* **delegation:** add runtime warning for missing executionMode (task 8.1) ([dae4c7b](https://github.com/dcyfr-labs/dcyfr-ai/commit/dae4c7b445c4c2e67905107d089d661c09980f23))
* **delegation:** add security threat model and TLP enforcement ([18590aa](https://github.com/dcyfr-labs/dcyfr-ai/commit/18590aa147cda32d60e44728317727fc3ffd9d96))
* **delegation:** enhance security validation and telemetry tracking in delegation contracts ([7d0d5fa](https://github.com/dcyfr-labs/dcyfr-ai/commit/7d0d5fa8ffeedb9f92fd46140062a944d48d6790))
* **delegation:** Phase 20 - Plugin delegation with security metadata, permission scopes, and reputation integration ([e1c2dfd](https://github.com/dcyfr-labs/dcyfr-ai/commit/e1c2dfd735c7bd8561ecedc01b0988a4e27039e4))
* **delegation:** Phases 1-2 backward-compatible execution modes ([83869bb](https://github.com/dcyfr-labs/dcyfr-ai/commit/83869bbf387cc783e13a292889979493821290c4))
* **delegation:** Phases 3-6 execution modes, MCP, tests ([133fa88](https://github.com/dcyfr-labs/dcyfr-ai/commit/133fa888cb1ddf601235a7ce4726a56f38d50836))
* **delegation:** Ralph Loop V2 — prompt rewriting, pattern learning, token budget ([8fe83c6](https://github.com/dcyfr-labs/dcyfr-ai/commit/8fe83c67e2552be3875897a674f6d8f802aa0d6d))
* **delegation:** tasks 10.2-10.4 — health monitoring exports + load tests ([2c2c640](https://github.com/dcyfr-labs/dcyfr-ai/commit/2c2c640139cbd823f58ea87b70aa44fd63ec9935))
* **delegation:** Tasks 4.1-4.5 session handoff protocol v3.0 ([14b25ee](https://github.com/dcyfr-labs/dcyfr-ai/commit/14b25ee5061c48ecd237c11a4784d2385e9387e1))
* **dependencies:** add axios as a dependency with version &gt;=1.13.5 ([96a1d28](https://github.com/dcyfr-labs/dcyfr-ai/commit/96a1d28b4f34bc8139bc91dbf981c304a17ff70e))
* **design-tokens:** add TokenProvider interface and createDesignTokenServer for design token validation ([b0d4da6](https://github.com/dcyfr-labs/dcyfr-ai/commit/b0d4da6ae6c32ed9c20d219acf1548653ca3fd9a))
* develop verification policy framework for delegation contracts ([c0b08a3](https://github.com/dcyfr-labs/dcyfr-ai/commit/c0b08a3316745951a8a3da53b00a7c2f868a4576))
* **doc-parity:** structural PROVIDER_ENV_KEYS manifest + config determinism guard (Wave 1 task 1.6) ([#316](https://github.com/dcyfr-labs/dcyfr-ai/issues/316)) ([ce342f7](https://github.com/dcyfr-labs/dcyfr-ai/commit/ce342f7376dfad99153beed0ea4ce8eb69e05645))
* **doc-parity:** Wave 1 — generated API reference + strict export-parity ([#313](https://github.com/dcyfr-labs/dcyfr-ai/issues/313)) ([6e855de](https://github.com/dcyfr-labs/dcyfr-ai/commit/6e855decc43ec10ccde2529ba61198326ae51bdd))
* **docs:** add initial wiki.json for project documentation ([f4a258e](https://github.com/dcyfr-labs/dcyfr-ai/commit/f4a258eaa0bfb65eff84c414224467ce2ddc4d99))
* Enhance capability registry and delegation integration ([159815d](https://github.com/dcyfr-labs/dcyfr-ai/commit/159815d3c9ec2bf1d978288d1f4ccf4c35fdf19b))
* Enhance capability registry and liability firebreak functionality ([e0b9899](https://github.com/dcyfr-labs/dcyfr-ai/commit/e0b98991325f5f561a81732d5fc189b0eda16a83))
* establish permission token types for hierarchical access control ([c0b08a3](https://github.com/dcyfr-labs/dcyfr-ai/commit/c0b08a3316745951a8a3da53b00a7c2f868a4576))
* implement AgentRuntime for multi-step task execution with LLM integration ([f9a715d](https://github.com/dcyfr-labs/dcyfr-ai/commit/f9a715dd628d126c250724230c36a1f3755112d2))
* implement Anti-Assumption Protocol framework types and threat detection ([2e8217f](https://github.com/dcyfr-labs/dcyfr-ai/commit/2e8217f31964c142688d20c4d31ac0151d07ebdb))
* implement delegation contract types for AI delegation framework ([c0b08a3](https://github.com/dcyfr-labs/dcyfr-ai/commit/c0b08a3316745951a8a3da53b00a7c2f868a4576))
* implement Liability Firebreak Enforcement for delegation framework ([69a2569](https://github.com/dcyfr-labs/dcyfr-ai/commit/69a256955b7f469e51f0265898e9f55052479702))
* **lint:** add ESLint v9 flat config for @dcyfr/ai ([7a41875](https://github.com/dcyfr-labs/dcyfr-ai/commit/7a4187574038b4803cb42202b5db30a6f12d456b))
* **mcp:** add bearer token auth to delegation-monitor write operations (task 4.7) ([1f50e17](https://github.com/dcyfr-labs/dcyfr-ai/commit/1f50e1755703a4aee1cc921d6ee31c6fb59a88f1))
* **mcp:** add MCP server configuration for various services and update exports in package.json ([2de26c2](https://github.com/dcyfr-labs/dcyfr-ai/commit/2de26c2ba5ad201a78562bfdc661857766354944))
* **mcp:** authenticated Streamable HTTP transport for FastMCP servers ([#222](https://github.com/dcyfr-labs/dcyfr-ai/issues/222)) ([60f3e99](https://github.com/dcyfr-labs/dcyfr-ai/commit/60f3e995659f2112f8e7378eae392ac7b4b1b8c6))
* **mcp:** export remote transport + bearer-auth helpers from the mcp barrel ([#377](https://github.com/dcyfr-labs/dcyfr-ai/issues/377)) ([989bd68](https://github.com/dcyfr-labs/dcyfr-ai/commit/989bd68fbeae0a97ba148719b664c4d6b741bb10))
* **memory:** add memory module exports and integration guide documentation ([60e4b65](https://github.com/dcyfr-labs/dcyfr-ai/commit/60e4b6531ac1fd48263b8147a2eedb2809d7ce50))
* **personas:** add TypeScript type definitions for brand voice and agent personas ([bd2e259](https://github.com/dcyfr-labs/dcyfr-ai/commit/bd2e259a18bf810770228ba54c7866f96fe832ce))
* **personas:** implement brand voice system Phase 2.2-2.6 ([ac468da](https://github.com/dcyfr-labs/dcyfr-ai/commit/ac468da7fa702b358619d04879d7b70784626eca))
* **plugins:** Phase 13 Incident Response SLA ([459121b](https://github.com/dcyfr-labs/dcyfr-ai/commit/459121bae2d5db401353304f7e75ee65c8cfedd3))
* **plugins:** Phase 15 gVisor Integration ([c121677](https://github.com/dcyfr-labs/dcyfr-ai/commit/c12167705f3cb79fa926111cfa762c2a61c084ad))
* **plugins:** Phase 16 Behavioral Anomaly Detection ([85b5beb](https://github.com/dcyfr-labs/dcyfr-ai/commit/85b5beb6ffe93915624312578eae090d67ead336))
* **plugins:** Phase 17 Plugin Certification Program ([262306e](https://github.com/dcyfr-labs/dcyfr-ai/commit/262306e03df795c3ee9b7f482b27a7b3a299048e))
* **plugins:** Phase 18 WebAssembly Runtime Support ([7350c47](https://github.com/dcyfr-labs/dcyfr-ai/commit/7350c47caa58003fa56a16c177576d192f942b65))
* **plugins:** Phases 7-10 plugin marketplace security (1019/1019 tests passing) ([14d1b22](https://github.com/dcyfr-labs/dcyfr-ai/commit/14d1b22e64a8d5ed55a43bdb2b0ac2f9ef6fc03e))
* **plugins:** Plugin marketplace security — anomaly detection, permissions, security scanning ([240b21e](https://github.com/dcyfr-labs/dcyfr-ai/commit/240b21ebbbc40257e5bfc40c61524efb992f9f4c))
* **provider:** add 'msty' as a new AI provider with configuration and update schemas ([799175c](https://github.com/dcyfr-labs/dcyfr-ai/commit/799175cf8b8ec25b0944ffaa646374a0bc594139))
* **providers:** add GitHub Models provider with GITHUB_TOKEN support ([a926b62](https://github.com/dcyfr-labs/dcyfr-ai/commit/a926b62a891dd2c57bf0a960f2aa24bb39a510a6))
* **release:** mint tokens via dcyfr-labs-release GitHub App ([#220](https://github.com/dcyfr-labs/dcyfr-ai/issues/220)) ([b667da3](https://github.com/dcyfr-labs/dcyfr-ai/commit/b667da3dff2234946ccfbe543e4c7ac69d137535))
* **reviews:** add PluginRatingAggregator and review system (Phase 12) ([8403732](https://github.com/dcyfr-labs/dcyfr-ai/commit/8403732c8b1181ce24e293b78c2cf8249694b90f))
* **runtime:** Autonomous Agent Runtime — memory, compaction, skills, MCP, sessions, scheduler, gateway ([79941ed](https://github.com/dcyfr-labs/dcyfr-ai/commit/79941ed911e3a8f10d6552d1d51dfa023f78306b))
* **security:** add Claude Code security review workflow ([62026b3](https://github.com/dcyfr-labs/dcyfr-ai/commit/62026b3e65ea1ba36c6365f31f4e18ab0b7a9c25))
* **security:** delegation-security-hardening — SecurityMiddlewareChain ([0756d77](https://github.com/dcyfr-labs/dcyfr-ai/commit/0756d775a5cae1d5d46a8f85da8d2f81ab0cd17f))
* **types:** generate collaboration package type scaffolds (111 types) ([15befdb](https://github.com/dcyfr-labs/dcyfr-ai/commit/15befdb577cbc55902ac9f110390fe06710edfc9))
* update dependencies and enhance memory configuration ([6c88c03](https://github.com/dcyfr-labs/dcyfr-ai/commit/6c88c03d28a8fb49c7896ad08fde762b9f394a6f))
* update Node.js version to 24.13.0 in CI workflows and improve error handling across multiple files ([700a5dd](https://github.com/dcyfr-labs/dcyfr-ai/commit/700a5dda73064e76393286cbff91939bea94c068))


### Bug Fixes

* add ignoreDeprecations 6.0 for TypeScript 6 compatibility ([a0c5bcb](https://github.com/dcyfr-labs/dcyfr-ai/commit/a0c5bcb104d2638de66c46831924cd19cff2ea45))
* **ci:** add --legacy-peer-deps to release workflow to handle mem0ai peer dependency conflict ([3a8653f](https://github.com/dcyfr-labs/dcyfr-ai/commit/3a8653f1500f6e834c5c1bf75a5b6d95f5464350))
* **ci:** fix sonarcloud 1Password step ordering - load secrets before validation ([c474aef](https://github.com/dcyfr-labs/dcyfr-ai/commit/c474aeff35d3aac2b3a0df6f212ff4d4da401ef8))
* **ci:** improve npm version check in release workflow ([b54c60e](https://github.com/dcyfr-labs/dcyfr-ai/commit/b54c60e4c1f7af9ed0f7d2774067879c8df3e125))
* **ci:** scope Linear integration test coverage to its source files ([#131](https://github.com/dcyfr-labs/dcyfr-ai/issues/131)) ([d72a61d](https://github.com/dcyfr-labs/dcyfr-ai/commit/d72a61d11231144cd307e32286dc8ddb4ba78f36))
* **cli:** repair published bin layout, fold telemetry into dcyfr-ai ([#256](https://github.com/dcyfr-labs/dcyfr-ai/issues/256)) ([166001e](https://github.com/dcyfr-labs/dcyfr-ai/commit/166001e28948a1eb149edb75028109790baae504))
* **compaction:** Use UTC methods for consistent date parsing in monthKey generation ([e7385f5](https://github.com/dcyfr-labs/dcyfr-ai/commit/e7385f5d6d929d4fdb3c5ff80b0d1aef074b236b))
* Delegation Framework Test Fixes - Integration Tests 100% ✅ ([b9bfc11](https://github.com/dcyfr-labs/dcyfr-ai/commit/b9bfc11159f82d6c0f3e44b411e36782ddfb1ea9))
* **delegation:** anchor default log dirs to package root, not a six-up walk ([#350](https://github.com/dcyfr-labs/dcyfr-ai/issues/350)) ([0603e24](https://github.com/dcyfr-labs/dcyfr-ai/commit/0603e24e37a151945da72f828ed7a6fb8bb6df61))
* **delegation:** major framework restoration - fixed 12 test failures, build system restored, 75% functional ([0975a2e](https://github.com/dcyfr-labs/dcyfr-ai/commit/0975a2e36e431c81ed915212727c26ca8775e532))
* **deps:** override uuid + postcss — close 3 moderates ([#129](https://github.com/dcyfr-labs/dcyfr-ai/issues/129)) ([fa2cdd0](https://github.com/dcyfr-labs/dcyfr-ai/commit/fa2cdd0d2bce260ffe6665281c51dff7311d833c))
* **doc-parity:** accept transient 408/5xx in link-check to absorb bundlephobia outages ([#320](https://github.com/dcyfr-labs/dcyfr-ai/issues/320)) ([090ae8c](https://github.com/dcyfr-labs/dcyfr-ai/commit/090ae8cefc68c9f5ae2057d10de8cf18708b6058))
* **doc-parity:** sync version.ts to 3.3.0 + complete gen-config escaping (CodeQL HIGH) ([#279](https://github.com/dcyfr-labs/dcyfr-ai/issues/279)) ([8935c3c](https://github.com/dcyfr-labs/dcyfr-ai/commit/8935c3c5d8b897bbc3f825a6f58be66785c7758d))
* **doc-parity:** widen release-managed VERSION const in generated API reference ([#319](https://github.com/dcyfr-labs/dcyfr-ai/issues/319)) ([df9ae79](https://github.com/dcyfr-labs/dcyfr-ai/commit/df9ae796d4063303b43fad94424c8cdf4cad62a2))
* **docker:** update healthcheck command for Qdrant service to use CMD-SHELL ([71c9077](https://github.com/dcyfr-labs/dcyfr-ai/commit/71c90775baac9a6e45551a7f92ba71b4eb07f5d6))
* **docs:** correct broken README links ([235a0c0](https://github.com/dcyfr-labs/dcyfr-ai/commit/235a0c0abc9714001b5485f6b7ade25c64a620c9))
* **docs:** correct SPONSORS.md and TRADEMARK.md paths again ([a5c02a1](https://github.com/dcyfr-labs/dcyfr-ai/commit/a5c02a1db9e5ca545498213dd3ddaddfb6b2981d))
* **docs:** strip trailing space in README Trademark line (MD009) ([#318](https://github.com/dcyfr-labs/dcyfr-ai/issues/318)) ([e03368e](https://github.com/dcyfr-labs/dcyfr-ai/commit/e03368e36fbd39a71b317a9b59b0028c32b3b2e6))
* **docs:** use asterisk emphasis on README:333 to satisfy MD049 ([#363](https://github.com/dcyfr-labs/dcyfr-ai/issues/363)) ([6a7ec9f](https://github.com/dcyfr-labs/dcyfr-ai/commit/6a7ec9ffe5aea68d946958830425c2194d5107a8))
* **examples:** make standalone-nextjs example build ([#299](https://github.com/dcyfr-labs/dcyfr-ai/issues/299)) ([c626242](https://github.com/dcyfr-labs/dcyfr-ai/commit/c6262429cf2e5338a3ca31478a98d813966d7b6f))
* **lint:** eliminate all ESLint warnings in @dcyfr/ai (577 to 0) ([768e86a](https://github.com/dcyfr-labs/dcyfr-ai/commit/768e86a498536e030fe8004a273254868cb8efb2))
* **msty-sidecar:** Simplify configuration by removing headers from sidecar settings ([c3c0e68](https://github.com/dcyfr-labs/dcyfr-ai/commit/c3c0e683239d6ffe42f5ed79c1cefbbed98f2351))
* **permissions:** de-bomb attenuation-engine expiration tests ([#341](https://github.com/dcyfr-labs/dcyfr-ai/issues/341)) ([ee2cbf4](https://github.com/dcyfr-labs/dcyfr-ai/commit/ee2cbf4dbd476bfe15b343e52d9e128c08468df0))
* **plugins:** Update api-client test fixture to realistic Stripe key for gitleaks detection ([960cca7](https://github.com/dcyfr-labs/dcyfr-ai/commit/960cca75850df0d54be2b3da03849d35142bed6b))
* **plugins:** WASM runner error handling + secret detector fallback ([caeb224](https://github.com/dcyfr-labs/dcyfr-ai/commit/caeb2240decb1c6c9d488b0ca4250470c1f6d51f))
* **quality:** S3735 S4123 S3516 — SonarCloud batch fixes ([5fbe83b](https://github.com/dcyfr-labs/dcyfr-ai/commit/5fbe83b20dfc91e70c630748dc6ea9c2d9337915))
* **quality:** S3776 reduce cognitive complexity - Batch 1 (critical complexity) ([80a169e](https://github.com/dcyfr-labs/dcyfr-ai/commit/80a169e7dbb7ef5fa22fd6df13f87a7a7aff4d9f))
* **quality:** S3776 reduce cognitive complexity - Batch 1 dcyfr-ai ([a3e7ff6](https://github.com/dcyfr-labs/dcyfr-ai/commit/a3e7ff6130fe07c3a225fad710c82c0f53080322))
* **quality:** S3776 reduce cognitive complexity - Batch 2 ([fc5376c](https://github.com/dcyfr-labs/dcyfr-ai/commit/fc5376cb8ee79e43e9a0c17bffe4db162dddfb90))
* **quality:** S3776 reduce cognitive complexity - Batch 2 dcyfr-ai ([e94312e](https://github.com/dcyfr-labs/dcyfr-ai/commit/e94312e65c093060afee75b2d1ebc29fc0e3c236))
* **quality:** S3776 reduce cognitive complexity - Batch 3 dcyfr-ai ([7648f9b](https://github.com/dcyfr-labs/dcyfr-ai/commit/7648f9b9d2e2f9cc6053c740ef61d675958ebc4b))
* **quality:** S3776 reduce cognitive complexity - Batch 4 dcyfr-ai ([e1e119d](https://github.com/dcyfr-labs/dcyfr-ai/commit/e1e119d784a50c8729a2e43bc15757c07745a4ff))
* **quality:** S3776 reduce cognitive complexity - Batch 5 dcyfr-ai ([0c83d2e](https://github.com/dcyfr-labs/dcyfr-ai/commit/0c83d2ed06f10f27324b43d8b67495feefd41786))
* **quality:** S3776 reduce cognitive complexity - Batch 6 dcyfr-ai ([d95d5a4](https://github.com/dcyfr-labs/dcyfr-ai/commit/d95d5a42d2e4136419b70a67578ddd525074c2ea))
* **quality:** S3776 reduce cognitive complexity - Batch 7 dcyfr-ai ([872d0c0](https://github.com/dcyfr-labs/dcyfr-ai/commit/872d0c0fe6d54c26647e30b4014a6579184a1fdc))
* **quality:** S3776 reduce cognitive complexity - remaining violations in agent-runtime, agent-loader, agent-registry, contract-manager ([4453470](https://github.com/dcyfr-labs/dcyfr-ai/commit/4453470793807182453effc006248c2c01562870))
* **quality:** S3776 reduce cognitive complexity in telemetry-report.js ([51734cc](https://github.com/dcyfr-labs/dcyfr-ai/commit/51734cc8db4d9d8db954e43819c0cbe7a2bc84cc))
* **quality:** S4123 S3735 TypeScript type safety - remove unsafe type assertions ([75e5f41](https://github.com/dcyfr-labs/dcyfr-ai/commit/75e5f41d99abbb6cf0a039c074930aa9632fc247))
* **release:** align release-please tag format with existing v* tags ([#177](https://github.com/dcyfr-labs/dcyfr-ai/issues/177)) ([b373114](https://github.com/dcyfr-labs/dcyfr-ai/commit/b3731141900425606b7646d72cd8a93e0421f354))
* **release:** use PAT with workflow scope for release-please ([#217](https://github.com/dcyfr-labs/dcyfr-ai/issues/217)) ([52da39f](https://github.com/dcyfr-labs/dcyfr-ai/commit/52da39f2b46a4ab0c421b568cfaca749fe13b822))
* remove .env.ci from tracked templates in .gitignore ([0b2f382](https://github.com/dcyfr-labs/dcyfr-ai/commit/0b2f38291018136ee1f4ab21ac1a53623d8db0e4))
* remove workspace-specific export that broke production builds ([8040ac1](https://github.com/dcyfr-labs/dcyfr-ai/commit/8040ac147e845cd076e3f8d91b85111d1393d248))
* resolve 8 SonarCloud new-code reliability bugs ([#270](https://github.com/dcyfr-labs/dcyfr-ai/issues/270)) ([8608ba4](https://github.com/dcyfr-labs/dcyfr-ai/commit/8608ba44091117663cd9b0f83ee2d5712b09834d))
* **security/quality:** clear 2 CodeQL errors + 3 quality warnings ([#157](https://github.com/dcyfr-labs/dcyfr-ai/issues/157)) ([6b4f433](https://github.com/dcyfr-labs/dcyfr-ai/commit/6b4f4336398fd1065cbbb00abf384021d422953b))
* **security:** atomic file writes — close 10 production CodeQL findings ([#149](https://github.com/dcyfr-labs/dcyfr-ai/issues/149)) ([4d36898](https://github.com/dcyfr-labs/dcyfr-ai/commit/4d3689838f2924869b1a20599815a4f1dcd0560d))
* **security:** bump brace-expansion to &gt;=5.0.6 via npm override (GHSA-jxxr-4gwj-5jf2) ([#337](https://github.com/dcyfr-labs/dcyfr-ai/issues/337)) ([3eca26b](https://github.com/dcyfr-labs/dcyfr-ai/commit/3eca26b4e9b656dc14ca035c088c4bbd32005746))
* **security:** bump express-rate-limit 8.2.1→8.2.2 (CVE-2026-30827) ([#8](https://github.com/dcyfr-labs/dcyfr-ai/issues/8)) ([e4ca3db](https://github.com/dcyfr-labs/dcyfr-ai/commit/e4ca3dbee313d1ae875feef77e494cfdab77e065))
* **security:** bump postcss + uuid in standalone-nextjs example ([#132](https://github.com/dcyfr-labs/dcyfr-ai/issues/132)) ([1dbe26e](https://github.com/dcyfr-labs/dcyfr-ai/commit/1dbe26efbb84cf4d25c523d98cc230a69dabd328))
* **security:** bump standalone-nextjs example undici override to ^7.28.0 ([#297](https://github.com/dcyfr-labs/dcyfr-ai/issues/297)) ([66572bd](https://github.com/dcyfr-labs/dcyfr-ai/commit/66572bdc49da165d44d2a7e921615d907b84a301))
* **security:** bump transitive CVEs to patched versions ([#292](https://github.com/dcyfr-labs/dcyfr-ai/issues/292)) ([84f8a43](https://github.com/dcyfr-labs/dcyfr-ai/commit/84f8a43d77921d23451d9bb702b72fb3ed306b4d))
* **security:** clear 9 high axios+fast-uri advisories ([#156](https://github.com/dcyfr-labs/dcyfr-ai/issues/156)) ([9e6f088](https://github.com/dcyfr-labs/dcyfr-ai/commit/9e6f0885cfd2e2316e12a1656b78d41aa12ddc16))
* **security:** clear undici HIGH+MEDIUM CVE on main before 3.3.2 ([#296](https://github.com/dcyfr-labs/dcyfr-ai/issues/296)) ([4991c68](https://github.com/dcyfr-labs/dcyfr-ai/commit/4991c684b4cebbabcff2b408624d2db6d7b33df5))
* **security:** close 3 CodeQL findings (insecure-randomness ×2, bad-tag-filter ×1) ([#148](https://github.com/dcyfr-labs/dcyfr-ai/issues/148)) ([1264afe](https://github.com/dcyfr-labs/dcyfr-ai/commit/1264afe6c60050856332413d68cffa9b1d9ec710))
* **security:** close 7 CodeQL regex/sanitization/pollution findings ([#150](https://github.com/dcyfr-labs/dcyfr-ai/issues/150)) ([4194e69](https://github.com/dcyfr-labs/dcyfr-ai/commit/4194e69e5dc44f12c8bff8b2ec5e63b9d2986515))
* **security:** floor transitive undici@6.x (qdrant) to &gt;=6.27.0 ([#311](https://github.com/dcyfr-labs/dcyfr-ai/issues/311)) ([80e849b](https://github.com/dcyfr-labs/dcyfr-ai/commit/80e849b0f59c2cdc03f09311db94b5ec44b2c963))
* **security:** move GHA permissions to job level, fix S7630 script injection (SonarCloud S8264/S7630) ([2ca3ae7](https://github.com/dcyfr-labs/dcyfr-ai/commit/2ca3ae7bceb47510c85314d475c05b072e3b95b2))
* **security:** reduce cognitive complexity (S3776) across AI modules ([0519af3](https://github.com/dcyfr-labs/dcyfr-ai/commit/0519af3d443c7c956ac9efd1419e8e4ba29fe79a))
* **security:** remove invalid secrets context from job-level if condition ([2ee7704](https://github.com/dcyfr-labs/dcyfr-ai/commit/2ee77041a5aba0a998bd3f3c5fd465e3854e932d))
* **security:** S2871 add explicit compare function to .sort() calls ([656193a](https://github.com/dcyfr-labs/dcyfr-ai/commit/656193ac1fe751752113baef36699ab516581905))
* **security:** S4123 remove await from synchronous registry and cache method calls ([9ceb272](https://github.com/dcyfr-labs/dcyfr-ai/commit/9ceb27215306df747d99e7fa4bb4354179c05250))
* **security:** S7688 use [[ instead of [ for bash conditionals in shell scripts ([dbf25b6](https://github.com/dcyfr-labs/dcyfr-ai/commit/dbf25b687b64924ae40fbf26fafb8892f3d352db))
* **security:** strengthen prototype-pollution sanitizer in config loader ([#178](https://github.com/dcyfr-labs/dcyfr-ai/issues/178)) ([e0f5c22](https://github.com/dcyfr-labs/dcyfr-ai/commit/e0f5c22607dd77dab5409002832d397c3d5f3f4a))
* **telemetry:** populate repo/node envelope fields ([5ba1653](https://github.com/dcyfr-labs/dcyfr-ai/commit/5ba1653586d86aaceec5f2a0352e0f131d140dd2))
* **test:** align test fixtures with current 4-tier provider architecture ([#130](https://github.com/dcyfr-labs/dcyfr-ai/issues/130)) ([56532ce](https://github.com/dcyfr-labs/dcyfr-ai/commit/56532ce134876b0d7267b372a1be0d8f2f63d459))
* **tests:** resolve delegation framework test failures ([e307346](https://github.com/dcyfr-labs/dcyfr-ai/commit/e307346f9719463ff76b4d47bf3a5a2ea0a4c871))
* **types:** resolve TypeScript compilation errors in delegation-monitor, agent-router, and security-threat-model ([f4aaba0](https://github.com/dcyfr-labs/dcyfr-ai/commit/f4aaba0a35bec8742deb64b59d4332e22acf05a3))
* **types:** z.record requires 2 args in zod v4 ([20d1fbf](https://github.com/dcyfr-labs/dcyfr-ai/commit/20d1fbf4b2d5bce05bde8683b0dfeda1a7d3b5fa))
* update 1Password references for OPENAI_API_KEY and SONAR_TOKEN ([022aa02](https://github.com/dcyfr-labs/dcyfr-ai/commit/022aa028035ddd4cec2e8f0d25a818696c4b0301))
* update node engine requirement to &gt;=20.0.0 ([6e345b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/6e345b72437d1fc14cbf39d5dfc448fcbc53f84f))
* **wasm:** add WebAssembly type declarations for Node.js environments ([e6cbef0](https://github.com/dcyfr-labs/dcyfr-ai/commit/e6cbef06b29411bde2e2aa251b55b88147608332))


### Dependencies

* batch runtime bumps (anthropic, google/genai, langchain, inquirer) ([#215](https://github.com/dcyfr-labs/dcyfr-ai/issues/215)) ([05218b4](https://github.com/dcyfr-labs/dcyfr-ai/commit/05218b47c84b675ad17a59818c44a40e513850e3))
* batch toolchain bumps (typescript-eslint, vitest coverage) ([#214](https://github.com/dcyfr-labs/dcyfr-ai/issues/214)) ([42d9818](https://github.com/dcyfr-labs/dcyfr-ai/commit/42d981829fbc52da59d411cedeb6b461aee83db3))
* bump @anthropic-ai/sdk from 0.102.0 to 0.104.1 ([#263](https://github.com/dcyfr-labs/dcyfr-ai/issues/263)) ([251ffd6](https://github.com/dcyfr-labs/dcyfr-ai/commit/251ffd64a069e698388f434daed058eb839bdd92))
* bump @anthropic-ai/sdk from 0.104.1 to 0.106.0 ([#325](https://github.com/dcyfr-labs/dcyfr-ai/issues/325)) ([c6fe083](https://github.com/dcyfr-labs/dcyfr-ai/commit/c6fe0833eff80ef8fa03840f88ab9b4489b18fd1))
* bump @anthropic-ai/sdk from 0.106.0 to 0.110.0 ([#345](https://github.com/dcyfr-labs/dcyfr-ai/issues/345)) ([31a5b55](https://github.com/dcyfr-labs/dcyfr-ai/commit/31a5b55f40f0ea629f071681f2f7829580bcaaaf))
* bump @anthropic-ai/sdk from 0.110.0 to 0.111.0 ([#353](https://github.com/dcyfr-labs/dcyfr-ai/issues/353)) ([7a9c93f](https://github.com/dcyfr-labs/dcyfr-ai/commit/7a9c93f01863c1eaca1c4ee99069e339fe75f8a8))
* bump @anthropic-ai/sdk from 0.111.0 to 0.112.3 ([#370](https://github.com/dcyfr-labs/dcyfr-ai/issues/370)) ([d568846](https://github.com/dcyfr-labs/dcyfr-ai/commit/d568846da30b986c3ce16246419b2578c24d7293))
* bump @anthropic-ai/sdk from 0.74.0 to 0.80.0 ([#53](https://github.com/dcyfr-labs/dcyfr-ai/issues/53)) ([a1f6d35](https://github.com/dcyfr-labs/dcyfr-ai/commit/a1f6d355df9c520b16a3b41b3f60bbb88415eacd))
* bump @anthropic-ai/sdk from 0.80.0 to 0.82.0 ([#71](https://github.com/dcyfr-labs/dcyfr-ai/issues/71)) ([0922c28](https://github.com/dcyfr-labs/dcyfr-ai/commit/0922c28d40132f5c4df37aed34c9a204936e83bb))
* bump @anthropic-ai/sdk from 0.82.0 to 0.88.0 ([#88](https://github.com/dcyfr-labs/dcyfr-ai/issues/88)) ([64cbbbd](https://github.com/dcyfr-labs/dcyfr-ai/commit/64cbbbdef159d1cc2b8c08ceb804a189940a712d))
* bump @anthropic-ai/sdk from 0.82.0 to 0.89.0 ([#99](https://github.com/dcyfr-labs/dcyfr-ai/issues/99)) ([2298130](https://github.com/dcyfr-labs/dcyfr-ai/commit/22981306a40f864c034c2af5de254cfcfa857368))
* bump @anthropic-ai/sdk from 0.89.0 to 0.90.0 ([#114](https://github.com/dcyfr-labs/dcyfr-ai/issues/114)) ([41bd440](https://github.com/dcyfr-labs/dcyfr-ai/commit/41bd440373da62dda716fbef084d8f048df41ffc))
* bump @anthropic-ai/sdk from 0.90.0 to 0.91.1 ([#127](https://github.com/dcyfr-labs/dcyfr-ai/issues/127)) ([c6c3d93](https://github.com/dcyfr-labs/dcyfr-ai/commit/c6c3d938c1a3020dcd423bcbe7a564a79c5c2fd9))
* bump @anthropic-ai/sdk from 0.91.1 to 0.92.0 ([#147](https://github.com/dcyfr-labs/dcyfr-ai/issues/147)) ([b63016d](https://github.com/dcyfr-labs/dcyfr-ai/commit/b63016de1632e1446458629ebfb5b061d58bf5e2))
* bump @anthropic-ai/sdk from 0.92.0 to 0.95.1 ([#159](https://github.com/dcyfr-labs/dcyfr-ai/issues/159)) ([9e90188](https://github.com/dcyfr-labs/dcyfr-ai/commit/9e901889b3724071e1a835644cc2465cf7f62546))
* bump @anthropic-ai/sdk from 0.98.0 to 0.102.0 ([#251](https://github.com/dcyfr-labs/dcyfr-ai/issues/251)) ([973cbfb](https://github.com/dcyfr-labs/dcyfr-ai/commit/973cbfb2a52c80d48af04fd8534f3e96cfdb3753))
* bump @azure/identity from 4.13.0 to 4.13.1 ([#44](https://github.com/dcyfr-labs/dcyfr-ai/issues/44)) ([afceddf](https://github.com/dcyfr-labs/dcyfr-ai/commit/afceddffb05f2189f49d9d6360fbaaddd6c0a8b7))
* bump @azure/search-documents from 12.2.0 to 13.0.0 ([#161](https://github.com/dcyfr-labs/dcyfr-ai/issues/161)) ([9d863e3](https://github.com/dcyfr-labs/dcyfr-ai/commit/9d863e36e36b2947e95b2fafb5ba1bbce738793f))
* bump @changesets/changelog-github from 0.5.2 to 0.7.0 ([#167](https://github.com/dcyfr-labs/dcyfr-ai/issues/167)) ([0df6b96](https://github.com/dcyfr-labs/dcyfr-ai/commit/0df6b966e66f6a320728a9bde813f6861ad684d9))
* bump @changesets/cli from 2.30.0 to 2.31.0 ([#120](https://github.com/dcyfr-labs/dcyfr-ai/issues/120)) ([fd5331a](https://github.com/dcyfr-labs/dcyfr-ai/commit/fd5331ac17ad245b10efffb0ab99c77ce9390c9b))
* bump @google/genai from 1.45.0 to 1.46.0 ([#45](https://github.com/dcyfr-labs/dcyfr-ai/issues/45)) ([6217ed0](https://github.com/dcyfr-labs/dcyfr-ai/commit/6217ed0ce92e191912f527585e99b5e9784b3267))
* bump @google/genai from 1.47.0 to 1.48.0 ([#69](https://github.com/dcyfr-labs/dcyfr-ai/issues/69)) ([dfa36f9](https://github.com/dcyfr-labs/dcyfr-ai/commit/dfa36f9d9ac0d80b79f38951d8c670dd45587ea7))
* bump @google/genai from 1.48.0 to 1.50.1 ([#97](https://github.com/dcyfr-labs/dcyfr-ai/issues/97)) ([bdcb1e2](https://github.com/dcyfr-labs/dcyfr-ai/commit/bdcb1e2d739d170fe0e4588e4142dd7dfed555ee))
* bump @google/genai from 1.50.1 to 2.0.1 ([#164](https://github.com/dcyfr-labs/dcyfr-ai/issues/164)) ([4c9a741](https://github.com/dcyfr-labs/dcyfr-ai/commit/4c9a74181ef80e32072452bf63e3aba2bd851077))
* bump @google/genai from 2.0.1 to 2.4.0 ([#184](https://github.com/dcyfr-labs/dcyfr-ai/issues/184)) ([9492635](https://github.com/dcyfr-labs/dcyfr-ai/commit/9492635a20f653b79bfeaa936f89dea7a5b055fb))
* bump @google/genai from 2.10.0 to 2.11.0 ([#355](https://github.com/dcyfr-labs/dcyfr-ai/issues/355)) ([da2c421](https://github.com/dcyfr-labs/dcyfr-ai/commit/da2c421e52fe76690659cb7f8e15132193a93408))
* bump @google/genai from 2.11.0 to 2.12.0 ([#365](https://github.com/dcyfr-labs/dcyfr-ai/issues/365)) ([1890c93](https://github.com/dcyfr-labs/dcyfr-ai/commit/1890c939f962579fed5e0ef7171e50d4265efcbc))
* bump @google/genai from 2.6.0 to 2.7.0 ([#239](https://github.com/dcyfr-labs/dcyfr-ai/issues/239)) ([07049bf](https://github.com/dcyfr-labs/dcyfr-ai/commit/07049bf7d726c44081406fac1ef5ef63aedc2fa8))
* bump @google/genai from 2.7.0 to 2.8.0 ([#247](https://github.com/dcyfr-labs/dcyfr-ai/issues/247)) ([fa36a9f](https://github.com/dcyfr-labs/dcyfr-ai/commit/fa36a9f00d0cb9e957e8b8fcc6732730f3bff3aa))
* bump @google/genai from 2.8.0 to 2.9.0 ([#309](https://github.com/dcyfr-labs/dcyfr-ai/issues/309)) ([95e4b04](https://github.com/dcyfr-labs/dcyfr-ai/commit/95e4b04b38b6e5555e44795eb7047d30a3070240))
* bump @google/genai from 2.9.0 to 2.10.0 ([#327](https://github.com/dcyfr-labs/dcyfr-ai/issues/327)) ([f2d8fa3](https://github.com/dcyfr-labs/dcyfr-ai/commit/f2d8fa33d1401880177dfa0c42da7b9904e3a6fb))
* bump @langchain/core from 1.1.32 to 1.1.35 ([#51](https://github.com/dcyfr-labs/dcyfr-ai/issues/51)) ([b87377e](https://github.com/dcyfr-labs/dcyfr-ai/commit/b87377eb26bbfd9fbff0221d9210cfe320b7664d))
* bump @langchain/core from 1.1.35 to 1.1.36 ([#59](https://github.com/dcyfr-labs/dcyfr-ai/issues/59)) ([279fe21](https://github.com/dcyfr-labs/dcyfr-ai/commit/279fe218d2e679730048f2bc54f5e95b26120108))
* bump @langchain/core from 1.1.38 to 1.1.39 ([#75](https://github.com/dcyfr-labs/dcyfr-ai/issues/75)) ([73bfdb8](https://github.com/dcyfr-labs/dcyfr-ai/commit/73bfdb854951c172a993ff5409772f58a83ca65c))
* bump @langchain/core from 1.1.39 to 1.1.40 ([#113](https://github.com/dcyfr-labs/dcyfr-ai/issues/113)) ([74011e3](https://github.com/dcyfr-labs/dcyfr-ai/commit/74011e36f479c20268e7a6b85772db618bdec784))
* bump @langchain/core from 1.1.40 to 1.1.41 ([#125](https://github.com/dcyfr-labs/dcyfr-ai/issues/125)) ([d300029](https://github.com/dcyfr-labs/dcyfr-ai/commit/d30002928d6e66887e232ca6d5c0fc8a08c4d347))
* bump @langchain/core from 1.1.41 to 1.1.44 ([#144](https://github.com/dcyfr-labs/dcyfr-ai/issues/144)) ([fd98a8d](https://github.com/dcyfr-labs/dcyfr-ai/commit/fd98a8d96e36ff3f591a87a71f81345453cce21f))
* bump @langchain/core from 1.1.44 to 1.1.45 ([#165](https://github.com/dcyfr-labs/dcyfr-ai/issues/165)) ([8ebee9d](https://github.com/dcyfr-labs/dcyfr-ai/commit/8ebee9d76f7fd02c4b97717b6e33d0f0364fe116))
* bump @langchain/core from 1.1.45 to 1.1.46 ([#191](https://github.com/dcyfr-labs/dcyfr-ai/issues/191)) ([f2940d0](https://github.com/dcyfr-labs/dcyfr-ai/commit/f2940d0ed96f5696d55a60e3a834ed4e8db3bc65))
* bump @langchain/core from 1.1.48 to 1.1.49 ([#287](https://github.com/dcyfr-labs/dcyfr-ai/issues/287)) ([ae18739](https://github.com/dcyfr-labs/dcyfr-ai/commit/ae18739a1f15d26a6f7f7cd2db9e943ea95d6082))
* bump @langchain/core from 1.1.49 to 1.2.1 ([#336](https://github.com/dcyfr-labs/dcyfr-ai/issues/336)) ([7247ce8](https://github.com/dcyfr-labs/dcyfr-ai/commit/7247ce802fe711c998c311e86ef40a8b5ff6fccb))
* bump @langchain/core from 1.2.1 to 1.2.3 ([#368](https://github.com/dcyfr-labs/dcyfr-ai/issues/368)) ([02f0f2f](https://github.com/dcyfr-labs/dcyfr-ai/commit/02f0f2fdf6953ff35139bfe169bcb90bd8e96519))
* bump @mistralai/mistralai from 1.15.1 to 2.1.1 ([#47](https://github.com/dcyfr-labs/dcyfr-ai/issues/47)) ([bdd6705](https://github.com/dcyfr-labs/dcyfr-ai/commit/bdd6705399f82b49190cac52fd898308f2e4392f))
* bump @mistralai/mistralai from 2.1.2 to 2.2.0 ([#107](https://github.com/dcyfr-labs/dcyfr-ai/issues/107)) ([c77eaf1](https://github.com/dcyfr-labs/dcyfr-ai/commit/c77eaf17764a345b56212089cd24b320b3a17823))
* bump @mistralai/mistralai from 2.2.0 to 2.2.1 ([#119](https://github.com/dcyfr-labs/dcyfr-ai/issues/119)) ([0cf7722](https://github.com/dcyfr-labs/dcyfr-ai/commit/0cf77228a22c8466f8e8048715f95ea7305b3e94))
* bump @protobufjs/utf8 in the npm_and_yarn group across 1 directory ([#180](https://github.com/dcyfr-labs/dcyfr-ai/issues/180)) ([f3c4094](https://github.com/dcyfr-labs/dcyfr-ai/commit/f3c4094cb50c9510bd500fbdfeb03d1a0a8904f9))
* bump @qdrant/js-client-rest from 1.17.0 to 1.18.0 ([#186](https://github.com/dcyfr-labs/dcyfr-ai/issues/186)) ([54245c5](https://github.com/dcyfr-labs/dcyfr-ai/commit/54245c5a688a6b5e9716833b21a6911a9810f7f6))
* bump @supabase/supabase-js from 2.101.0 to 2.101.1 ([#73](https://github.com/dcyfr-labs/dcyfr-ai/issues/73)) ([5109e00](https://github.com/dcyfr-labs/dcyfr-ai/commit/5109e0042a4aa4271f1408611882c0d1cf0dab0d))
* bump @supabase/supabase-js from 2.101.1 to 2.103.3 ([#115](https://github.com/dcyfr-labs/dcyfr-ai/issues/115)) ([fd3d611](https://github.com/dcyfr-labs/dcyfr-ai/commit/fd3d611706d8b210fc4f92e976475150a40a8de8))
* bump @supabase/supabase-js from 2.103.3 to 2.104.1 ([#121](https://github.com/dcyfr-labs/dcyfr-ai/issues/121)) ([1892ec8](https://github.com/dcyfr-labs/dcyfr-ai/commit/1892ec85356de229172e8fd2402f3dda894ff6a7))
* bump @supabase/supabase-js from 2.104.1 to 2.105.1 ([#142](https://github.com/dcyfr-labs/dcyfr-ai/issues/142)) ([026c391](https://github.com/dcyfr-labs/dcyfr-ai/commit/026c391613d77503e9aa1b74af66d52fd0633282))
* bump @supabase/supabase-js from 2.105.1 to 2.105.4 ([#169](https://github.com/dcyfr-labs/dcyfr-ai/issues/169)) ([02e0f5d](https://github.com/dcyfr-labs/dcyfr-ai/commit/02e0f5dd8e756fa0d9e9303b9d23dadaecdddf30))
* bump @supabase/supabase-js from 2.105.4 to 2.106.1 ([#205](https://github.com/dcyfr-labs/dcyfr-ai/issues/205)) ([d09fefb](https://github.com/dcyfr-labs/dcyfr-ai/commit/d09fefb8f31ed5b68372f624aea20dfde486d65e))
* bump @supabase/supabase-js from 2.106.1 to 2.106.2 ([#232](https://github.com/dcyfr-labs/dcyfr-ai/issues/232)) ([43d3039](https://github.com/dcyfr-labs/dcyfr-ai/commit/43d303902894f8c72134fd62d9bccc5bea90d4d6))
* bump @supabase/supabase-js from 2.106.2 to 2.107.0 ([#249](https://github.com/dcyfr-labs/dcyfr-ai/issues/249)) ([577597a](https://github.com/dcyfr-labs/dcyfr-ai/commit/577597ae52f2e45d26b2ca2c9a1979d1fc4b02bb))
* bump @supabase/supabase-js from 2.107.0 to 2.108.1 ([#264](https://github.com/dcyfr-labs/dcyfr-ai/issues/264)) ([e806aa1](https://github.com/dcyfr-labs/dcyfr-ai/commit/e806aa1ed2979988256a03ee933f118c40b589b5))
* bump @supabase/supabase-js from 2.108.1 to 2.108.2 ([#307](https://github.com/dcyfr-labs/dcyfr-ai/issues/307)) ([e0c95b1](https://github.com/dcyfr-labs/dcyfr-ai/commit/e0c95b103975353569b3f358c194d52b897f161e))
* bump @supabase/supabase-js from 2.108.2 to 2.110.0 ([#347](https://github.com/dcyfr-labs/dcyfr-ai/issues/347)) ([e8be9de](https://github.com/dcyfr-labs/dcyfr-ai/commit/e8be9de57b4f42124366f6686263bb4194a41256))
* bump @supabase/supabase-js from 2.110.0 to 2.110.2 ([#357](https://github.com/dcyfr-labs/dcyfr-ai/issues/357)) ([80e82ae](https://github.com/dcyfr-labs/dcyfr-ai/commit/80e82ae852c0bf25d4d0c9c329841924ee368d54))
* bump @supabase/supabase-js from 2.110.2 to 2.110.7 ([#366](https://github.com/dcyfr-labs/dcyfr-ai/issues/366)) ([628c257](https://github.com/dcyfr-labs/dcyfr-ai/commit/628c257ff1bd3a94ec79d8cb62e8636ab5078f03))
* bump @supabase/supabase-js from 2.99.1 to 2.99.3 ([#49](https://github.com/dcyfr-labs/dcyfr-ai/issues/49)) ([7c57058](https://github.com/dcyfr-labs/dcyfr-ai/commit/7c570582c9f660fe9621afaa4e22fe8a2aae491f))
* bump @supabase/supabase-js from 2.99.3 to 2.100.1 ([#64](https://github.com/dcyfr-labs/dcyfr-ai/issues/64)) ([7e9f12f](https://github.com/dcyfr-labs/dcyfr-ai/commit/7e9f12fc23f24c48e3f4265a867333e32384533d))
* bump @types/glob from 8.1.0 to 9.0.0 ([#10](https://github.com/dcyfr-labs/dcyfr-ai/issues/10)) ([730a59d](https://github.com/dcyfr-labs/dcyfr-ai/commit/730a59df799c74ad56ccd5471b6fbdfb2375c45f))
* bump @types/node from 22.19.13 to 25.5.0 ([#27](https://github.com/dcyfr-labs/dcyfr-ai/issues/27)) ([65839a6](https://github.com/dcyfr-labs/dcyfr-ai/commit/65839a6478475ef87077003214d93d4c3a57f721))
* bump @types/node from 25.5.0 to 25.5.2 ([#68](https://github.com/dcyfr-labs/dcyfr-ai/issues/68)) ([db62f75](https://github.com/dcyfr-labs/dcyfr-ai/commit/db62f758167905188ef135f42160006b92634433))
* bump @types/node from 25.5.2 to 25.6.0 ([#86](https://github.com/dcyfr-labs/dcyfr-ai/issues/86)) ([b117fe9](https://github.com/dcyfr-labs/dcyfr-ai/commit/b117fe9fbef500c648b48f4fed97156264dceb67))
* bump @types/node from 25.6.0 to 25.6.2 ([#166](https://github.com/dcyfr-labs/dcyfr-ai/issues/166)) ([4a89eca](https://github.com/dcyfr-labs/dcyfr-ai/commit/4a89ecaac1c23bc3eaebce520c2a30ac32c9a9b2))
* bump @types/node from 25.6.2 to 25.8.0 ([#190](https://github.com/dcyfr-labs/dcyfr-ai/issues/190)) ([49a5d60](https://github.com/dcyfr-labs/dcyfr-ai/commit/49a5d609d8bc0ca55eb1ebd54598b2ebf667d579))
* bump @types/node from 25.8.0 to 25.9.1 ([#235](https://github.com/dcyfr-labs/dcyfr-ai/issues/235)) ([41be444](https://github.com/dcyfr-labs/dcyfr-ai/commit/41be444c7c32c27891ad2e6d5e0b830dd7bee17b))
* bump @types/node from 25.9.1 to 25.9.2 ([#250](https://github.com/dcyfr-labs/dcyfr-ai/issues/250)) ([76979dd](https://github.com/dcyfr-labs/dcyfr-ai/commit/76979dd8582f3cd927b49f0da2085ba431cd4947))
* bump @types/node from 25.9.2 to 25.9.3 ([#260](https://github.com/dcyfr-labs/dcyfr-ai/issues/260)) ([ebf5d3f](https://github.com/dcyfr-labs/dcyfr-ai/commit/ebf5d3f4b26a4f44cf2460c800b4dab311c13a30))
* bump @types/node from 25.9.3 to 26.0.1 ([#331](https://github.com/dcyfr-labs/dcyfr-ai/issues/331)) ([857e8d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/857e8d85eef626dd3880d729cf994439a07ea634))
* bump @types/node from 26.0.1 to 26.1.0 ([#342](https://github.com/dcyfr-labs/dcyfr-ai/issues/342)) ([784a819](https://github.com/dcyfr-labs/dcyfr-ai/commit/784a81985a3dbed03751b995d38d233c2f54f923))
* bump @types/node from 26.1.0 to 26.1.1 ([#360](https://github.com/dcyfr-labs/dcyfr-ai/issues/360)) ([1421bb4](https://github.com/dcyfr-labs/dcyfr-ai/commit/1421bb46e584787cbfbffd3fe890ad9cb2eea2f5))
* bump @upstash/redis from 1.37.0 to 1.38.0 ([#160](https://github.com/dcyfr-labs/dcyfr-ai/issues/160)) ([627e152](https://github.com/dcyfr-labs/dcyfr-ai/commit/627e152826baee92d8125c1cd916c44b556d5edb))
* bump @vitest/coverage-v8 from 4.1.0 to 4.1.2 ([#57](https://github.com/dcyfr-labs/dcyfr-ai/issues/57)) ([c1eeaf8](https://github.com/dcyfr-labs/dcyfr-ai/commit/c1eeaf81b2064ca34ea4648c4b98a027678ad771))
* bump @vitest/coverage-v8 from 4.1.2 to 4.1.4 ([#93](https://github.com/dcyfr-labs/dcyfr-ai/issues/93)) ([71ff299](https://github.com/dcyfr-labs/dcyfr-ai/commit/71ff2997b726ecbfc991aaf804487f6cb5509c8a))
* bump @vitest/coverage-v8 from 4.1.4 to 4.1.5 ([#118](https://github.com/dcyfr-labs/dcyfr-ai/issues/118)) ([5d6485c](https://github.com/dcyfr-labs/dcyfr-ai/commit/5d6485c70b3a1a94205001aa6c3840a5659a17cb))
* bump @vitest/coverage-v8 from 4.1.7 to 4.1.8 ([#265](https://github.com/dcyfr-labs/dcyfr-ai/issues/265)) ([d5ce391](https://github.com/dcyfr-labs/dcyfr-ai/commit/d5ce3917bda992b7121b38587637d5081a31a075))
* bump @vitest/coverage-v8 from 4.1.8 to 4.1.9 ([#303](https://github.com/dcyfr-labs/dcyfr-ai/issues/303)) ([316d45c](https://github.com/dcyfr-labs/dcyfr-ai/commit/316d45c491a1c7c95c0b4be271e00c3dd0e5dec6))
* bump @vitest/coverage-v8 from 4.1.9 to 4.1.10 ([#354](https://github.com/dcyfr-labs/dcyfr-ai/issues/354)) ([b87f769](https://github.com/dcyfr-labs/dcyfr-ai/commit/b87f769cea412bce7f667fec0843137fb8a2bd95))
* bump axios from 1.15.0 to 1.15.1 ([#112](https://github.com/dcyfr-labs/dcyfr-ai/issues/112)) ([5119ccd](https://github.com/dcyfr-labs/dcyfr-ai/commit/5119ccd29358dda14d196b1eb79891fa29caff0b))
* bump axios from 1.15.1 to 1.15.2 ([#126](https://github.com/dcyfr-labs/dcyfr-ai/issues/126)) ([21e6602](https://github.com/dcyfr-labs/dcyfr-ai/commit/21e660272d92f417d180cfa9c00d6701a4741bb5))
* bump axios from 1.15.2 to 1.16.0 ([#145](https://github.com/dcyfr-labs/dcyfr-ai/issues/145)) ([0ec6e49](https://github.com/dcyfr-labs/dcyfr-ai/commit/0ec6e498b31afde831dc128debd17a420b339064))
* bump axios from 1.16.0 to 1.16.1 ([#188](https://github.com/dcyfr-labs/dcyfr-ai/issues/188)) ([af55fab](https://github.com/dcyfr-labs/dcyfr-ai/commit/af55fabbe096aceb8758a25002ce1a82a57d7849))
* bump axios from 1.16.1 to 1.17.0 ([#246](https://github.com/dcyfr-labs/dcyfr-ai/issues/246)) ([857b65b](https://github.com/dcyfr-labs/dcyfr-ai/commit/857b65b13f9c337aee0ff6dd0ebe097654a4c143))
* bump axios from 1.17.0 to 1.18.0 ([#284](https://github.com/dcyfr-labs/dcyfr-ai/issues/284)) ([50ac96c](https://github.com/dcyfr-labs/dcyfr-ai/commit/50ac96c28eec78fe2bb0de88af14250b06105ff0))
* bump axios from 1.18.0 to 1.18.1 ([#329](https://github.com/dcyfr-labs/dcyfr-ai/issues/329)) ([0c919e0](https://github.com/dcyfr-labs/dcyfr-ai/commit/0c919e04e4a41b93ee52d97e29a5a906239af0c1))
* bump better-sqlite3 from 11.10.0 to 12.6.2 ([#14](https://github.com/dcyfr-labs/dcyfr-ai/issues/14)) ([3d3af45](https://github.com/dcyfr-labs/dcyfr-ai/commit/3d3af45bbabf750a01255f152a7eb2ac2d6bf40e))
* bump better-sqlite3 from 12.10.0 to 12.10.1 ([#283](https://github.com/dcyfr-labs/dcyfr-ai/issues/283)) ([cfd03b8](https://github.com/dcyfr-labs/dcyfr-ai/commit/cfd03b8e901d5b6688a318521d9d6066bfa19d1e))
* bump better-sqlite3 from 12.10.1 to 12.11.1 ([#300](https://github.com/dcyfr-labs/dcyfr-ai/issues/300)) ([24fed81](https://github.com/dcyfr-labs/dcyfr-ai/commit/24fed811ecbea805595087a6bf7909c5840cb9f0))
* bump better-sqlite3 from 12.8.0 to 12.9.0 ([#92](https://github.com/dcyfr-labs/dcyfr-ai/issues/92)) ([50f02c2](https://github.com/dcyfr-labs/dcyfr-ai/commit/50f02c2ffbfb1b7988211825b40c229a1394f104))
* bump better-sqlite3 from 12.9.0 to 12.10.0 ([#195](https://github.com/dcyfr-labs/dcyfr-ai/issues/195)) ([31ba0b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/31ba0b79eefcd5d73db56b262c1854213d815df7))
* bump cloudflare from 4.5.0 to 5.2.0 ([#13](https://github.com/dcyfr-labs/dcyfr-ai/issues/13)) ([bfa927f](https://github.com/dcyfr-labs/dcyfr-ai/commit/bfa927f4cbb1e45e2184214dcfae48b74a6d8922))
* bump cloudflare from 5.2.0 to 6.1.0 ([#163](https://github.com/dcyfr-labs/dcyfr-ai/issues/163)) ([57c957e](https://github.com/dcyfr-labs/dcyfr-ai/commit/57c957e7776f236f07d1f273ee9f13eeab7ea4e6))
* bump cloudflare from 6.1.0 to 6.2.0 ([#185](https://github.com/dcyfr-labs/dcyfr-ai/issues/185)) ([cb9a94a](https://github.com/dcyfr-labs/dcyfr-ai/commit/cb9a94a817593a2223aa235f9b6f05d5edefa021))
* bump cloudflare from 6.2.0 to 6.3.0 ([#212](https://github.com/dcyfr-labs/dcyfr-ai/issues/212)) ([a6e681f](https://github.com/dcyfr-labs/dcyfr-ai/commit/a6e681f83a1ca249bf9f610618870fde59f83942))
* bump cloudflare from 6.3.0 to 6.4.0 ([#259](https://github.com/dcyfr-labs/dcyfr-ai/issues/259)) ([93fb6b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/93fb6b72b4568739c02885ea6bf8497de53a52d9))
* bump cloudflare from 6.4.0 to 6.5.0 ([#332](https://github.com/dcyfr-labs/dcyfr-ai/issues/332)) ([316aad6](https://github.com/dcyfr-labs/dcyfr-ai/commit/316aad6e41de33f922afcc53f65aba7962589dea))
* bump commander from 12.1.0 to 15.0.0 ([#233](https://github.com/dcyfr-labs/dcyfr-ai/issues/233)) ([037bc89](https://github.com/dcyfr-labs/dcyfr-ai/commit/037bc896ae95d7b324f1dac98e186c5376be6c80))
* bump eslint from 10.0.3 to 10.1.0 ([#61](https://github.com/dcyfr-labs/dcyfr-ai/issues/61)) ([caa85cb](https://github.com/dcyfr-labs/dcyfr-ai/commit/caa85cbbff69e2709a03d5ea02690eb4d2941c19))
* bump eslint from 10.1.0 to 10.2.0 ([#70](https://github.com/dcyfr-labs/dcyfr-ai/issues/70)) ([1fb9ca3](https://github.com/dcyfr-labs/dcyfr-ai/commit/1fb9ca3de03726acfe3e2f1342b18e52d70b5c6e))
* bump eslint from 10.2.0 to 10.2.1 ([#108](https://github.com/dcyfr-labs/dcyfr-ai/issues/108)) ([4ae2987](https://github.com/dcyfr-labs/dcyfr-ai/commit/4ae298728784deb491ebeec92ec3dbe01e5c7373))
* bump eslint from 10.2.1 to 10.3.0 ([#139](https://github.com/dcyfr-labs/dcyfr-ai/issues/139)) ([a9fec34](https://github.com/dcyfr-labs/dcyfr-ai/commit/a9fec34bba7e6d9547871ff146aa99e350af9d73))
* bump eslint from 10.3.0 to 10.4.0 ([#187](https://github.com/dcyfr-labs/dcyfr-ai/issues/187)) ([2b7e16e](https://github.com/dcyfr-labs/dcyfr-ai/commit/2b7e16e526f5e6c53d52085240090a0ac4ef1c7f))
* bump eslint from 10.4.0 to 10.4.1 ([#237](https://github.com/dcyfr-labs/dcyfr-ai/issues/237)) ([08b4515](https://github.com/dcyfr-labs/dcyfr-ai/commit/08b4515608beb0240efce7e6937c286c50930a19))
* bump eslint from 10.4.1 to 10.5.0 ([#286](https://github.com/dcyfr-labs/dcyfr-ai/issues/286)) ([2336edb](https://github.com/dcyfr-labs/dcyfr-ai/commit/2336edb8b6180ffd1ffd8d163ff111271df776f1))
* bump eslint from 10.5.0 to 10.6.0 ([#328](https://github.com/dcyfr-labs/dcyfr-ai/issues/328)) ([9629a7e](https://github.com/dcyfr-labs/dcyfr-ai/commit/9629a7ef3d9ce902994b9a76ecfbec61194719f8))
* bump eslint from 10.6.0 to 10.7.0 ([#356](https://github.com/dcyfr-labs/dcyfr-ai/issues/356)) ([78283ac](https://github.com/dcyfr-labs/dcyfr-ai/commit/78283ac6350973dfb9db795048a4cca53ec17006))
* bump eslint from 9.39.3 to 10.0.3 ([#20](https://github.com/dcyfr-labs/dcyfr-ai/issues/20)) ([bab028c](https://github.com/dcyfr-labs/dcyfr-ai/commit/bab028cd2f230c10f6f6e0c1d759c1c17079031c))
* bump fastmcp from 3.34.0 to 3.35.0 ([#72](https://github.com/dcyfr-labs/dcyfr-ai/issues/72)) ([3489458](https://github.com/dcyfr-labs/dcyfr-ai/commit/348945838034b71710974d0046d51546705e653a))
* bump fastmcp from 3.35.0 to 4.0.0 ([#94](https://github.com/dcyfr-labs/dcyfr-ai/issues/94)) ([a053028](https://github.com/dcyfr-labs/dcyfr-ai/commit/a053028262bc0db244f4517e2a1a40d6298f6fa4))
* bump fastmcp from 4.0.0 to 4.0.1 ([#124](https://github.com/dcyfr-labs/dcyfr-ai/issues/124)) ([d0b9c37](https://github.com/dcyfr-labs/dcyfr-ai/commit/d0b9c3700cb755199357f1c56e1196cb22bdc8a4))
* bump fastmcp from 4.0.1 to 4.0.2 (security: OAuthProxy credential leak fix) ([03efc7c](https://github.com/dcyfr-labs/dcyfr-ai/commit/03efc7cfe5ddb83e10b389e5e1b3423b62702cb7))
* bump fastmcp from 4.0.2 to 4.1.0 ([#266](https://github.com/dcyfr-labs/dcyfr-ai/issues/266)) ([54bf404](https://github.com/dcyfr-labs/dcyfr-ai/commit/54bf404d67f32611df6395d5dc34bbcecc7d73e2))
* bump fastmcp from 4.1.0 to 4.2.0 ([#285](https://github.com/dcyfr-labs/dcyfr-ai/issues/285)) ([7f3cb12](https://github.com/dcyfr-labs/dcyfr-ai/commit/7f3cb126a32b0dd9e95923cd294a8e46df7be9e5))
* bump fastmcp from 4.2.0 to 4.3.1 ([#304](https://github.com/dcyfr-labs/dcyfr-ai/issues/304)) ([1b108a5](https://github.com/dcyfr-labs/dcyfr-ai/commit/1b108a5b19b3f19d29d72aca0f341199425047fc))
* bump fastmcp from 4.3.1 to 4.3.2 ([#323](https://github.com/dcyfr-labs/dcyfr-ai/issues/323)) ([3948658](https://github.com/dcyfr-labs/dcyfr-ai/commit/3948658c9b73ebdd08a4ba65b00541c4fe24964e))
* bump fastmcp from 4.3.2 to 4.4.0 ([#349](https://github.com/dcyfr-labs/dcyfr-ai/issues/349)) ([0e725ce](https://github.com/dcyfr-labs/dcyfr-ai/commit/0e725cec87e66153d30950772182bc5fedf62530))
* bump fastmcp from 4.4.0 to 4.7.2 ([#364](https://github.com/dcyfr-labs/dcyfr-ai/issues/364)) ([3860a62](https://github.com/dcyfr-labs/dcyfr-ai/commit/3860a62a3b039f34d57408c6fd4b09ca8022a210))
* bump flatted in the npm_and_yarn group across 1 directory ([#54](https://github.com/dcyfr-labs/dcyfr-ai/issues/54)) ([57ad0ad](https://github.com/dcyfr-labs/dcyfr-ai/commit/57ad0adb403ef273e556af174711b9dc75539f58))
* bump follow-redirects in the npm_and_yarn group across 1 directory ([#95](https://github.com/dcyfr-labs/dcyfr-ai/issues/95)) ([805c758](https://github.com/dcyfr-labs/dcyfr-ai/commit/805c758e2455b9bdc0ddfa29afe27d09024aaa37))
* bump globals from 14.0.0 to 17.5.0 ([#110](https://github.com/dcyfr-labs/dcyfr-ai/issues/110)) ([4d2d1e7](https://github.com/dcyfr-labs/dcyfr-ai/commit/4d2d1e7d8777eae365ea64bb4adc799b23bd1d45))
* bump globals from 17.5.0 to 17.6.0 ([#141](https://github.com/dcyfr-labs/dcyfr-ai/issues/141)) ([74b4f0e](https://github.com/dcyfr-labs/dcyfr-ai/commit/74b4f0eebeccf603013102fe4905bbc9dfcab147))
* bump globals from 17.6.0 to 17.7.0 ([#333](https://github.com/dcyfr-labs/dcyfr-ai/issues/333)) ([f4ce56d](https://github.com/dcyfr-labs/dcyfr-ai/commit/f4ce56db73fa4bd1ab6a684bbc4785adb25bf752))
* bump groq-sdk from 0.3.0 to 1.1.1 ([#12](https://github.com/dcyfr-labs/dcyfr-ai/issues/12)) ([d75ede4](https://github.com/dcyfr-labs/dcyfr-ai/commit/d75ede426ba40faba7120e9ea177bb5f8c724e4c))
* bump groq-sdk from 1.1.1 to 1.1.2 ([#65](https://github.com/dcyfr-labs/dcyfr-ai/issues/65)) ([0675740](https://github.com/dcyfr-labs/dcyfr-ai/commit/0675740fb18512c6c9c85e51439a507dcc4057d1))
* bump groq-sdk from 1.1.2 to 1.2.0 ([#193](https://github.com/dcyfr-labs/dcyfr-ai/issues/193)) ([5f738e1](https://github.com/dcyfr-labs/dcyfr-ai/commit/5f738e15c27948f13f76d5a71598e2cc741333cc))
* bump groq-sdk from 1.2.0 to 1.2.1 ([#267](https://github.com/dcyfr-labs/dcyfr-ai/issues/267)) ([3991460](https://github.com/dcyfr-labs/dcyfr-ai/commit/399146015f65fba9ca35c5fadbdefa212b0aab7b))
* bump groq-sdk from 1.2.1 to 1.3.0 ([#322](https://github.com/dcyfr-labs/dcyfr-ai/issues/322)) ([4a7af1e](https://github.com/dcyfr-labs/dcyfr-ai/commit/4a7af1e0ebb3a8d527440f6b433076d098461f50))
* bump hono in the npm_and_yarn group across 1 directory ([#241](https://github.com/dcyfr-labs/dcyfr-ai/issues/241)) ([4eca502](https://github.com/dcyfr-labs/dcyfr-ai/commit/4eca502a13e9c05f3da8f18808c2e41b2ed6eec4))
* bump hono in the npm_and_yarn group across 1 directory ([#295](https://github.com/dcyfr-labs/dcyfr-ai/issues/295)) ([454b751](https://github.com/dcyfr-labs/dcyfr-ai/commit/454b751d3e246858cba19c65472b10b5390a7cc2))
* bump inquirer from 13.3.0 to 13.4.1 ([#87](https://github.com/dcyfr-labs/dcyfr-ai/issues/87)) ([f02bf71](https://github.com/dcyfr-labs/dcyfr-ai/commit/f02bf71fc6512204df64609b983dbc6b061b3fc8))
* bump inquirer from 13.4.1 to 13.4.2 ([#109](https://github.com/dcyfr-labs/dcyfr-ai/issues/109)) ([21ccd69](https://github.com/dcyfr-labs/dcyfr-ai/commit/21ccd6946a7377ff3728ac4103bdf3bc9c22c805))
* bump inquirer from 13.4.3 to 14.0.2 ([#230](https://github.com/dcyfr-labs/dcyfr-ai/issues/230)) ([8638e62](https://github.com/dcyfr-labs/dcyfr-ai/commit/8638e62e93179e37db96b41bd082e9ba861de9ec))
* bump ip-address in the npm_and_yarn group across 1 directory ([#152](https://github.com/dcyfr-labs/dcyfr-ai/issues/152)) ([106f666](https://github.com/dcyfr-labs/dcyfr-ai/commit/106f666015b3f3403ec31009bf51283574b07777))
* bump langsmith in the npm_and_yarn group across 1 directory ([#182](https://github.com/dcyfr-labs/dcyfr-ai/issues/182)) ([ee7ee60](https://github.com/dcyfr-labs/dcyfr-ai/commit/ee7ee60d56321fddb24054d0a5a10fe583746a56))
* bump langsmith in the npm_and_yarn group across 1 directory ([#80](https://github.com/dcyfr-labs/dcyfr-ai/issues/80)) ([7f6bcbc](https://github.com/dcyfr-labs/dcyfr-ai/commit/7f6bcbcc17b40429b4b213e5537984a47121b523))
* bump mem0ai from 2.4.0 to 2.4.2 ([#46](https://github.com/dcyfr-labs/dcyfr-ai/issues/46)) ([c32c219](https://github.com/dcyfr-labs/dcyfr-ai/commit/c32c219c50c67d5c8c4005936889abfb956ba202))
* bump mem0ai from 2.4.2 to 2.4.4 ([#58](https://github.com/dcyfr-labs/dcyfr-ai/issues/58)) ([1c9cfab](https://github.com/dcyfr-labs/dcyfr-ai/commit/1c9cfab56d8015ea7cf51703ae884654f5b79fa0))
* bump mem0ai from 2.4.4 to 2.4.5 ([#74](https://github.com/dcyfr-labs/dcyfr-ai/issues/74)) ([8789c7e](https://github.com/dcyfr-labs/dcyfr-ai/commit/8789c7e83d7fc3865dfe716c23a635281d1ae391))
* bump mem0ai from 2.4.6 to 3.0.2 ([#123](https://github.com/dcyfr-labs/dcyfr-ai/issues/123)) ([6deecd8](https://github.com/dcyfr-labs/dcyfr-ai/commit/6deecd8043f409b3fa17935bddfe1edab5fa65e7))
* bump mem0ai from 3.0.12 to 3.0.13 ([#346](https://github.com/dcyfr-labs/dcyfr-ai/issues/346)) ([bce6fa6](https://github.com/dcyfr-labs/dcyfr-ai/commit/bce6fa64cdc3c64990461db0d7c339d52328f641))
* bump mem0ai from 3.0.13 to 3.1.0 ([#369](https://github.com/dcyfr-labs/dcyfr-ai/issues/369)) ([786f2c3](https://github.com/dcyfr-labs/dcyfr-ai/commit/786f2c39a8651a97a97abc99b1a421f62e6ed757))
* bump mem0ai from 3.0.2 to 3.0.3 ([#168](https://github.com/dcyfr-labs/dcyfr-ai/issues/168)) ([79a9d02](https://github.com/dcyfr-labs/dcyfr-ai/commit/79a9d0221361c07e34e0c37ed2ef06d8bca435a5))
* bump mem0ai from 3.0.3 to 3.0.5 ([#234](https://github.com/dcyfr-labs/dcyfr-ai/issues/234)) ([e757f53](https://github.com/dcyfr-labs/dcyfr-ai/commit/e757f53a0b599be4f0855e8008a6d6cc49d80135))
* bump mem0ai from 3.0.5 to 3.0.6 ([#248](https://github.com/dcyfr-labs/dcyfr-ai/issues/248)) ([6be4cdc](https://github.com/dcyfr-labs/dcyfr-ai/commit/6be4cdc096b9b9a928c4a0ee2b21c5531cc8c787))
* bump mem0ai from 3.0.6 to 3.0.7 ([#268](https://github.com/dcyfr-labs/dcyfr-ai/issues/268)) ([d06cabb](https://github.com/dcyfr-labs/dcyfr-ai/commit/d06cabb97f59e4e8bbf8ca7542d9267d96e331d3))
* bump mem0ai from 3.0.7 to 3.0.8 ([#288](https://github.com/dcyfr-labs/dcyfr-ai/issues/288)) ([23b65d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/23b65d8ebd344bc6bccd8d476de8a36229bea367))
* bump mem0ai from 3.0.8 to 3.0.9 ([#306](https://github.com/dcyfr-labs/dcyfr-ai/issues/306)) ([c587e8a](https://github.com/dcyfr-labs/dcyfr-ai/commit/c587e8a4c590927ca925860a0e4cb430c92c3b32))
* bump mem0ai from 3.0.9 to 3.0.12 ([#334](https://github.com/dcyfr-labs/dcyfr-ai/issues/334)) ([2f9ffa0](https://github.com/dcyfr-labs/dcyfr-ai/commit/2f9ffa0bd8561935e4d09c55998cef49e79e6afc))
* bump neo4j-driver from 5.28.3 to 6.1.0 ([#244](https://github.com/dcyfr-labs/dcyfr-ai/issues/244)) ([9fa8cd2](https://github.com/dcyfr-labs/dcyfr-ai/commit/9fa8cd21d6e2360d9b8811844208ce5f4214e25d))
* bump neo4j-driver from 6.1.0 to 6.2.0 ([#348](https://github.com/dcyfr-labs/dcyfr-ai/issues/348)) ([70a4825](https://github.com/dcyfr-labs/dcyfr-ai/commit/70a482509cb34212743417e8cbef7518522b719b))
* bump openai from 4.104.0 to 6.32.0 ([#50](https://github.com/dcyfr-labs/dcyfr-ai/issues/50)) ([eaaa756](https://github.com/dcyfr-labs/dcyfr-ai/commit/eaaa7563b54c03c140dc49f80fdfa182f23eff9a))
* bump openai from 6.33.0 to 6.34.0 ([#90](https://github.com/dcyfr-labs/dcyfr-ai/issues/90)) ([4b59de5](https://github.com/dcyfr-labs/dcyfr-ai/commit/4b59de57dd2e7389ed41e7855248a2ed6cb683ba))
* bump openai from 6.34.0 to 6.35.0 ([#140](https://github.com/dcyfr-labs/dcyfr-ai/issues/140)) ([8065e2b](https://github.com/dcyfr-labs/dcyfr-ai/commit/8065e2b175c47d79d5191dffe97c5611f91c5041))
* bump openai from 6.35.0 to 6.37.0 ([#162](https://github.com/dcyfr-labs/dcyfr-ai/issues/162)) ([f0072dd](https://github.com/dcyfr-labs/dcyfr-ai/commit/f0072dda2be68c4dd1a2ea10a9776da8c1d6691b))
* bump openai from 6.37.0 to 6.38.0 ([#192](https://github.com/dcyfr-labs/dcyfr-ai/issues/192)) ([611a712](https://github.com/dcyfr-labs/dcyfr-ai/commit/611a712a1af4bd012cc5ddf2e8d3c492c987181c))
* bump openai from 6.38.0 to 6.39.0 ([#213](https://github.com/dcyfr-labs/dcyfr-ai/issues/213)) ([551f7da](https://github.com/dcyfr-labs/dcyfr-ai/commit/551f7da24135619a6efd974bd7909fdc1f380226))
* bump openai from 6.39.0 to 6.39.1 ([#238](https://github.com/dcyfr-labs/dcyfr-ai/issues/238)) ([d87127b](https://github.com/dcyfr-labs/dcyfr-ai/commit/d87127bf4b2f9ecfeaf2935d1de79d83636926e4))
* bump openai from 6.39.1 to 6.42.0 ([#262](https://github.com/dcyfr-labs/dcyfr-ai/issues/262)) ([5c2c613](https://github.com/dcyfr-labs/dcyfr-ai/commit/5c2c613f594618f51a813d252ee436e9897a0bec))
* bump openai from 6.42.0 to 6.44.0 ([#308](https://github.com/dcyfr-labs/dcyfr-ai/issues/308)) ([a1199d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/a1199d842c1dee42dc1b4a645aa9adb4a08d4224))
* bump openai from 6.44.0 to 6.45.0 ([#324](https://github.com/dcyfr-labs/dcyfr-ai/issues/324)) ([555a463](https://github.com/dcyfr-labs/dcyfr-ai/commit/555a4631c6c924c9223bf52d3bec5ef4ce981adf))
* bump openai from 6.45.0 to 6.46.0 ([#359](https://github.com/dcyfr-labs/dcyfr-ai/issues/359)) ([6b51881](https://github.com/dcyfr-labs/dcyfr-ai/commit/6b5188110d06c694468128ab53398568c85a22f2))
* bump openai from 6.46.0 to 6.48.0 ([#367](https://github.com/dcyfr-labs/dcyfr-ai/issues/367)) ([3667184](https://github.com/dcyfr-labs/dcyfr-ai/commit/3667184995102b39aaa194b1bae95e7afebce471))
* bump ora from 9.3.0 to 9.4.0 ([#116](https://github.com/dcyfr-labs/dcyfr-ai/issues/116)) ([77eeef7](https://github.com/dcyfr-labs/dcyfr-ai/commit/77eeef7b3427f9866ea83aa9aa0a6811b0ecf6e6))
* bump ora from 9.4.0 to 9.4.1 ([#326](https://github.com/dcyfr-labs/dcyfr-ai/issues/326)) ([d3017d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/d3017d8a88c76a68adc0e5210fb9274d549f4a64))
* bump pg from 8.11.3 to 8.21.0 ([#203](https://github.com/dcyfr-labs/dcyfr-ai/issues/203)) ([1d53730](https://github.com/dcyfr-labs/dcyfr-ai/commit/1d5373092f9dd89361c9974c124622712921750d))
* bump pg from 8.21.0 to 8.22.0 ([#301](https://github.com/dcyfr-labs/dcyfr-ai/issues/301)) ([a3be2b3](https://github.com/dcyfr-labs/dcyfr-ai/commit/a3be2b3712b614f390152bc1a5d79980d01dad69))
* bump postcss in the npm_and_yarn group across 1 directory ([#128](https://github.com/dcyfr-labs/dcyfr-ai/issues/128)) ([7c37d03](https://github.com/dcyfr-labs/dcyfr-ai/commit/7c37d03f9c1c256c0211886483ebce678b69ae67))
* bump protobufjs in the npm_and_yarn group across 1 directory ([#103](https://github.com/dcyfr-labs/dcyfr-ai/issues/103)) ([ab11cb4](https://github.com/dcyfr-labs/dcyfr-ai/commit/ab11cb4cf955f973ef58af18f2dd3cc5fabfd7b6))
* bump protobufjs in the npm_and_yarn group across 1 directory ([#181](https://github.com/dcyfr-labs/dcyfr-ai/issues/181)) ([c52b349](https://github.com/dcyfr-labs/dcyfr-ai/commit/c52b3491a6e6d265d8a7dafbdeca9080fa1eef64))
* bump qs in the npm_and_yarn group across 1 directory ([#200](https://github.com/dcyfr-labs/dcyfr-ai/issues/200)) ([66c424d](https://github.com/dcyfr-labs/dcyfr-ai/commit/66c424de7f55d0a596ae99cb1ef2e4b2bc2b02e5))
* bump redis from 4.7.1 to 5.12.1 ([#106](https://github.com/dcyfr-labs/dcyfr-ai/issues/106)) ([770dbef](https://github.com/dcyfr-labs/dcyfr-ai/commit/770dbef6d5aace3caeb4062360c64ecfe1c377d0))
* bump redis from 5.12.1 to 6.0.0 ([#245](https://github.com/dcyfr-labs/dcyfr-ai/issues/245)) ([cf56322](https://github.com/dcyfr-labs/dcyfr-ai/commit/cf5632213182363f3e31f6f03c1cbc4d151fa64b))
* bump redis from 6.0.0 to 6.0.1 ([#335](https://github.com/dcyfr-labs/dcyfr-ai/issues/335)) ([3cc8287](https://github.com/dcyfr-labs/dcyfr-ai/commit/3cc8287ece18b91f05462a01ebe96d7f13d081a7))
* bump redis from 6.0.1 to 6.1.0 ([#344](https://github.com/dcyfr-labs/dcyfr-ai/issues/344)) ([87c4147](https://github.com/dcyfr-labs/dcyfr-ai/commit/87c41473008462799c99c5faa5cf170d60266b2b))
* bump the npm_and_yarn group across 1 directory with 2 updates ([#102](https://github.com/dcyfr-labs/dcyfr-ai/issues/102)) ([bdd58bd](https://github.com/dcyfr-labs/dcyfr-ai/commit/bdd58bdc18052fac1ec59f225595ee066707a085))
* bump the npm_and_yarn group across 1 directory with 2 updates ([#154](https://github.com/dcyfr-labs/dcyfr-ai/issues/154)) ([57c05b1](https://github.com/dcyfr-labs/dcyfr-ai/commit/57c05b1aed123af0e03fb91d8629cf4b846d7b97))
* bump the npm_and_yarn group across 1 directory with 2 updates ([#291](https://github.com/dcyfr-labs/dcyfr-ai/issues/291)) ([b98d3b1](https://github.com/dcyfr-labs/dcyfr-ai/commit/b98d3b16826396cd6d259cf49b1131d120188ae3))
* bump the npm_and_yarn group across 1 directory with 2 updates ([#375](https://github.com/dcyfr-labs/dcyfr-ai/issues/375)) ([28f0968](https://github.com/dcyfr-labs/dcyfr-ai/commit/28f0968b1e43ba2d66061462ca4094a5c05520ff))
* bump the npm_and_yarn group across 1 directory with 2 updates ([#77](https://github.com/dcyfr-labs/dcyfr-ai/issues/77)) ([e0b2279](https://github.com/dcyfr-labs/dcyfr-ai/commit/e0b2279ca2a5412dbe6d6fc3a6c908d5840d5ed8))
* bump the npm_and_yarn group across 1 directory with 3 updates ([#66](https://github.com/dcyfr-labs/dcyfr-ai/issues/66)) ([5fca91e](https://github.com/dcyfr-labs/dcyfr-ai/commit/5fca91ea0c6a75def5abf1f05cb94218e97264e2))
* bump typescript from 5.9.3 to 6.0.2 ([#62](https://github.com/dcyfr-labs/dcyfr-ai/issues/62)) ([3c28c20](https://github.com/dcyfr-labs/dcyfr-ai/commit/3c28c20e148e07a188baa3e425379d5434fd8def))
* bump typescript from 6.0.2 to 6.0.3 ([#111](https://github.com/dcyfr-labs/dcyfr-ai/issues/111)) ([cdb3ba3](https://github.com/dcyfr-labs/dcyfr-ai/commit/cdb3ba36c099a9afbf8b7653d2e69596112e21ce))
* bump typescript-eslint from 8.57.0 to 8.57.1 ([#52](https://github.com/dcyfr-labs/dcyfr-ai/issues/52)) ([6ba1aa8](https://github.com/dcyfr-labs/dcyfr-ai/commit/6ba1aa8c0ecc344bf2b2b4f3310cc21158d00fcb))
* bump typescript-eslint from 8.57.1 to 8.57.2 ([#60](https://github.com/dcyfr-labs/dcyfr-ai/issues/60)) ([1d75c25](https://github.com/dcyfr-labs/dcyfr-ai/commit/1d75c256ed51cdbbe26f3a75ca01d9afdde20182))
* bump typescript-eslint from 8.58.0 to 8.58.2 ([#98](https://github.com/dcyfr-labs/dcyfr-ai/issues/98)) ([5f8d0f0](https://github.com/dcyfr-labs/dcyfr-ai/commit/5f8d0f0052868ea95892aa28f82ae0be433f7c3d))
* bump typescript-eslint from 8.58.2 to 8.59.0 ([#122](https://github.com/dcyfr-labs/dcyfr-ai/issues/122)) ([86a4869](https://github.com/dcyfr-labs/dcyfr-ai/commit/86a48697a5ae8cb240fd734ccad12e151a4d7e8b))
* bump typescript-eslint from 8.59.0 to 8.59.1 ([#143](https://github.com/dcyfr-labs/dcyfr-ai/issues/143)) ([974aac8](https://github.com/dcyfr-labs/dcyfr-ai/commit/974aac88dfdcd8c0e28fecd34b6e9512fe6bd4c5))
* bump typescript-eslint from 8.59.1 to 8.59.2 ([#170](https://github.com/dcyfr-labs/dcyfr-ai/issues/170)) ([35ca17e](https://github.com/dcyfr-labs/dcyfr-ai/commit/35ca17e8d1fa44cd93e74267fbe03e4800e7d83a))
* bump typescript-eslint from 8.59.2 to 8.59.3 ([#189](https://github.com/dcyfr-labs/dcyfr-ai/issues/189)) ([56a217f](https://github.com/dcyfr-labs/dcyfr-ai/commit/56a217f8aed48734f5f6334a45876e30a010ec10))
* bump typescript-eslint from 8.59.4 to 8.60.0 ([#236](https://github.com/dcyfr-labs/dcyfr-ai/issues/236)) ([a468195](https://github.com/dcyfr-labs/dcyfr-ai/commit/a46819565e677bb88cf1d533905ef4be458580f1))
* bump typescript-eslint from 8.60.0 to 8.60.1 ([#243](https://github.com/dcyfr-labs/dcyfr-ai/issues/243)) ([790a818](https://github.com/dcyfr-labs/dcyfr-ai/commit/790a818900ae575d39504d592f78b6abb0c8e69f))
* bump typescript-eslint from 8.60.1 to 8.61.0 ([#261](https://github.com/dcyfr-labs/dcyfr-ai/issues/261)) ([d68c286](https://github.com/dcyfr-labs/dcyfr-ai/commit/d68c2861bced87a05ba9fdfc370626baa90401af))
* bump typescript-eslint from 8.61.0 to 8.61.1 ([#302](https://github.com/dcyfr-labs/dcyfr-ai/issues/302)) ([131757b](https://github.com/dcyfr-labs/dcyfr-ai/commit/131757b9930f0d3aab36f869055758cf66b0315b))
* bump typescript-eslint from 8.61.1 to 8.62.0 ([#330](https://github.com/dcyfr-labs/dcyfr-ai/issues/330)) ([30fb889](https://github.com/dcyfr-labs/dcyfr-ai/commit/30fb889197be99785a1641e00da6d8fd8a1672e1))
* bump typescript-eslint from 8.62.0 to 8.62.1 ([#343](https://github.com/dcyfr-labs/dcyfr-ai/issues/343)) ([5f3f6b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/5f3f6b7b6c94a8bfd0c4c110f2448ce6a1e29b09))
* bump typescript-eslint from 8.62.1 to 8.64.0 ([#371](https://github.com/dcyfr-labs/dcyfr-ai/issues/371)) ([0a1e639](https://github.com/dcyfr-labs/dcyfr-ai/commit/0a1e6390e0656f6b424b77c8def42d6b23da0e67))
* bump vite in the npm_and_yarn group across 1 directory ([#289](https://github.com/dcyfr-labs/dcyfr-ai/issues/289)) ([8ee41f5](https://github.com/dcyfr-labs/dcyfr-ai/commit/8ee41f58d12870a3671ab6e136c08f9e0999ca42))
* bump vite in the npm_and_yarn group across 1 directory ([#76](https://github.com/dcyfr-labs/dcyfr-ai/issues/76)) ([822ebea](https://github.com/dcyfr-labs/dcyfr-ai/commit/822ebeaea8b5b887457f69080a0e0725ab3d50c9))
* bump vitest from 4.1.0 to 4.1.2 ([#63](https://github.com/dcyfr-labs/dcyfr-ai/issues/63)) ([d4788a7](https://github.com/dcyfr-labs/dcyfr-ai/commit/d4788a73ca1d4de17463b44a80e3c2f625f24980))
* bump vitest from 4.1.2 to 4.1.4 ([#89](https://github.com/dcyfr-labs/dcyfr-ai/issues/89)) ([9eb56e1](https://github.com/dcyfr-labs/dcyfr-ai/commit/9eb56e1d210ed54b7ec0c07e00d415f43f5dda69))
* bump vitest from 4.1.4 to 4.1.5 ([#117](https://github.com/dcyfr-labs/dcyfr-ai/issues/117)) ([38b7cb8](https://github.com/dcyfr-labs/dcyfr-ai/commit/38b7cb8bd68a83b277d76aaf4269f3f06b51636c))
* bump vitest from 4.1.5 to 4.1.6 ([#196](https://github.com/dcyfr-labs/dcyfr-ai/issues/196)) ([ccd2f7e](https://github.com/dcyfr-labs/dcyfr-ai/commit/ccd2f7e525bf8e92ce66acb5a11e65c422478c76))
* bump vitest from 4.1.6 to 4.1.8 ([#231](https://github.com/dcyfr-labs/dcyfr-ai/issues/231)) ([a52a822](https://github.com/dcyfr-labs/dcyfr-ai/commit/a52a82254edc2930de0fa44012f001ecef8bd070))
* bump vitest from 4.1.8 to 4.1.9 ([#310](https://github.com/dcyfr-labs/dcyfr-ai/issues/310)) ([aed479c](https://github.com/dcyfr-labs/dcyfr-ai/commit/aed479c8a6a049c85f0e98ad0b6e65484c4e7a1f))
* bump vitest from 4.1.9 to 4.1.10 ([#361](https://github.com/dcyfr-labs/dcyfr-ai/issues/361)) ([55c30c1](https://github.com/dcyfr-labs/dcyfr-ai/commit/55c30c1348e2f5dac4d30f7e4391e9dd583feca6))
* bump ws in the npm_and_yarn group across 1 directory ([#198](https://github.com/dcyfr-labs/dcyfr-ai/issues/198)) ([46af11c](https://github.com/dcyfr-labs/dcyfr-ai/commit/46af11cb36c3374b10904420b5df4da16913e7bc))
* bump yaml from 2.8.2 to 2.8.3 ([#48](https://github.com/dcyfr-labs/dcyfr-ai/issues/48)) ([2816942](https://github.com/dcyfr-labs/dcyfr-ai/commit/2816942604ea491b56dcba991a010a1c60cb4da9))
* bump yaml from 2.8.3 to 2.8.4 ([#138](https://github.com/dcyfr-labs/dcyfr-ai/issues/138)) ([d97742d](https://github.com/dcyfr-labs/dcyfr-ai/commit/d97742d5ebef25925aa45734f058339374c76007))
* bump yaml from 2.8.4 to 2.9.0 ([#194](https://github.com/dcyfr-labs/dcyfr-ai/issues/194)) ([aa65245](https://github.com/dcyfr-labs/dcyfr-ai/commit/aa65245cf4bfa2984a7d7c51bde6dc6162bf06af))
* bump yaml from 2.8.4 to 2.9.0 ([#206](https://github.com/dcyfr-labs/dcyfr-ai/issues/206)) ([aed01d5](https://github.com/dcyfr-labs/dcyfr-ai/commit/aed01d53197609ec07d938add155b9f16f975ca8))
* bump zod from 4.3.6 to 4.4.2 ([#146](https://github.com/dcyfr-labs/dcyfr-ai/issues/146)) ([f6e8982](https://github.com/dcyfr-labs/dcyfr-ai/commit/f6e89823fd2929bf55f40161bb4bb0b7e2c3ed91))
* bump zod from 4.4.2 to 4.4.3 ([#158](https://github.com/dcyfr-labs/dcyfr-ai/issues/158)) ([2706a6a](https://github.com/dcyfr-labs/dcyfr-ai/commit/2706a6ac69c1b1c862ea8a97a4267a0d6c3487bf))


### Refactoring

* clear 4 CodeQL warnings (dead stores + stale test ctor) ([#224](https://github.com/dcyfr-labs/dcyfr-ai/issues/224)) ([a0c6b1c](https://github.com/dcyfr-labs/dcyfr-ai/commit/a0c6b1c60e5b500b0cda2f26237ac11818cf1032))
* update AGENTS.md terminology to harness (Task 1.3) ([617fa08](https://github.com/dcyfr-labs/dcyfr-ai/commit/617fa08c61daeb9f5c0190349f6c75c81d440c56))
* update CONTRIBUTING.md directory labels (Task 1.4) ([c2a9919](https://github.com/dcyfr-labs/dcyfr-ai/commit/c2a9919202636e7a5be993ff357e2d5e11e473aa))
* update provider configurations and telemetry session defaults ([be7b53d](https://github.com/dcyfr-labs/dcyfr-ai/commit/be7b53debc1baa43d57bd13ce9b2857e767aedd3))
* update terminology from framework to harness (Tasks 1.1-1.2) ([8b18d9d](https://github.com/dcyfr-labs/dcyfr-ai/commit/8b18d9d163f3c612492c606c7a9b55aa6a5c4ade))

## [3.4.3](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.4.2...v3.4.3) (2026-07-03)


### Bug Fixes

* **permissions:** de-bomb attenuation-engine expiration tests ([#341](https://github.com/dcyfr-labs/dcyfr-ai/issues/341)) ([ee2cbf4](https://github.com/dcyfr-labs/dcyfr-ai/commit/ee2cbf4dbd476bfe15b343e52d9e128c08468df0))

## [3.4.2](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.4.1...v3.4.2) (2026-07-01)


### Bug Fixes

* **security:** bump brace-expansion to &gt;=5.0.6 via npm override (GHSA-jxxr-4gwj-5jf2) ([#337](https://github.com/dcyfr-labs/dcyfr-ai/issues/337)) ([3eca26b](https://github.com/dcyfr-labs/dcyfr-ai/commit/3eca26b4e9b656dc14ca035c088c4bbd32005746))


### Dependencies

* bump @anthropic-ai/sdk from 0.104.1 to 0.106.0 ([#325](https://github.com/dcyfr-labs/dcyfr-ai/issues/325)) ([c6fe083](https://github.com/dcyfr-labs/dcyfr-ai/commit/c6fe0833eff80ef8fa03840f88ab9b4489b18fd1))
* bump @google/genai from 2.9.0 to 2.10.0 ([#327](https://github.com/dcyfr-labs/dcyfr-ai/issues/327)) ([f2d8fa3](https://github.com/dcyfr-labs/dcyfr-ai/commit/f2d8fa33d1401880177dfa0c42da7b9904e3a6fb))
* bump @langchain/core from 1.1.49 to 1.2.1 ([#336](https://github.com/dcyfr-labs/dcyfr-ai/issues/336)) ([7247ce8](https://github.com/dcyfr-labs/dcyfr-ai/commit/7247ce802fe711c998c311e86ef40a8b5ff6fccb))
* bump axios from 1.18.0 to 1.18.1 ([#329](https://github.com/dcyfr-labs/dcyfr-ai/issues/329)) ([0c919e0](https://github.com/dcyfr-labs/dcyfr-ai/commit/0c919e04e4a41b93ee52d97e29a5a906239af0c1))
* bump cloudflare from 6.4.0 to 6.5.0 ([#332](https://github.com/dcyfr-labs/dcyfr-ai/issues/332)) ([316aad6](https://github.com/dcyfr-labs/dcyfr-ai/commit/316aad6e41de33f922afcc53f65aba7962589dea))
* bump eslint from 10.5.0 to 10.6.0 ([#328](https://github.com/dcyfr-labs/dcyfr-ai/issues/328)) ([9629a7e](https://github.com/dcyfr-labs/dcyfr-ai/commit/9629a7ef3d9ce902994b9a76ecfbec61194719f8))
* bump fastmcp from 4.3.1 to 4.3.2 ([#323](https://github.com/dcyfr-labs/dcyfr-ai/issues/323)) ([3948658](https://github.com/dcyfr-labs/dcyfr-ai/commit/3948658c9b73ebdd08a4ba65b00541c4fe24964e))
* bump globals from 17.6.0 to 17.7.0 ([#333](https://github.com/dcyfr-labs/dcyfr-ai/issues/333)) ([f4ce56d](https://github.com/dcyfr-labs/dcyfr-ai/commit/f4ce56db73fa4bd1ab6a684bbc4785adb25bf752))
* bump groq-sdk from 1.2.1 to 1.3.0 ([#322](https://github.com/dcyfr-labs/dcyfr-ai/issues/322)) ([4a7af1e](https://github.com/dcyfr-labs/dcyfr-ai/commit/4a7af1e0ebb3a8d527440f6b433076d098461f50))
* bump mem0ai from 3.0.9 to 3.0.12 ([#334](https://github.com/dcyfr-labs/dcyfr-ai/issues/334)) ([2f9ffa0](https://github.com/dcyfr-labs/dcyfr-ai/commit/2f9ffa0bd8561935e4d09c55998cef49e79e6afc))
* bump openai from 6.44.0 to 6.45.0 ([#324](https://github.com/dcyfr-labs/dcyfr-ai/issues/324)) ([555a463](https://github.com/dcyfr-labs/dcyfr-ai/commit/555a4631c6c924c9223bf52d3bec5ef4ce981adf))
* bump ora from 9.4.0 to 9.4.1 ([#326](https://github.com/dcyfr-labs/dcyfr-ai/issues/326)) ([d3017d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/d3017d8a88c76a68adc0e5210fb9274d549f4a64))
* bump redis from 6.0.0 to 6.0.1 ([#335](https://github.com/dcyfr-labs/dcyfr-ai/issues/335)) ([3cc8287](https://github.com/dcyfr-labs/dcyfr-ai/commit/3cc8287ece18b91f05462a01ebe96d7f13d081a7))
* bump typescript-eslint from 8.61.1 to 8.62.0 ([#330](https://github.com/dcyfr-labs/dcyfr-ai/issues/330)) ([30fb889](https://github.com/dcyfr-labs/dcyfr-ai/commit/30fb889197be99785a1641e00da6d8fd8a1672e1))

## [3.4.1](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.4.0...v3.4.1) (2026-06-28)


### Bug Fixes

* **doc-parity:** accept transient 408/5xx in link-check to absorb bundlephobia outages ([#320](https://github.com/dcyfr-labs/dcyfr-ai/issues/320)) ([090ae8c](https://github.com/dcyfr-labs/dcyfr-ai/commit/090ae8cefc68c9f5ae2057d10de8cf18708b6058))

## [3.4.0](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.3.4...v3.4.0) (2026-06-27)


### Features

* **doc-parity:** structural PROVIDER_ENV_KEYS manifest + config determinism guard (Wave 1 task 1.6) ([#316](https://github.com/dcyfr-labs/dcyfr-ai/issues/316)) ([ce342f7](https://github.com/dcyfr-labs/dcyfr-ai/commit/ce342f7376dfad99153beed0ea4ce8eb69e05645))
* **doc-parity:** Wave 1 — generated API reference + strict export-parity ([#313](https://github.com/dcyfr-labs/dcyfr-ai/issues/313)) ([6e855de](https://github.com/dcyfr-labs/dcyfr-ai/commit/6e855decc43ec10ccde2529ba61198326ae51bdd))


### Bug Fixes

* **doc-parity:** widen release-managed VERSION const in generated API reference ([#319](https://github.com/dcyfr-labs/dcyfr-ai/issues/319)) ([df9ae79](https://github.com/dcyfr-labs/dcyfr-ai/commit/df9ae796d4063303b43fad94424c8cdf4cad62a2))
* **docs:** strip trailing space in README Trademark line (MD009) ([#318](https://github.com/dcyfr-labs/dcyfr-ai/issues/318)) ([e03368e](https://github.com/dcyfr-labs/dcyfr-ai/commit/e03368e36fbd39a71b317a9b59b0028c32b3b2e6))

## [3.3.4](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.3.3...v3.3.4) (2026-06-24)


### Bug Fixes

* **security:** floor transitive undici@6.x (qdrant) to &gt;=6.27.0 ([#311](https://github.com/dcyfr-labs/dcyfr-ai/issues/311)) ([80e849b](https://github.com/dcyfr-labs/dcyfr-ai/commit/80e849b0f59c2cdc03f09311db94b5ec44b2c963))

## [3.3.3](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.3.2...v3.3.3) (2026-06-19)


### Bug Fixes

* **examples:** make standalone-nextjs example build ([#299](https://github.com/dcyfr-labs/dcyfr-ai/issues/299)) ([c626242](https://github.com/dcyfr-labs/dcyfr-ai/commit/c6262429cf2e5338a3ca31478a98d813966d7b6f))
* **security:** bump standalone-nextjs example undici override to ^7.28.0 ([#297](https://github.com/dcyfr-labs/dcyfr-ai/issues/297)) ([66572bd](https://github.com/dcyfr-labs/dcyfr-ai/commit/66572bdc49da165d44d2a7e921615d907b84a301))
* **security:** clear undici HIGH+MEDIUM CVE on main before 3.3.2 ([#296](https://github.com/dcyfr-labs/dcyfr-ai/issues/296)) ([4991c68](https://github.com/dcyfr-labs/dcyfr-ai/commit/4991c684b4cebbabcff2b408624d2db6d7b33df5))

## [3.3.2](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.3.1...v3.3.2) (2026-06-19)


### Bug Fixes

* **security:** bump transitive CVEs to patched versions ([#292](https://github.com/dcyfr-labs/dcyfr-ai/issues/292)) ([84f8a43](https://github.com/dcyfr-labs/dcyfr-ai/commit/84f8a43d77921d23451d9bb702b72fb3ed306b4d))


### Dependencies

* bump the npm_and_yarn group across 1 directory with 2 updates ([#291](https://github.com/dcyfr-labs/dcyfr-ai/issues/291)) ([b98d3b1](https://github.com/dcyfr-labs/dcyfr-ai/commit/b98d3b16826396cd6d259cf49b1131d120188ae3))
* bump vite in the npm_and_yarn group across 1 directory ([#289](https://github.com/dcyfr-labs/dcyfr-ai/issues/289)) ([8ee41f5](https://github.com/dcyfr-labs/dcyfr-ai/commit/8ee41f58d12870a3671ab6e136c08f9e0999ca42))

## [3.3.1](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.3.0...v3.3.1) (2026-06-15)


### Bug Fixes

* **doc-parity:** sync version.ts to 3.3.0 + complete gen-config escaping (CodeQL HIGH) ([#279](https://github.com/dcyfr-labs/dcyfr-ai/issues/279)) ([8935c3c](https://github.com/dcyfr-labs/dcyfr-ai/commit/8935c3c5d8b897bbc3f825a6f58be66785c7758d))


### Dependencies

* bump @langchain/core from 1.1.48 to 1.1.49 ([#287](https://github.com/dcyfr-labs/dcyfr-ai/issues/287)) ([ae18739](https://github.com/dcyfr-labs/dcyfr-ai/commit/ae18739a1f15d26a6f7f7cd2db9e943ea95d6082))
* bump axios from 1.17.0 to 1.18.0 ([#284](https://github.com/dcyfr-labs/dcyfr-ai/issues/284)) ([50ac96c](https://github.com/dcyfr-labs/dcyfr-ai/commit/50ac96c28eec78fe2bb0de88af14250b06105ff0))
* bump better-sqlite3 from 12.10.0 to 12.10.1 ([#283](https://github.com/dcyfr-labs/dcyfr-ai/issues/283)) ([cfd03b8](https://github.com/dcyfr-labs/dcyfr-ai/commit/cfd03b8e901d5b6688a318521d9d6066bfa19d1e))
* bump eslint from 10.4.1 to 10.5.0 ([#286](https://github.com/dcyfr-labs/dcyfr-ai/issues/286)) ([2336edb](https://github.com/dcyfr-labs/dcyfr-ai/commit/2336edb8b6180ffd1ffd8d163ff111271df776f1))
* bump fastmcp from 4.1.0 to 4.2.0 ([#285](https://github.com/dcyfr-labs/dcyfr-ai/issues/285)) ([7f3cb12](https://github.com/dcyfr-labs/dcyfr-ai/commit/7f3cb126a32b0dd9e95923cd294a8e46df7be9e5))
* bump mem0ai from 3.0.7 to 3.0.8 ([#288](https://github.com/dcyfr-labs/dcyfr-ai/issues/288)) ([23b65d8](https://github.com/dcyfr-labs/dcyfr-ai/commit/23b65d8ebd344bc6bccd8d476de8a36229bea367))

## [3.3.0](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.2.4...v3.3.0) (2026-06-14)


### Features

* **ci:** add documentation-parity gates and fix stale VERSION export ([#277](https://github.com/dcyfr-labs/dcyfr-ai/issues/277)) ([1c21a08](https://github.com/dcyfr-labs/dcyfr-ai/commit/1c21a085a4dbfed435a1b827cbd3fbfa0b7bc8fb))

## [3.2.4](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.2.3...v3.2.4) (2026-06-12)


### Bug Fixes

* resolve 8 SonarCloud new-code reliability bugs ([#270](https://github.com/dcyfr-labs/dcyfr-ai/issues/270)) ([8608ba4](https://github.com/dcyfr-labs/dcyfr-ai/commit/8608ba44091117663cd9b0f83ee2d5712b09834d))


### Dependencies

* bump @anthropic-ai/sdk from 0.102.0 to 0.104.1 ([#263](https://github.com/dcyfr-labs/dcyfr-ai/issues/263)) ([251ffd6](https://github.com/dcyfr-labs/dcyfr-ai/commit/251ffd64a069e698388f434daed058eb839bdd92))
* bump @supabase/supabase-js from 2.107.0 to 2.108.1 ([#264](https://github.com/dcyfr-labs/dcyfr-ai/issues/264)) ([e806aa1](https://github.com/dcyfr-labs/dcyfr-ai/commit/e806aa1ed2979988256a03ee933f118c40b589b5))
* bump @types/node from 25.9.2 to 25.9.3 ([#260](https://github.com/dcyfr-labs/dcyfr-ai/issues/260)) ([ebf5d3f](https://github.com/dcyfr-labs/dcyfr-ai/commit/ebf5d3f4b26a4f44cf2460c800b4dab311c13a30))
* bump @vitest/coverage-v8 from 4.1.7 to 4.1.8 ([#265](https://github.com/dcyfr-labs/dcyfr-ai/issues/265)) ([d5ce391](https://github.com/dcyfr-labs/dcyfr-ai/commit/d5ce3917bda992b7121b38587637d5081a31a075))
* bump cloudflare from 6.3.0 to 6.4.0 ([#259](https://github.com/dcyfr-labs/dcyfr-ai/issues/259)) ([93fb6b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/93fb6b72b4568739c02885ea6bf8497de53a52d9))
* bump fastmcp from 4.0.2 to 4.1.0 ([#266](https://github.com/dcyfr-labs/dcyfr-ai/issues/266)) ([54bf404](https://github.com/dcyfr-labs/dcyfr-ai/commit/54bf404d67f32611df6395d5dc34bbcecc7d73e2))
* bump groq-sdk from 1.2.0 to 1.2.1 ([#267](https://github.com/dcyfr-labs/dcyfr-ai/issues/267)) ([3991460](https://github.com/dcyfr-labs/dcyfr-ai/commit/399146015f65fba9ca35c5fadbdefa212b0aab7b))
* bump mem0ai from 3.0.6 to 3.0.7 ([#268](https://github.com/dcyfr-labs/dcyfr-ai/issues/268)) ([d06cabb](https://github.com/dcyfr-labs/dcyfr-ai/commit/d06cabb97f59e4e8bbf8ca7542d9267d96e331d3))
* bump openai from 6.39.1 to 6.42.0 ([#262](https://github.com/dcyfr-labs/dcyfr-ai/issues/262)) ([5c2c613](https://github.com/dcyfr-labs/dcyfr-ai/commit/5c2c613f594618f51a813d252ee436e9897a0bec))
* bump typescript-eslint from 8.60.1 to 8.61.0 ([#261](https://github.com/dcyfr-labs/dcyfr-ai/issues/261)) ([d68c286](https://github.com/dcyfr-labs/dcyfr-ai/commit/d68c2861bced87a05ba9fdfc370626baa90401af))

## [3.2.3](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.2.2...v3.2.3) (2026-06-11)


### Dependencies

* bump neo4j-driver from 5.28.3 to 6.1.0 ([#244](https://github.com/dcyfr-labs/dcyfr-ai/issues/244)) ([9fa8cd2](https://github.com/dcyfr-labs/dcyfr-ai/commit/9fa8cd21d6e2360d9b8811844208ce5f4214e25d))
* bump redis from 5.12.1 to 6.0.0 ([#245](https://github.com/dcyfr-labs/dcyfr-ai/issues/245)) ([cf56322](https://github.com/dcyfr-labs/dcyfr-ai/commit/cf5632213182363f3e31f6f03c1cbc4d151fa64b))

## [3.2.2](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.2.1...v3.2.2) (2026-06-11)


### Bug Fixes

* **cli:** repair published bin layout, fold telemetry into dcyfr-ai ([#256](https://github.com/dcyfr-labs/dcyfr-ai/issues/256)) ([166001e](https://github.com/dcyfr-labs/dcyfr-ai/commit/166001e28948a1eb149edb75028109790baae504))


### Dependencies

* bump @anthropic-ai/sdk from 0.98.0 to 0.102.0 ([#251](https://github.com/dcyfr-labs/dcyfr-ai/issues/251)) ([973cbfb](https://github.com/dcyfr-labs/dcyfr-ai/commit/973cbfb2a52c80d48af04fd8534f3e96cfdb3753))
* bump @google/genai from 2.6.0 to 2.7.0 ([#239](https://github.com/dcyfr-labs/dcyfr-ai/issues/239)) ([07049bf](https://github.com/dcyfr-labs/dcyfr-ai/commit/07049bf7d726c44081406fac1ef5ef63aedc2fa8))
* bump @google/genai from 2.7.0 to 2.8.0 ([#247](https://github.com/dcyfr-labs/dcyfr-ai/issues/247)) ([fa36a9f](https://github.com/dcyfr-labs/dcyfr-ai/commit/fa36a9f00d0cb9e957e8b8fcc6732730f3bff3aa))
* bump @supabase/supabase-js from 2.106.1 to 2.106.2 ([#232](https://github.com/dcyfr-labs/dcyfr-ai/issues/232)) ([43d3039](https://github.com/dcyfr-labs/dcyfr-ai/commit/43d303902894f8c72134fd62d9bccc5bea90d4d6))
* bump @supabase/supabase-js from 2.106.2 to 2.107.0 ([#249](https://github.com/dcyfr-labs/dcyfr-ai/issues/249)) ([577597a](https://github.com/dcyfr-labs/dcyfr-ai/commit/577597ae52f2e45d26b2ca2c9a1979d1fc4b02bb))
* bump @types/node from 25.8.0 to 25.9.1 ([#235](https://github.com/dcyfr-labs/dcyfr-ai/issues/235)) ([41be444](https://github.com/dcyfr-labs/dcyfr-ai/commit/41be444c7c32c27891ad2e6d5e0b830dd7bee17b))
* bump @types/node from 25.9.1 to 25.9.2 ([#250](https://github.com/dcyfr-labs/dcyfr-ai/issues/250)) ([76979dd](https://github.com/dcyfr-labs/dcyfr-ai/commit/76979dd8582f3cd927b49f0da2085ba431cd4947))
* bump axios from 1.16.1 to 1.17.0 ([#246](https://github.com/dcyfr-labs/dcyfr-ai/issues/246)) ([857b65b](https://github.com/dcyfr-labs/dcyfr-ai/commit/857b65b13f9c337aee0ff6dd0ebe097654a4c143))
* bump commander from 12.1.0 to 15.0.0 ([#233](https://github.com/dcyfr-labs/dcyfr-ai/issues/233)) ([037bc89](https://github.com/dcyfr-labs/dcyfr-ai/commit/037bc896ae95d7b324f1dac98e186c5376be6c80))
* bump eslint from 10.4.0 to 10.4.1 ([#237](https://github.com/dcyfr-labs/dcyfr-ai/issues/237)) ([08b4515](https://github.com/dcyfr-labs/dcyfr-ai/commit/08b4515608beb0240efce7e6937c286c50930a19))
* bump fastmcp from 4.0.1 to 4.0.2 (security: OAuthProxy credential leak fix) ([03efc7c](https://github.com/dcyfr-labs/dcyfr-ai/commit/03efc7cfe5ddb83e10b389e5e1b3423b62702cb7))
* bump hono in the npm_and_yarn group across 1 directory ([#241](https://github.com/dcyfr-labs/dcyfr-ai/issues/241)) ([4eca502](https://github.com/dcyfr-labs/dcyfr-ai/commit/4eca502a13e9c05f3da8f18808c2e41b2ed6eec4))
* bump inquirer from 13.4.3 to 14.0.2 ([#230](https://github.com/dcyfr-labs/dcyfr-ai/issues/230)) ([8638e62](https://github.com/dcyfr-labs/dcyfr-ai/commit/8638e62e93179e37db96b41bd082e9ba861de9ec))
* bump mem0ai from 3.0.3 to 3.0.5 ([#234](https://github.com/dcyfr-labs/dcyfr-ai/issues/234)) ([e757f53](https://github.com/dcyfr-labs/dcyfr-ai/commit/e757f53a0b599be4f0855e8008a6d6cc49d80135))
* bump mem0ai from 3.0.5 to 3.0.6 ([#248](https://github.com/dcyfr-labs/dcyfr-ai/issues/248)) ([6be4cdc](https://github.com/dcyfr-labs/dcyfr-ai/commit/6be4cdc096b9b9a928c4a0ee2b21c5531cc8c787))
* bump openai from 6.39.0 to 6.39.1 ([#238](https://github.com/dcyfr-labs/dcyfr-ai/issues/238)) ([d87127b](https://github.com/dcyfr-labs/dcyfr-ai/commit/d87127bf4b2f9ecfeaf2935d1de79d83636926e4))
* bump typescript-eslint from 8.59.4 to 8.60.0 ([#236](https://github.com/dcyfr-labs/dcyfr-ai/issues/236)) ([a468195](https://github.com/dcyfr-labs/dcyfr-ai/commit/a46819565e677bb88cf1d533905ef4be458580f1))
* bump typescript-eslint from 8.60.0 to 8.60.1 ([#243](https://github.com/dcyfr-labs/dcyfr-ai/issues/243)) ([790a818](https://github.com/dcyfr-labs/dcyfr-ai/commit/790a818900ae575d39504d592f78b6abb0c8e69f))
* bump vitest from 4.1.6 to 4.1.8 ([#231](https://github.com/dcyfr-labs/dcyfr-ai/issues/231)) ([a52a822](https://github.com/dcyfr-labs/dcyfr-ai/commit/a52a82254edc2930de0fa44012f001ecef8bd070))

## [3.2.1](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.2.0...v3.2.1) (2026-06-01)


### Refactoring

* clear 4 CodeQL warnings (dead stores + stale test ctor) ([#224](https://github.com/dcyfr-labs/dcyfr-ai/issues/224)) ([a0c6b1c](https://github.com/dcyfr-labs/dcyfr-ai/commit/a0c6b1c60e5b500b0cda2f26237ac11818cf1032))

## [3.2.0](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.1.0...v3.2.0) (2026-06-01)


### Features

* **mcp:** authenticated Streamable HTTP transport for FastMCP servers ([#222](https://github.com/dcyfr-labs/dcyfr-ai/issues/222)) ([60f3e99](https://github.com/dcyfr-labs/dcyfr-ai/commit/60f3e995659f2112f8e7378eae392ac7b4b1b8c6))

## [3.1.0](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.9...v3.1.0) (2026-05-26)


### Features

* **release:** mint tokens via dcyfr-labs-release GitHub App ([#220](https://github.com/dcyfr-labs/dcyfr-ai/issues/220)) ([b667da3](https://github.com/dcyfr-labs/dcyfr-ai/commit/b667da3dff2234946ccfbe543e4c7ac69d137535))

## [3.0.9](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.8...v3.0.9) (2026-05-25)


### Bug Fixes

* **release:** use PAT with workflow scope for release-please ([#217](https://github.com/dcyfr-labs/dcyfr-ai/issues/217)) ([52da39f](https://github.com/dcyfr-labs/dcyfr-ai/commit/52da39f2b46a4ab0c421b568cfaca749fe13b822))

## [3.0.8](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.7...v3.0.8) (2026-05-25)


### Dependencies

* batch runtime bumps (anthropic, google/genai, langchain, inquirer) ([#215](https://github.com/dcyfr-labs/dcyfr-ai/issues/215)) ([05218b4](https://github.com/dcyfr-labs/dcyfr-ai/commit/05218b47c84b675ad17a59818c44a40e513850e3))
* batch toolchain bumps (typescript-eslint, vitest coverage) ([#214](https://github.com/dcyfr-labs/dcyfr-ai/issues/214)) ([42d9818](https://github.com/dcyfr-labs/dcyfr-ai/commit/42d981829fbc52da59d411cedeb6b461aee83db3))
* bump @supabase/supabase-js from 2.105.4 to 2.106.1 ([#205](https://github.com/dcyfr-labs/dcyfr-ai/issues/205)) ([d09fefb](https://github.com/dcyfr-labs/dcyfr-ai/commit/d09fefb8f31ed5b68372f624aea20dfde486d65e))
* bump cloudflare from 6.2.0 to 6.3.0 ([#212](https://github.com/dcyfr-labs/dcyfr-ai/issues/212)) ([a6e681f](https://github.com/dcyfr-labs/dcyfr-ai/commit/a6e681f83a1ca249bf9f610618870fde59f83942))
* bump openai from 6.38.0 to 6.39.0 ([#213](https://github.com/dcyfr-labs/dcyfr-ai/issues/213)) ([551f7da](https://github.com/dcyfr-labs/dcyfr-ai/commit/551f7da24135619a6efd974bd7909fdc1f380226))
* bump pg from 8.11.3 to 8.21.0 ([#203](https://github.com/dcyfr-labs/dcyfr-ai/issues/203)) ([1d53730](https://github.com/dcyfr-labs/dcyfr-ai/commit/1d5373092f9dd89361c9974c124622712921750d))
* bump qs in the npm_and_yarn group across 1 directory ([#200](https://github.com/dcyfr-labs/dcyfr-ai/issues/200)) ([66c424d](https://github.com/dcyfr-labs/dcyfr-ai/commit/66c424de7f55d0a596ae99cb1ef2e4b2bc2b02e5))
* bump yaml from 2.8.4 to 2.9.0 ([#206](https://github.com/dcyfr-labs/dcyfr-ai/issues/206)) ([aed01d5](https://github.com/dcyfr-labs/dcyfr-ai/commit/aed01d53197609ec07d938add155b9f16f975ca8))

## [3.0.7](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.6...v3.0.7) (2026-05-19)


### Dependencies

* bump groq-sdk from 1.1.2 to 1.2.0 ([#193](https://github.com/dcyfr-labs/dcyfr-ai/issues/193)) ([5f738e1](https://github.com/dcyfr-labs/dcyfr-ai/commit/5f738e15c27948f13f76d5a71598e2cc741333cc))

## [3.0.6](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.5...v3.0.6) (2026-05-19)


### Dependencies

* bump @google/genai from 2.0.1 to 2.4.0 ([#184](https://github.com/dcyfr-labs/dcyfr-ai/issues/184)) ([9492635](https://github.com/dcyfr-labs/dcyfr-ai/commit/9492635a20f653b79bfeaa936f89dea7a5b055fb))
* bump @langchain/core from 1.1.45 to 1.1.46 ([#191](https://github.com/dcyfr-labs/dcyfr-ai/issues/191)) ([f2940d0](https://github.com/dcyfr-labs/dcyfr-ai/commit/f2940d0ed96f5696d55a60e3a834ed4e8db3bc65))
* bump @qdrant/js-client-rest from 1.17.0 to 1.18.0 ([#186](https://github.com/dcyfr-labs/dcyfr-ai/issues/186)) ([54245c5](https://github.com/dcyfr-labs/dcyfr-ai/commit/54245c5a688a6b5e9716833b21a6911a9810f7f6))
* bump @types/node from 25.6.2 to 25.8.0 ([#190](https://github.com/dcyfr-labs/dcyfr-ai/issues/190)) ([49a5d60](https://github.com/dcyfr-labs/dcyfr-ai/commit/49a5d609d8bc0ca55eb1ebd54598b2ebf667d579))
* bump axios from 1.16.0 to 1.16.1 ([#188](https://github.com/dcyfr-labs/dcyfr-ai/issues/188)) ([af55fab](https://github.com/dcyfr-labs/dcyfr-ai/commit/af55fabbe096aceb8758a25002ce1a82a57d7849))
* bump better-sqlite3 from 12.9.0 to 12.10.0 ([#195](https://github.com/dcyfr-labs/dcyfr-ai/issues/195)) ([31ba0b7](https://github.com/dcyfr-labs/dcyfr-ai/commit/31ba0b79eefcd5d73db56b262c1854213d815df7))
* bump cloudflare from 6.1.0 to 6.2.0 ([#185](https://github.com/dcyfr-labs/dcyfr-ai/issues/185)) ([cb9a94a](https://github.com/dcyfr-labs/dcyfr-ai/commit/cb9a94a817593a2223aa235f9b6f05d5edefa021))
* bump eslint from 10.3.0 to 10.4.0 ([#187](https://github.com/dcyfr-labs/dcyfr-ai/issues/187)) ([2b7e16e](https://github.com/dcyfr-labs/dcyfr-ai/commit/2b7e16e526f5e6c53d52085240090a0ac4ef1c7f))
* bump openai from 6.37.0 to 6.38.0 ([#192](https://github.com/dcyfr-labs/dcyfr-ai/issues/192)) ([611a712](https://github.com/dcyfr-labs/dcyfr-ai/commit/611a712a1af4bd012cc5ddf2e8d3c492c987181c))
* bump typescript-eslint from 8.59.2 to 8.59.3 ([#189](https://github.com/dcyfr-labs/dcyfr-ai/issues/189)) ([56a217f](https://github.com/dcyfr-labs/dcyfr-ai/commit/56a217f8aed48734f5f6334a45876e30a010ec10))
* bump vitest from 4.1.5 to 4.1.6 ([#196](https://github.com/dcyfr-labs/dcyfr-ai/issues/196)) ([ccd2f7e](https://github.com/dcyfr-labs/dcyfr-ai/commit/ccd2f7e525bf8e92ce66acb5a11e65c422478c76))
* bump yaml from 2.8.4 to 2.9.0 ([#194](https://github.com/dcyfr-labs/dcyfr-ai/issues/194)) ([aa65245](https://github.com/dcyfr-labs/dcyfr-ai/commit/aa65245cf4bfa2984a7d7c51bde6dc6162bf06af))

## [3.0.5](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.4...v3.0.5) (2026-05-12)


### Bug Fixes

* **security:** strengthen prototype-pollution sanitizer in config loader ([#178](https://github.com/dcyfr-labs/dcyfr-ai/issues/178)) ([e0f5c22](https://github.com/dcyfr-labs/dcyfr-ai/commit/e0f5c22607dd77dab5409002832d397c3d5f3f4a))

## [3.0.4](https://github.com/dcyfr-labs/dcyfr-ai/compare/v3.0.3...v3.0.4) (2026-05-12)


### Bug Fixes

* **release:** align release-please tag format with existing v* tags ([#177](https://github.com/dcyfr-labs/dcyfr-ai/issues/177)) ([b373114](https://github.com/dcyfr-labs/dcyfr-ai/commit/b3731141900425606b7646d72cd8a93e0421f354))

## 3.0.3

### Patch Changes

- [#173](https://github.com/dcyfr-labs/dcyfr-ai/pull/173) [`6c50c05`](https://github.com/dcyfr-labs/dcyfr-ai/commit/6c50c05f7c598f678907f43385eb653f0d2a341b) Thanks [@dcyfr](https://github.com/dcyfr)! - Remove unused `@mistralai/mistralai` dependency.

  The Mistral SDK is not imported anywhere in the codebase — only a description string in `packages/ai/core/provider-registry.ts` references Mistral models served via the GitHub Models API, which doesn't require this SDK.

  Clears downstream Dependabot alert [GHSA-3q49-cfcf-g5fm](https://github.com/advisories/GHSA-3q49-cfcf-g5fm) (malware in `@mistralai/mistralai` 2.2.2 / 2.2.3 / 2.2.4 with an overbroad `>= 0` blanket range that flags safe versions too) for downstream consumers like `dcyfr-labs/dcyfr-labs`.

## 3.0.1

### Patch Changes

- [`b3c3d56`](https://github.com/dcyfr/dcyfr-ai/commit/b3c3d5699812327ddaa42ecb71c2a99324f10fc3) Thanks [@dcyfr](https://github.com/dcyfr)! - Bump runtime SDK dependencies to latest major versions:
  - groq-sdk 0.3.0 → 1.1.1 (used via OpenAI-compatible API, no callsite changes)
  - cloudflare 4.5.0 → 5.2.0 (Cloudflare v5 binding types)
  - better-sqlite3 11.10.0 → 12.6.2 (reputation engine; no BigInt columns, no .safeIntegers() needed)
  - Fix z.record() key type in container/types.ts for Zod 4 compatibility

## 3.0.0

### Major Changes

- [`4dd858f`](https://github.com/dcyfr/dcyfr-ai/commit/4dd858f9da64be2b1700332606046908b8f9748b) Thanks [@dcyfr](https://github.com/dcyfr)! - feat!: Session handoff chain protocol, requires-confirmation workflow, user context files API (v3.0)

  ### Breaking Changes

  **DelegationContract** now requires `handoff_context?: HandoffContext` in the type definition.
  Existing contracts without this field remain valid (optional), but downstream TypeScript consumers
  using strict type checking may see new optional property warnings.

  **SessionHandoffChain** replaces single-session handoff with a chain protocol supporting
  multi-hop handoffs with full context preservation across agent sessions.

  ### New Features

  #### Session Handoff Chain (`@dcyfr/ai/session`)

  - `SessionHandoffChain` class: chain multiple session handoffs without losing conversation history
  - `HandoffContext` type: structured context snapshot passed between sessions
  - `createHandoffChain(sessions)`: factory for creating handoff chains from session arrays
  - Full integration test coverage (14 tests, `session-handoff-chain.integration.test.ts`)

  #### Requires-Confirmation Workflow (`@dcyfr/ai/delegation`)

  - `requiresConfirmation: boolean` flag on `DelegationContract`
  - `ConfirmationWorkflow` class: structured pause-and-log confirmation protocol
  - `pendingConfirmation` contract status for tasks awaiting human approval
  - Confirmation timestamp logging for audit trails

  #### User Context Files API (`@dcyfr/ai/context`)

  - `UserContextFiles` class: progressive disclosure loader for workspace user context files
  - `loadContextFile(name)`: lazy-load individual context files (about-me, brand-voice, etc.)
  - `getAvailableContextFiles()`: list available context files without loading content
  - Template validation against `nexus/context/user/templates/`

  ### Summary

  These additions implement the cowork-inspired improvements inspired by validated practices
  from human-AI collaboration research (January–February 2026 cowork sessions). The session
  handoff chain prevents context loss during long-running multi-agent workflows. The confirmation
  workflow enforces human oversight for destructive or high-stakes operations. User context files
  enable personalized agent behavior without hardcoding user preferences.

  All new APIs are fully tested. No existing APIs removed.

### Minor Changes

- [`096f9d4`](https://github.com/dcyfr/dcyfr-ai/commit/096f9d4e6a2f519d1389f0579b90c758b7dfbd1d) Thanks [@dcyfr](https://github.com/dcyfr)! - feat: Autonomous Agent Runtime — persistent memory, messaging, sessions, skills, scheduling

  New subpath exports bring autonomous agent capabilities to @dcyfr/ai:

  **@dcyfr/ai/memory** — File-first persistent memory with Markdown files, SHA-256 dedup,
  optional SQLite FTS5 hybrid search (BM25 + vector RRF), and working memory persistence.

  **@dcyfr/ai/compaction** — LLM-powered context compaction (pre-flush summarization),
  plus memory compaction (cross-backend dedup, monthly conversation summarization,
  stale fact archival).

  **@dcyfr/ai/skills** — Dynamic skill injection with BM25 search over .md skill files,
  YAML frontmatter parsing, and trust-level filtering.

  **@dcyfr/ai/mcp** — MCP Tool Bridge that discovers tools from MCP servers and converts
  them to AgentRuntime-compatible tool definitions with retry and timeout support.

  **@dcyfr/ai/session** — Session manager with trust-level tool policies (full/sandboxed/
  readonly), overlay memory, idle session tracking, and configurable middleware.

  **@dcyfr/ai/scheduler** — Agent scheduler with built-in cron parser, webhook endpoints,
  event subscriptions, quiet hours, and concurrent execution limits.

  **@dcyfr/ai/gateway** — Platform-agnostic messaging gateway with Telegram, CLI, and HTTP
  adapters, input sanitization, rate limiting, and trust-based access control.

  All modules are tree-shakeable, fully tested (420+ new tests), and backward compatible
  with existing AgentRuntime usage.

- [`af15831`](https://github.com/dcyfr/dcyfr-ai/commit/af158311943bf658b791de40fb6de7161d4fb2e5) Thanks [@dcyfr](https://github.com/dcyfr)! - Repositioned @dcyfr/ai as 'AI agent harness' (infrastructure layer) rather than 'framework' (application structure) for accurate market positioning. Updated package.json, README, AGENTS.md, CONTRIBUTING.md with consistent terminology.

## 2.1.3

### Patch Changes

- [`c000856`](https://github.com/dcyfr/dcyfr-ai/commit/c0008565690dd929b6a8bda55200138f3f692c40) Thanks [@dcyfr](https://github.com/dcyfr)! - Remove workspace-relative import that broke production builds. The `generateDcyfrCapabilityManifests()` function now throws an error instead of attempting to import from workspace paths. Use `generateCapabilityManifest()` directly instead.

## 2.1.2

### Patch Changes

- Remove workspace-relative import that broke production builds. The `generateDcyfrCapabilityManifests()` function now throws an error instead of attempting to import from workspace paths. Use `generateCapabilityManifest()` directly instead.

## 2.1.1

### Patch Changes

- fix: Remove workspace-specific export that broke production builds

  Removed `generateDcyfrCapabilityManifests()` from public API exports. This function contained hardcoded workspace-relative paths that caused Next.js/Turbopack build failures when @dcyfr/ai was installed as an npm package in other projects. The function remains available in source for workspace use but is no longer part of the public API.

  This hotfix resolves the production deployment blocking issue in dcyfr-labs and other consumer projects.

## 2.1.0

### Minor Changes

- [`7660a35`](https://github.com/dcyfr/dcyfr-ai/commit/7660a35224e577cd61ec002949ea0328c5d67891) Thanks [@dcyfr](https://github.com/dcyfr)! - Delegation framework improvements

  - Fixed 584 TypeScript errors to 0 across the workspace
  - Added SQLite-based delegation contract persistence with better-sqlite3
  - Implemented delegation telemetry module for monitoring agent performance
  - Enhanced capability registry with bulk operations and improved search
  - Achieved 75.3% delegation test pass rate (332/441 tests passing)
  - Added comprehensive delegation documentation and examples

  This represents a major stability and functionality improvement to the delegation framework.

- [`45e3e87`](https://github.com/dcyfr/dcyfr-ai/commit/45e3e87320ac85d21320c01ed2b7d1d8d2e0b2dd) Thanks [@dcyfr](https://github.com/dcyfr)! - Ralph Loop V2: prompt rewriting, pattern learning, and token budget management

  - Added `DelegationManager.rewritePrompt()` with four failure-aware strategies: `wrong_direction`, `missing_context`, `wrong_format`, and `stuck_on_complexity` — each queries the memory layer for relevant context before rewriting
  - Added `DelegationManager.runWithRetry()` for automatic retry with exponential backoff, rewriting on each attempt; emits structured `RetryResult` with per-attempt logs and Telegram escalation on persistent failure
  - Added `DelegationManager.learnPattern()` and `queryHighConfidencePattern()` for persistent prompt pattern storage; high-confidence patterns (5+ successes) are applied as shortcuts before full rewrite
  - Added token budget management: `estimateTokens()`, `TokenBudgetInfo` interface, automatic trimming to 80% of the model context window, and verbatim preservation of the 3 most recent injected blocks
  - Exported `TokenBudgetInfo`, `PromptPattern`, `PatternLearningOptions`, `RetryOptions`, `RetryAttempt`, `RetryResult`, `RewriteTask`, `RewriteResult`, `FailureAnalysis` from `@dcyfr/ai`
  - 111 new tests across 5 test files covering all new delegation manager capabilities

### Patch Changes

- [`486b11b`](https://github.com/dcyfr/dcyfr-ai/commit/486b11bee8c4abb88f9eacc2bd16daa72e15c437) Thanks [@dcyfr](https://github.com/dcyfr)! - # Security Update

  Upgrade @qdrant/js-client-rest from 1.13.0 to 1.16.2 to fix 3 moderate-severity undici vulnerabilities:

  - GHSA-g9mf-h72j-4rw9 (unbounded decompression in HTTP responses)
  - GHSA-cxrh-j4jr-qwg3 (DoS via bad certificate data)

  This is a minor version bump with no breaking API changes.

- [`29cd73f`](https://github.com/dcyfr/dcyfr-ai/commit/29cd73fccd4771f52367667bb117bd47f78293d7) Thanks [@dcyfr](https://github.com/dcyfr)! - security: upgrade fastmcp 3.30.1→3.33.0 and downgrade mem0ai 2.2.2→1.0.39 to fix axios vulnerabilities

  Fixed 3 high-severity axios vulnerabilities (GHSA-jr5f-v2jv-69x6 SSRF, GHSA-4hjh-wcwx-xvwj DoS, GHSA-43fc-jf86-j433 DoS) by downgrading mem0ai which had pinned axios@1.7.7. Also upgraded fastmcp to latest version (3.33.0) to improve MCP server performance.

  Security improvements:

  - Removed axios@1.7.7 (vulnerable) from mem0ai dependency tree
  - All axios instances now at 1.13.5+ (safe versions)
  - Workspace vulnerability count reduced from 22 → 18
  - High-severity vulnerabilities reduced from 7 → 5

  Breaking changes:

  - mem0ai downgraded from 2.2.2 → 1.0.39 (MAJOR version downgrade)
  - Limited API compatibility risk due to custom abstraction layer in packages/ai/memory/mem0-client.ts
  - All tests passing (921/921)

## [1.0.4] - 2026-02-12

### Added

#### Version Compatibility Protection

- **Version Skew Protection**: AgentRuntime now performs automatic version compatibility checking during initialization
- **Version Mismatch Warnings**: Clear warning logs when @dcyfr/ai and @dcyfr/ai-agents versions may be incompatible
- **Compatibility Rules**:
  - Major versions must match (1.x.x with 1.x.x)
  - Runtime can be newer minor version than agents
  - Warnings for agents more than 2 minor versions ahead of runtime

#### Upgrade Paths

When upgrading from older versions, follow these compatibility guidelines:

**Same Major Version (Recommended)**

```bash
# For @dcyfr/ai-agents v1.0.x projects
npm install @dcyfr/ai@^1.0.4

# Check compatibility
npm list @dcyfr/ai @dcyfr/ai-agents
```

**Version Mismatch Resolution**

- If you see "Version Mismatch Warning" logs, upgrade both packages to latest:
  ```bash
  npm install @dcyfr/ai@latest @dcyfr/ai-agents@latest
  ```
- For major version differences, check migration guides in documentation

**Enterprise Environments**

- Pin exact versions in package-lock.json for consistent deployments
- Test version combinations in staging before production deployment
- Monitor AgentRuntime initialization logs for version warnings

### Breaking Changes

None. This release maintains full backward compatibility.

### Migration Guide

No migration required. Version checking is automatic and non-breaking.
If you encounter version warnings:

1. Update both @dcyfr/ai and @dcyfr/ai-agents to latest versions
2. Test your agents with the new versions
3. Update peer dependency constraints if needed

## 1.0.3

### Patch Changes

- [`1d6f12e`](https://github.com/dcyfr/dcyfr-ai/commit/1d6f12ed981054fcb0b26beac4be452926ba793f) Thanks [@dcyfr](https://github.com/dcyfr)! - Automated release management and CI improvements

  - Added automated release workflows with changesets
  - Fixed glob TypeScript compatibility issues
  - Improved integration test handling for CI environments
  - Added canary release workflow for pre-release testing
  - Comprehensive CI pipeline with type checking, linting, and tests

All notable changes to @dcyfr/ai will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added

#### Core Framework

- Configuration system with three-layer merge (defaults → project → env)
- Support for YAML, JSON, and package.json configuration formats
- Environment variable overrides for all configuration options
- Zod-based runtime validation for type safety
- Telemetry engine for tracking AI usage and quality metrics
- Provider registry with automatic fallback between AI providers
- Plugin loader with dynamic loading and validation
- Validation framework with parallel/serial execution modes

#### Plugin System

- Plugin manifest validation
- Lifecycle hooks (onLoad, onValidate, onComplete, onUnload)
- Error isolation and recovery
- Configurable failure modes (error, warn, skip)
- Plugin timeout support

#### Telemetry

- Session management with context tracking
- Metric recording (compliance, test pass rate, costs)
- Agent statistics aggregation
- Time-based analytics (7d, 30d, 90d)
- File-based storage with JSON serialization
- Memory storage adapter for testing

#### Provider Support

- Claude (Anthropic)
- Groq
- Ollama
- GitHub Copilot
- OpenAI
- Generic provider interface

#### CLI Tools

- `init` - Initialize new project
- `config:init` - Create configuration file
- `config:validate` - Validate configuration
- `config:schema` - Show configuration schema
- `plugin:create` - Generate plugin template

#### Documentation

- Comprehensive getting started guide
- Complete API reference
- Plugin development guide
- Standalone Next.js example project
- Migration documentation

#### Configuration Templates

- Default YAML configuration
- Default JSON configuration
- Minimal configuration templates

### Quality

- 49 passing tests (100% pass rate)
- Full TypeScript strict mode
- ~200KB bundle size
- <2s build time
- Zero breaking changes in API surface

### Developer Experience

- Type-safe configuration with Zod
- ESM modules with .d.ts declarations
- Comprehensive error messages
- CLI with helpful output and examples
- Hot module replacement support

## [Unreleased]

### Planned

- Redis storage adapter for telemetry
- Database storage adapter
- Additional validation gates
- Performance profiling tools
- Cloud-hosted validation service
- Multi-language bindings

---

[1.0.0]: https://github.com/dcyfr/dcyfr-ai/releases/tag/v1.0.0
