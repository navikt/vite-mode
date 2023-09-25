import * as crypto from "node:crypto";
import { IncomingMessage } from "node:http";

import NodeCache from "node-cache";

export const sessionCache = new NodeCache({
  stdTTL: 60 * 60, // 1 hour
});

type SessionCacheValue = {
  [scope: string]: Token;
};

export type Token = {
  expiresAt: number;
  accessToken: string;
  refreshToken?: string;
};

export function setOboTokenForRequest(request: IncomingMessage, oboToken: Token, scope: string) {
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

/**
 * Delete all cached tokens for your current session.
 * @return True if tokens were deleted from cache, false if nothing was deleted.
 */
export function deleteCachedTokens(request: IncomingMessage) {
  const hashedAuthHeader = getHashedAuthHeader(request);

  if (!hashedAuthHeader) {
    return false;
  }

  return sessionCache.del(hashedAuthHeader) > 0;
}

function getHashedAuthHeader(request: IncomingMessage) {
  const authToken = request.headers["authorization"];

  if (!authToken) {
    return;
  }

  return crypto.createHash("md5").update(authToken).digest("hex");
}
