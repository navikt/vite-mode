import * as crypto from "node:crypto";
import { IncomingMessage } from "node:http";

import NodeCache from "node-cache";

export const sessionCache = new NodeCache({
  stdTTL: 60 * 60, // 1 hour
});

type SessionCacheValue = {
  [scope: string]: OboToken;
};

export type OboToken = {
  expires_at: number; // TODO, check if this is correct VS expires_at
  access_token: string;
  refresh_token: string;
};

export function setOboTokenForRequest(request: IncomingMessage, oboToken: OboToken, scope: string) {
  const hashedAuthHeader = getHashedAuthHeader(request);

  if (!hashedAuthHeader) {
    return;
  }

  const cachedValue = sessionCache.get<SessionCacheValue>(hashedAuthHeader) ?? {};

  cachedValue[scope] = oboToken;

  sessionCache.set<SessionCacheValue>(hashedAuthHeader, cachedValue);
}

export function getOboTokenForRequest(request: IncomingMessage, scope: string) {
  const hashedAuthHeader = getHashedAuthHeader(request);

  if (!hashedAuthHeader) {
    return;
  }

  const cachedValue = sessionCache.get<SessionCacheValue>(hashedAuthHeader);

  if (!cachedValue) {
    return;
  }

  return cachedValue[scope];
}

function getHashedAuthHeader(request: IncomingMessage) {
  const authToken = request.headers["authorization"];

  if (!authToken) {
    return;
  }

  return crypto.createHash("md5").update(authToken).digest("hex");
}
