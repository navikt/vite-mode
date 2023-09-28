import { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

import { addAadOnBehalfOfToken } from "./onbehalfofaad";
import { getOboTokenForRequest } from "./sessionCache.js";

export function addProxyHandler(server: Express, ingoingUrl: string, outgoingUrl: string, scope: string) {
  server.use(
    ingoingUrl,
    (request, response, next) => addAadOnBehalfOfToken(request, response, next, scope),
    createProxyMiddleware({
      target: outgoingUrl,
      changeOrigin: true,
      logger: console,
      on: {
        proxyReq: (proxyRequest, request) => {
          const accessToken = getOboTokenForRequest(request, scope)?.access_token;
          if (accessToken) {
            proxyRequest.setHeader("Authorization", `Bearer ${accessToken}`);
          } else {
            console.log(`Access token var not present in session for scope ${scope}`);
          }
        },
      },
    }),
  );
}
