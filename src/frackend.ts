import path from "node:path";

import cookieParser from "cookie-parser";
import express, { Application, Express, NextFunction, Request, Response, Router } from "express";
import { expressjwt, GetVerificationKey } from "express-jwt";
import { createProxyMiddleware } from "http-proxy-middleware";
import jwksRsa from "jwks-rsa";

import config, { requireEnvironment } from "./config";
import { addAadOnBehalfOfToken } from "./onbehalfofaad";
import { TokenX } from "./onbehalfoftokenx";
import { getOboTokenForRequest } from "./sessionCache";
import { addLocalViteServerHandler, addServeSpaHandler } from "./singlePageAppUtils";

export type ProxySpec = {
  url: string;
  scope: string;
};

interface JwtVerificationContext {
  jwkUri: string;
  issuer: string;
  clientId: string;
}

export class Frackend {
  public express: Application | Express | Router;
  public prefixPath: string;
  private tokenx?: TokenX;

  constructor(express: Application | Express | Router, prefixPath: string) {
    this.express = express;
    this.prefixPath = prefixPath;
  }

  addAadProxyHandler(ingoingUrl: string, proxySpec: ProxySpec) {
    // cast is necessary to please typescript. Sum types confuse it,
    // even when each summed type indvidually is accepted
    (this.express as Express).use(
      this.prefixPath + ingoingUrl,
      (request: Request, response: Response, next: NextFunction) =>
        addAadOnBehalfOfToken(request, response, next, proxySpec.scope),
      createProxyMiddleware({
        target: proxySpec.url,
        changeOrigin: true,
        logger: console,
        on: {
          proxyReq: (proxyRequest, request) => {
            const accessToken = getOboTokenForRequest(request, proxySpec.scope)?.access_token;
            if (accessToken) {
              proxyRequest.setHeader("Authorization", `Bearer ${accessToken}`);
            } else {
              console.log(`Access token var not present in session for scope ${proxySpec.scope}`);
            }
          },
        },
      }),
    );
  }

  addIdportenProxyHandler(ingoingUrl: string, proxySpec: ProxySpec) {
    const tokenX = this.getTokenXInstance();

    (this.express as Express).use(
      this.prefixPath + ingoingUrl,
      (request: Request, response: Response, next: NextFunction) =>
        tokenX.addTokenXOnBehalfOfToken(request, response, next, proxySpec.scope),
      createProxyMiddleware({
        target: proxySpec.url,
        changeOrigin: true,
        logger: console,
        on: {
          proxyReq: (proxyRequest, request) => {
            const accessToken = getOboTokenForRequest(request, proxySpec.scope)?.access_token;
            if (accessToken) {
              proxyRequest.setHeader("Authorization", `Bearer ${accessToken}`);
            } else {
              console.log(`Access token var not present in session for scope ${proxySpec.scope}`);
            }
          },
        },
      }),
    );
  }

  addActuators(actuatorPaths?: { alive: string; ready: string }) {
    const alive = actuatorPaths?.alive ?? "/internal/health/liveness";
    const ready = actuatorPaths?.ready ?? "/internal/health/readiness";
    (this.express as Express).get(this.prefixPath + alive, (request, response) => {
      response.send({
        status: "UP",
      });
    });
    console.log("Liveness available on " + alive);

    (this.express as Router).get(this.prefixPath + ready, (request, response) => {
      response.send({
        status: "UP",
      });
    });
    console.log("Readiness available on " + ready);
  }

  addRequireValidAadTokenHandler() {
    const azureConfig = config.azureAd();
    const azureContext: JwtVerificationContext = {
      jwkUri: azureConfig.openIdJwkUris,
      clientId: azureConfig.clientId,
      issuer: azureConfig.issuer,
    };
    (this.express as Express).use(this.createJwtVerifier(azureContext));
  }

  addRequireValidIdportenTokenHandler() {
    const idportenConfig = config.idporten();
    const idportenContext: JwtVerificationContext = {
      jwkUri: idportenConfig.jwksUri,
      clientId: idportenConfig.clientId,
      issuer: idportenConfig.issuer,
    };
    (this.express as Express).use(this.createJwtVerifier(idportenContext));
  }

  private createJwtVerifier(verificationContext: JwtVerificationContext) {
    return expressjwt({
      secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: verificationContext.jwkUri,
      }) as GetVerificationKey,

      algorithms: ["RS256"],
      audience: verificationContext.clientId,
      issuer: verificationContext.issuer,
    });
  }

  private getTokenXInstance() {
    if (!this.tokenx) {
      this.tokenx = new TokenX();
    }
    return this.tokenx;
  }

  public addServeSpaWithViteDevmodeHandler(bundleRelativePath: string = "./public") {
    const router = express.Router();
    (router as Express).use(express.static(bundleRelativePath, { index: false }));

    // When deployed, the built frontend is copied into the public directory. If running BFF locally the directory will not exist.
    const spaFilePath = path.resolve(bundleRelativePath, "index.html");

    addLocalViteServerHandler(router as Express);
    addServeSpaHandler(router as Express, spaFilePath);
    (this.express as Express).use(this.prefixPath, router);
  }

  public addCookieParserHandler() {
    this.express.use(cookieParser());
  }
}

export const frackendEnvironment = {
  isLocal: () => requireEnvironment("ENVCTX") === "LOCAL",
};
