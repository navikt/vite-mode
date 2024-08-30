import cookieParser from "cookie-parser";
import { Express, Response } from "express";

/**
 * Allow you to serve your local vite-dev-server at localhost:5173, from a deployed Frackend.
 *
 * This function adds two handlers to your app:
 * - /vite-on
 * - /vite-off
 *
 * When turned on, a cookie is set to tell this middleware to intercept "*" and serve another index.html that
 * targets the vite-server you have running on localhost:5173 instead of the bundled production code.
 *
 * IMPORTANT: if you use `express.static` to serve your assets, be aware that it will also intercept your "/" route and serve your index.html
 * This will block this middleware from toggling which file is served. To avoid that, exclude the static middleware from serve index.html like this:
 *
 * `express.static("./public", { index: false })`
 */
export function addLocalViteServerHandler(app: Express, port: string) {
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
      return serveLocalViteServer(response, port);
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

function serveLocalViteServer(response: Response, port: string) {
  return response.send(localViteServerTemplate.replaceAll("5173", port));
}

const localViteServerTemplate = `
<!DOCTYPE html>
<html lang="no">
<head>
    <script type="module">
        import RefreshRuntime from 'http://localhost:5173/@react-refresh'
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

        #explain-why-no-dev-server:has(~ #root:empty) {
            visibility: visible;
        }
    </style>
</head>
<body>
<span class="navds-tag navds-tag--success" id="dev-mode"><a href="/vite-off">Skru av DEVMODE</a></span>
<div id="explain-why-no-dev-server">
    Det ser ikke ut som du har en lokal frontend kjørende.<br />
    Vær obs på at frontend er nødt til å kjøre på <code>http://localhost:5173</code><br />
    eller <a href="/vite-off">skru av DEVMODE</a>
</div>
<div id="root"></div>
<script type="module" src="http://localhost:5173/@vite/client"></script>
<script type="module" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>
`;
