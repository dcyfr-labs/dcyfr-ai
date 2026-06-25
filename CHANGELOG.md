# Changelog

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
