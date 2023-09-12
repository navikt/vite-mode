import { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

import { addOnBehalfOfToken } from "./onbehalfof.js";
import { getOboTokenForRequest } from "./sessionCache.js";

export function addProxyHandler(server: Express, ingoingUrl: string, outgoingUrl: string, scope: string) {
  server.use(
    ingoingUrl,
    (request, response, next) => addOnBehalfOfToken(request, response, next, scope),
    createProxyMiddleware({
      target: outgoingUrl,
      changeOrigin: true,
      logger: console,
      on: {
        proxyReq: (proxyRequest, request) => {
          const accessToken = getOboTokenForRequest(request, scope)?.accessToken;
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
