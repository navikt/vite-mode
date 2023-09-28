import express from "express";

import { requireEnvironmentDeployment, requireEnvironmentProxySpec } from "../src/config";
import { Frackend } from "../src/frackend";

const skjermingProxySpec = requireEnvironmentProxySpec("SKJERMING_PROXYSPEC");
const nomapiProxySpec = requireEnvironmentProxySpec("NOMAPI_PROXYSPEC");
const enableSecurity = requireEnvironmentDeployment("ENVCTX") !== "LOCAL";

const app = express();

const frackend = new Frackend(app, "person/personopplysninger/skjerming");

frackend.addActuators();

frackend.addCookieParserHandler();

if (enableSecurity) {
  frackend.addRequireValidIdportenTokenHandler();
}

frackend.addIdportenProxyHandler("/skjerming-api", skjermingProxySpec);
frackend.addIdportenProxyHandler("/nom-api", nomapiProxySpec);

frackend.addServeSpaWithViteDevmodeHandler();

app.listen(8080);
