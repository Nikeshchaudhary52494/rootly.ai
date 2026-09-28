# @rootly.ai/node

Node.js SDK for reporting application errors to rootly.ai.

```ts
import { RootlyAI } from "@rootly.ai/node";

const rootlyAI = new RootlyAI({
  apiKey: process.env.ROOTLY_AI_API_KEY!,
  // Base URL of the rootly.ai API (apps/api) that receives events, not your own app's URL.
  // Local dev: http://localhost:3001. Production: your deployed rootly.ai API, e.g. https://api.your-domain.com
  serverUrl: process.env.ROOTLY_AI_SERVER_URL!,
  serviceName: "payment-service",
  environment: "production",
  release: "1.0.0",
  debug: true,
});

rootlyAI.init(); // wires up uncaughtException / unhandledRejection

rootlyAI.captureException(error);
rootlyAI.captureMessage("Something unexpected happened");
```

## Config

| Field | Required | Default |
|---|---|---|
| `apiKey` | yes | — |
| `serviceName` | yes | — |
| `environment` | yes | — |
| `serverUrl` | no, but **set it outside local dev** | `http://localhost:3001` |
| `release` | no | — |
| `debug` | no | `false` |
| `enabled` | no | `true` |

`serverUrl` is where the SDK POSTs events (`{serverUrl}/events`, with `Authorization: Bearer <apiKey>`).
It must point at the rootly.ai API and be reachable from the monitored app. If you leave it unset
outside local dev, the SDK falls back to `localhost:3001`, the send fails, and events are silently
dropped (send errors never reach your app; use `debug: true` to see them).

## Behavior

- Never throws into the host application — capture and send are best-effort.
- `enabled: false` disables sending entirely (capture calls become no-ops).
- Delivery is send-immediately, no local queue/retry/batching yet (the `Transport`
  interface in `src/transport/http.transport.ts` is intentionally narrow so a
  future batching/retry transport can drop in without changing the public API).
- Debug logs (`debug: true`) never include the API key or Authorization header.

Build: `npm run build --workspace=@rootly.ai/node`. Consumed locally via the npm
workspace; not yet published to npm.
