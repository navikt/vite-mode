import * as crypto from "node:crypto";

import cookieParser from "cookie-parser";
import { Express, IRouter, Response } from "express";

type ViteModeOptions = typeof DEFAULT_VITE_OPTIONS;

const DEFAULT_VITE_OPTIONS = {
  port: "5173",
  subpath: "",
  mountId: "root",
  useNonce: true, // TODO: explain
  indexFilePath: "src/main.tsx",
  colorTheme: "#ff8800", // Inspired by Vite's color scheme
  setCSPHeaders: true,
};

// Add "viteModeHtml" as a possible property on the Express Response type
declare module "express-serve-static-core" {
  interface Response {
    viteModeHtml?: string;
  }
}

/**
 * Allow you to serve your local vite-dev-server at localhost:$PATH/$SUBPATH, from a deployed Frackend.
 *
 * This function adds two handlers to your app:
 * - /vite-on
 * - /vite-off
 *
 * When turned on, a cookie is set to tell this middleware to intercept "*" and serve another index.html that
 * targets the vite-server you have running on localhost:$PORT/SUBPATH instead of the bundled production code.
 *
 * IMPORTANT: if you use `express.static` to serve your assets, be aware that it will also intercept your "/" route and serve your index.html
 * This will block this middleware from toggling which file is served. To avoid that, exclude the static middleware from serve index.html like this:
 *
 * `express.static("./public", { index: false })`
 *
 * Options:
 *
 *    - `port`     Which port is your vite dev-server running on
 *    - `mountId`    What is the css id of your app mounting point. Usually `root`, `app` or similar
 *    - `indexFilePath` relative path to the entrypoint of your application. Usually `/src/main.tsx` or `/src/index.tsx`
 *    - `subpath`  Normally your Vite app runs on the root of the ingress "/". But sometimes it could be on a subpath, like different apps that run at nav.no/some-app/home
 *    - `colorTheme` customize your color scheme that indicates vite-mode is on
 *
 * vite-on and vite-off uses strict-origin-when-cross-origin: enables us to land on the same path when turning mode on/off. Without we would always redirect to "/".
 */
export function addViteModeHtmlToResponse(app: IRouter, options: Partial<ViteModeOptions>) {
  app.use(cookieParser());
  app.use((request, response, next) => {
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    return next();
  });

  app.get("{*splat}/vite-on", (request, response) => {
    setViteCookie(response, true, options.subpath);
    const redirectUrl = request.originalUrl.replace(/\/vite-on$/, "") || "/";

    return response.redirect(redirectUrl);
  });
  app.get("{*splat}/vite-off", (request, response) => {
    setViteCookie(response, false, options.subpath);

    const referer = request.headers.referer ?? "";
    const host = `http://${request.headers.host}`;

    const redirectUrl = referer.replace(host, "") || request.originalUrl.replace(/\/vite-off$/, "");
    return response.redirect(redirectUrl);
  });
  app.get("*splat", (request, response, next) => {
    const localViteServerIsEnabled = request.cookies["use-local-vite-server"] === "true";
    if (localViteServerIsEnabled) {
      const mergedOptions = { ...DEFAULT_VITE_OPTIONS, ...options };
      serveLocalViteServer(response, mergedOptions);
    }
    return next();
  });
}

/**
 * This can be used to automatically serve ViteMode. Use this if you don't need the decorator
 */
export function serveViteMode(app: IRouter, options: Partial<ViteModeOptions>) {
  addViteModeHtmlToResponse(app, options);
  app.get("*splat", (request, response, next) => {
    const viteModeHtml = response.viteModeHtml;
    if (viteModeHtml) {
      response.send(viteModeHtml);
      return;
    }
    return next();
  });
}

function setViteCookie(response: Response, cookieValue: boolean, subpath: string | undefined) {
  response.cookie("use-local-vite-server", cookieValue, {
    httpOnly: false,
    secure: false,
    sameSite: "lax",
    path: subpath || "/",
  });
}

/**
 * Use this as a catch-all route for serving a Single-Page-Application (SPA)
 *
 * Traditionally your html would be served from `/index.html`,
 * but with modern SPA you would want the same file to be served from almost any url submitted to the server,
 * leaving it to the client-side router to interpret and handle url changes
 */
