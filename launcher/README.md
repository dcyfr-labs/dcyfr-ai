# dcyfr-ai — official launcher for `@dcyfr/ai`

This package is the **official `npx` launcher** for
[`@dcyfr/ai`](https://www.npmjs.com/package/@dcyfr/ai), published by
[DCYFR Labs](https://github.com/dcyfr-labs). It contains no CLI logic of its
own: it resolves the `dcyfr-ai` binary from its `@dcyfr/ai` dependency and
re-executes it with your arguments, stdio, and exit status. The whole
implementation is one ~100-line script:
[`bin/forward.js`](https://github.com/dcyfr-labs/dcyfr-ai/blob/main/launcher/bin/forward.js).

## Why this package exists

- The harness is published as `@dcyfr/ai`, but its command is `dcyfr-ai`.
  `npx @dcyfr/ai …` fails with *"could not determine executable to run"*
  because the package ships more than one binary, and `npx dcyfr-ai …` only
  works without a prior install if a registry package named `dcyfr-ai`
  exists. This package is that name, so the documented commands work
  cold — see [dcyfr-labs/dcyfr-ai#253](https://github.com/dcyfr-labs/dcyfr-ai/issues/253).
- The unscoped `dcyfr-ai` name was briefly published and unpublished by a
  third party on 2026-01-27, which left it claimable by anyone. DCYFR Labs
  holds it so `npx dcyfr-ai …` always resolves to code from
  [dcyfr-labs/dcyfr-ai](https://github.com/dcyfr-labs/dcyfr-ai).

## Usage

```bash
npx dcyfr-ai config:init
npx dcyfr-ai config:validate
npx dcyfr-ai --help
```

For real project use, depend on the harness directly:

```bash
npm install @dcyfr/ai
npx dcyfr-ai <command>   # now resolves the local @dcyfr/ai bin
```

> **Note:** don't install both `dcyfr-ai` (this launcher) and `@dcyfr/ai`
> globally — both declare the `dcyfr-ai` command, and npm will refuse to
> link the second one. Pick one; for permanent installs prefer `@dcyfr/ai`.

## How it works

- `@dcyfr/ai` is a caret-range dependency (`^3.x`), so the launcher runs
  whatever v3 release npm resolves at install time — the same code you would
  get from `npm install @dcyfr/ai` yourself. There is no third-party code in
  the path.
- The launcher spawns the resolved bin with the Node that is already running
  it (`process.execPath`), never a `node` found on `PATH`.
- Arguments, stdin/stdout/stderr, and the exit code (including fatal
  signals) pass through unchanged.

## Security

Report vulnerabilities per the harness's
[SECURITY.md](https://github.com/dcyfr-labs/dcyfr-ai/blob/main/SECURITY.md).
Source for this launcher lives in the main repository under
[`launcher/`](https://github.com/dcyfr-labs/dcyfr-ai/tree/main/launcher).

## License

[MIT](https://github.com/dcyfr-labs/dcyfr-ai/blob/main/LICENSE) © DCYFR Labs
