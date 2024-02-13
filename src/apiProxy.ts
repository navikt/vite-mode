import { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

import { exchangeUsingClientCredentialsFlow, exchangeUsingOnBehalfOfFlow } from "./onbehalfof.js";
import { getOboTokenForRequest } from "./sessionCache.js";

type ProxyOptions = {
  ingoingUrl: string;
  outgoingUrl: string;
  scope: string;
  flow: "CLIENT_CREDENTIALS" | "ON_BEHALF_OF";
};

const TOKEN_EXCHANGE_FLOWS = {
  CLIENT_CREDENTIALS: exchangeUsingClientCredentialsFlow,
  ON_BEHALF_OF: exchangeUsingOnBehalfOfFlow,
};

export function addProxyHandler(server: Express, { ingoingUrl, outgoingUrl, scope, flow }: ProxyOptions) {
  server.use(
    ingoingUrl,
    (request, response, next) => TOKEN_EXCHANGE_FLOWS[flow]({ request, next, scope }),
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

type SimpleProxyOptions = {
  ingoingUrl: string;
  outgoingUrl: string;
};

/**
 * Proxies request without any modification or token exchange
 */
export function addSimpleProxyHandler(server: Express, { ingoingUrl, outgoingUrl }: SimpleProxyOptions) {
  server.use(
    ingoingUrl,
    createProxyMiddleware({
      target: outgoingUrl,
      changeOrigin: true,
      logger: console,
    }),
  );
}