export function addServeSpaHandler(app: Express, pathToSpaFile: string) {
  app.get("*splat", (request, response) => {
    return response.sendFile(pathToSpaFile);
  });
}
function serveLocalViteServer(response: Response, options: ViteModeOptions) {
  const nonce = crypto.randomBytes(16).toString("base64");

  const template = localViteServerTemplate
    .replaceAll("$PATH", `${options.port}${options.subpath}`)
    .replaceAll("$MOUNT_ID", options.mountId)
    .replaceAll("$COLOR_THEME", options.colorTheme)
    .replace("$NONCE", nonce)
    .replaceAll("$INDEX_FILE_PATH", options.indexFilePath);

  if (options.setCSPHeaders) {
    response.setHeader(
      "Content-Security-Policy",
      mergeCSP([response.getHeaders()["content-security-policy"] ?? "", getCSP(nonce, options)]),
    );
  }

  response.viteModeHtml = template;
}

/**
 * We need the following CSP:
 * script-src-elem: to enable the inline script that makes refresh work
 * connect-src: to enable actual live reloading through websocket
 * img-src: to enable loading images from the dev-server instead of the actual server
 */
function getCSP(nonce: string, options: ViteModeOptions) {
  const httpAddress = `http://localhost:${options.port}`;
  const wsAddress = `ws://localhost:${options.port}`;
  const nonceCSP = options.useNonce ? `'nonce-${nonce}'` : "";
  return `script-src-elem ${nonceCSP} ${httpAddress} 'self'; connect-src 'self' ${wsAddress}; img-src 'self' ${httpAddress}`;
}

/**
 * Algorithm for merging cspHeaders. Author-credit: ChatGPT
 */
function mergeCSP(cspHeaders: string[]) {
  const combinedCSP: Record<string, Set<string>> = {};

  for (const csp of cspHeaders) {
    const directives = csp.split(";");

    for (const directive of directives) {
      const [name, ...values] = directive.trim().split(/\s+/);

      if (!name) continue;

      if (!combinedCSP[name]) {
        combinedCSP[name] = new Set();
      }

      for (const value of values) {
        combinedCSP[name].add(value);
      }
    }
  }

  // Convert combinedCSP object to CSP header string
  let combinedCSPHeader = "";
  for (const [name, values] of Object.entries(combinedCSP)) {
    combinedCSPHeader += `${name} ${[...values].join(" ")}; `;
  }

  return combinedCSPHeader.trim();
}

const localViteServerTemplate = `
<!DOCTYPE html>
<html lang="no">
  <head>
      <script type="module" nonce="$NONCE">
          import RefreshRuntime from 'http://localhost:$PATH/@react-refresh'
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
      </script>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>[VITE-MODE]</title>
      <style>
         #$MOUNT_ID {
            outline: 4px solid $COLOR_THEME;
            outline-offset: -4px;
          }
          #dev-mode {
              position: fixed;
              padding: 4px;
              border: black;
              background: $COLOR_THEME;
              border-radius: 4px;
              right: 10px;
              bottom: 50px;
              cursor: pointer;
          }
  
          #explain-why-no-dev-server:has(~ #$MOUNT_ID:empty) {
              visibility: visible;
          }
      </style>
  </head>
  <body>
    <span id="dev-mode"><a href="vite-off">Skru av Vite-mode</a></span>
    <div id="$MOUNT_ID"></div>
    <!--Sonarcloud vil klage på at disse script-tagsa ikke har en integrity checksum.-->
    <!--Jeg anser det som fair å ignorere den. Scriptene peker kun til lokal maskin og denne filen serveres ikke i prod.-->
    <!--Det ville heller ikke latt seg gjøre å ha en integrity hash, da hele poenget med denne funksjonaliteten er at scriptene kan forandre seg for å teste lokal app i dev-miljø-->
    <script type="module" src="http://localhost:$PATH/@vite/client"></script>
    <script type="module" src="http://localhost:$PATH/$INDEX_FILE_PATH"></script>
  </body>
</html>
`;
