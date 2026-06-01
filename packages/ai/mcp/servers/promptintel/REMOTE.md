# Running `dcyfr-promptintel` as a remote MCP connector

By default this server speaks **stdio** (local only). It can also run over
FastMCP's **Streamable HTTP** transport so it is reachable as a *remote* MCP
server — a Claude Desktop / Anthropic API custom connector today, and the
foundation for a claude.ai Custom Connector.

Transport selection lives in [`../shared/transport.ts`](../shared/transport.ts)
and is shared by all DCYFR FastMCP servers (stdio remains the default for every
one of them; nothing changes unless you opt in).

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PROMPTINTEL_API_KEY` | — (required) | Upstream PromptIntel API key (server→`api.promptintel.novahunting.ai`). Server-side secret. |
| `MCP_TRANSPORT` | `stdio` | Set to `httpStream` to expose over HTTP. |
| `MCP_HTTP_PORT` | `8080` | Listen port for `httpStream`. |
| `MCP_HTTP_ENDPOINT` | `/mcp` | MCP endpoint path (also serves SSE at `/sse`). |
| `MCP_HTTP_STATELESS` | `false` | `true` for stateless sessions (simpler load-balancing). |
| `MCP_BEARER_TOKEN` | — | **Required for `httpStream`.** Comma-separated allow-list of bearer tokens. The server refuses to bind an HTTP port without it. |

> **Fail-closed.** `promptintel` exposes a write tool (`submitReport`). The server
> will **refuse to start** over `httpStream` if `MCP_BEARER_TOKEN` is unset, and
> rejects any request without a valid `Authorization: Bearer <token>` header
> (constant-time compared).

## Run it locally over HTTP

```bash
PROMPTINTEL_API_KEY=<upstream-key> \
MCP_TRANSPORT=httpStream \
MCP_HTTP_PORT=8080 \
MCP_BEARER_TOKEN=$(openssl rand -hex 32) \
  npx tsx packages/ai/mcp/servers/promptintel/index.ts
# → ✅ dcyfr-promptintel started (httpStream) on http://0.0.0.0:8080/mcp — bearer auth enforced
```

## Connect from an MCP client

**Anthropic API (`mcp_servers` block)** — works today with the bearer token:

```jsonc
{
  "mcp_servers": [
    {
      "type": "url",
      "url": "https://<your-host>/mcp",
      "name": "dcyfr-promptintel",
      "authorization_token": "<one of MCP_BEARER_TOKEN>"
    }
  ]
}
```

**Claude Desktop** — add as a custom connector pointing at the HTTPS URL with the
bearer header.

## Promoting to a claude.ai Custom Connector (follow-on, operator + infra)

claude.ai's native Custom Connector flow expects **public HTTPS + OAuth 2.1**.
Two remaining steps, both outside this code change:

1. **Deploy** behind TLS on a public host (the `dcyfr-*` Vercel/edge fleet or a
   container). Terminate HTTPS in front; keep `MCP_BEARER_TOKEN` for non-OAuth
   clients.
2. **OAuth** — FastMCP v4 ships a built-in **OAuth Proxy** (`auth` option:
   DCR + PKCE + token management). Swap `authenticate` for the `auth` proxy
   pointing at the DCYFR identity provider, then register the connector URL in
   claude.ai. No bespoke authorization server required.

Until then, the bearer-gated Streamable HTTP endpoint is a fully functional,
secured remote MCP server for Desktop and API clients.
