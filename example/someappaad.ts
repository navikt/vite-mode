import express from "express";

import { requireEnvironmentProxySpec } from "../src/config";
import { Frackend, frackendEnvironment } from "../src/frackend";

const app = express();

const frackend = new Frackend(app, "");
const tcatProxySpec = requireEnvironmentProxySpec("TCAT_PROXYSPEC");
const nomapiProxySpec = requireEnvironmentProxySpec("NOMAPI_PROXYSPEC");

frackend.addActuators();
frackend.addCookieParserHandler();

if (!frackendEnvironment.isLocal()) {
  frackend.addRequireValidAadTokenHandler();
}

frackend.addAadProxyHandler("/teamcat", tcatProxySpec);
frackend.addAadProxyHandler("/nom", nomapiProxySpec);

frackend.addServeSpaWithViteDevmodeHandler();

app.listen(8080);
