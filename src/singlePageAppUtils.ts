import * as crypto from "node:crypto";

import cookieParser from "cookie-parser";
import { Express, Response } from "express";

type ViteModeOptions = typeof DEFAULT_VITE_OPTIONS;

const DEFAULT_VITE_OPTIONS = {
  port: "5173",
  mountId: "app",
  indexFilePath: "/src/main.tsx",
  colorTheme: "#DE2E2E", // Red 400
};

/**
 * Allow you to serve your local vite-dev-server at localhost:$PORT, from a deployed Frackend.
 *
 * This function adds two handlers to your app:
 * - /vite-on
 * - /vite-off
 *
 * When turned on, a cookie is set to tell this middleware to intercept "*" and serve another index.html that
 * targets the vite-server you have running on localhost:$PORT instead of the bundled production code.
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
 */
export function addLocalViteServerHandler(app: Express, options: Partial<ViteModeOptions>) {
  app.use(cookieParser());

  app.get("/vite-on", (request, response) => {
    setViteCookie(response, true);
    return response.redirect("/");
  });

  app.get("/vite-off", (request, response) => {
    setViteCookie(response, false);
    return response.redirect("/");
  });

  app.get("*", (request, response, next) => {
    const localViteServerIsEnabled = request.cookies["use-local-vite-server"] === "true";

    if (localViteServerIsEnabled) {
      const mergedOptions = { ...DEFAULT_VITE_OPTIONS, ...options };
      return serveLocalViteServer(response, mergedOptions);
    }

    return next();
  });
}

function setViteCookie(response: Response, cookieValue: boolean) {
  response.cookie("use-local-vite-server", cookieValue, {
    httpOnly: false,
    secure: false,
    sameSite: "lax",
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
  app.get("*", (request, response) => {
    return response.sendFile(pathToSpaFile);
  });
}

function serveLocalViteServer(response: Response, options: ViteModeOptions) {
  const template = localViteServerTemplate
    .replaceAll("$PORT", options.port)
    .replaceAll("$MOUNT_ID", options.mountId)
    .replaceAll("$INDEX_FILE_PATH", options.indexFilePath);

  response.setHeader("Content-Security-Policy", getCSP(template, options));
  return response.send(template);
}

function getCSP(html: string, options: ViteModeOptions) {
  const VITE_DEV_MODE_SCRIPT_HASH = `sha256-${crypto.createHash("sha256").update(html).digest("base64")}`;

  return `script-src-elem '${VITE_DEV_MODE_SCRIPT_HASH}' http://localhost:${options.port} 'self'; connect-src 'self' 'ws://localhost:${options.port}'`;
}

const localViteServerTemplate = `
<!DOCTYPE html>
<html lang="no">
  <head>
      <script type="module">
          import RefreshRuntime from 'http://localhost:$PORT/@react-refresh'
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
      </script>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>[DEVMODE]</title>
      <style>
          #dev-mode {
              position: absolute;
              left: 20px;
              top: 30px;
              cursor: pointer;
          }
  
          #explain-why-no-dev-server {
              visibility: hidden;
              position: absolute;
              left: 100px;
              top: 100px;
              font-size: 20px;
          }
  
          #explain-why-no-dev-server:has(~ #$MOUNT_ID:empty) {
              visibility: visible;
          }
      </style>
  </head>
  <body>
    <span class="navds-tag navds-tag--success" id="dev-mode"><a href="/vite-off">Skru av DEVMODE</a></span>
    <div id="explain-why-no-dev-server">
        Det ser ikke ut som du har en Vite dev-server kjørende.<br />
        Vær obs på at frontend er nødt til å kjøre på <code>http://localhost:$PORT</code><br />
        eller <a href="/vite-off">skru av Vite-mode</a>
    </div>
    <div id="$MOUNT_ID"></div>
    <!--Sonarcloud vil klage på at disse script-tagsa ikke har en integrity checksum.-->
    <!--Jeg anser det som fair å ignorere den. Scriptene peker kun til lokal maskin og denne filen serveres ikke i prod.-->
    <!--Det ville heller ikke latt seg gjøre å ha en integrity hash, da hele poenget med denne funksjonaliteten er at scriptene kan forandre seg for å teste lokal app i dev-miljø-->
    <script type="module" src="http://localhost:$PORT/@vite/client" />
    <script type="module" src="http://localhost:$PORT/$INDEX_FILE_PATH" />
  </body>
</html>
`;
