# `@navikt/vite-mode`

Use a local Vite dev server as the frontend for a deployed Express application.

The deployed server keeps handling authentication, API proxies and other backend routes, while the browser loads React and Vite assets from `localhost`. This is useful when developing against a deployed dev environment without mocking its services.

> [!WARNING]
> Only enable Vite mode in environments where loading local code is acceptable. Enabling it in production lets a user run local frontend code with the production application's access and cookies.

## Installation

`@navikt/vite-mode` is published to the Nav GitHub Packages registry and requires Express 5.

```bash
npm install @navikt/vite-mode
```

Configure the registry in `.npmrc`:

```ini
@navikt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

The token needs `read:packages` and access to the `navikt` organization.

## Quick start

Configure the deployed Express server:

```ts
import path from "node:path";

import { addServeSpaHandler, serveViteMode } from "@navikt/vite-mode";
import express from "express";

const app = express();
const spaFilePath = path.resolve("./public/index.html");

app.use(express.static("./public", { index: false }));

serveViteMode(app, {
  port: "5173",
});

addServeSpaHandler(app, spaFilePath);
```

The static middleware must use `index: false`. Otherwise, Express serves the built `index.html` before Vite mode can replace it.

Configure Vite so assets and cross-origin requests work from the deployed page:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    origin: "http://localhost:5173",
    cors: {
      origin: ["https://my-app.intern.dev.nav.no"],
    },
  },
});
```

Start Vite locally, then open the deployed application with `/vite-on` appended:

```text
https://my-app.intern.dev.nav.no/vite-on
```

The server sets a `use-local-vite-server` cookie and redirects back to the application. Use `/vite-off`, or the link rendered in the Vite mode page, to return to the deployed frontend.

## Custom HTML handling

Use `addViteModeHtmlToResponse` when the server must transform the HTML before sending it, for example to inject the Nav decorator or runtime configuration:

```ts
import { addViteModeHtmlToResponse } from "@navikt/vite-mode";
import { Router } from "express";

const router = Router();

addViteModeHtmlToResponse(router, {
  port: "5173",
  subpath: "/min-app",
  mountId: "app",
  indexFilePath: "src/bootstrap.tsx",
});

router.get("*splat", async (request, response, next) => {
  if (response.viteModeHtml) {
    const html = await injectDecorator(response.viteModeHtml);
    response.send(html);
    return;
  }

  next();
});
```

This function registers the `/vite-on` and `/vite-off` routes and stores the generated document in `response.viteModeHtml`. The application remains responsible for sending the response.

## Options

All options are optional.

| Option              | Default                         | Description                                                                                      |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `port`              | `"5173"`                        | Port used by the local Vite server.                                                              |
| `subpath`           | `""`                            | Public path for an application mounted below the ingress root. Also scopes the Vite mode cookie. |
| `mountId`           | `"root"`                        | ID of the HTML element where the frontend mounts.                                                |
| `indexFilePath`     | `"src/main.tsx"`                | Frontend entrypoint loaded from the Vite server.                                                 |
| `colorTheme`        | `"#ff8800"`                     | Color used for the Vite mode outline and off button.                                             |
| `useNonce`          | `true`                          | Adds the generated nonce to the CSP rules required by the inline React refresh script.           |
| `cspHeaderOptions`  | `{ kind: "modifyForViteMode" }` | Controls how the existing Content Security Policy is handled.                                    |
| `templateTransform` | Identity function               | Transforms the generated HTML before placeholders are replaced.                                  |

## Content Security Policy

By default, Vite mode extends the existing CSP with the localhost HTTP/WebSocket sources required for scripts, images and hot reload. It also removes `upgrade-insecure-requests`, because the local server uses HTTP and WS.

```ts
addViteModeHtmlToResponse(router, {
  cspHeaderOptions: {
    kind: "modifyForViteMode",
  },
});
```

Keep the CSP unchanged when it is handled elsewhere:

```ts
addViteModeHtmlToResponse(router, {
  cspHeaderOptions: {
    kind: "doNotModify",
  },
});
```

Or transform the current header:

```ts
import { ViteModeCspPolicy } from "@navikt/vite-mode";

addViteModeHtmlToResponse(router, {
  cspHeaderOptions: {
    kind: "transformInCallback",
    transformCspString: (currentCsp) =>
      new ViteModeCspPolicy(currentCsp)
        .removeDirective(ViteModeCspPolicy.cspDirectiveNames.upgradeInsecureRequests)
        .asString(),
  },
});
```

`ViteModeCspPolicy` also supports adding, removing and merging directives.

## Exported API

| Export                                    | Purpose                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `serveViteMode(app, options)`             | Registers Vite mode and sends the generated HTML automatically.                |
| `addViteModeHtmlToResponse(app, options)` | Registers Vite mode and exposes the generated HTML on `response.viteModeHtml`. |
| `addServeSpaHandler(app, path)`           | Adds an Express 5 catch-all route that serves an SPA file.                     |
| `ViteModeCspPolicy`                       | Parses and modifies Content Security Policy strings.                           |

## Development

```bash
npm ci
npm run lint
npm run types:check
npm run build
```

## License

[MIT](https://opensource.org/license/mit)
