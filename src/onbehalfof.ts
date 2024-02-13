import axios, { isAxiosError } from "axios";
import { NextFunction, Request } from "express";
import jose from "node-jose";
import { v4 as uuidv4 } from "uuid";

import config from "./config.js";
import { getOboTokenForRequest, setOboTokenForRequest, Token } from "./sessionCache.js";

const azureAdHeaderConfig = {
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
};

export type OnBehalfOfResponse = {
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

export type ClientCredentialsResponse = {
  expires_in: number;
  access_token: string;
  refresh_token?: string;
};

type ExchangeTokenOptions = {
  request: Request;
  next: NextFunction;
  scope: string;
};

export async function exchangeUsingOnBehalfOfFlow({ request, next, scope }: ExchangeTokenOptions) {
  try {
    const currentToken = getOboTokenForRequest(request, scope);
    if (currentToken) {
      if (!isTokenExpired(currentToken)) {
        return next();
      }
      if (currentToken.refreshToken) {
        const token = await getRefreshToken(currentToken.refreshToken, scope);
        updateSession(request, scope, token);
        return next();
      }
    }
    const token = await onBehalfOfFlow(scope, request);
    updateSession(request, scope, token);
    return next();
  } catch (error) {
    return next(handleError(error));
  }
}

export async function exchangeUsingClientCredentialsFlow({ request, next, scope }: ExchangeTokenOptions) {
  try {
    const currentToken = getOboTokenForRequest(request, scope);
    if (!isTokenExpired(currentToken)) {
      return next();
    }
    const token = await clientCredentialsFlow(scope);
    updateSession(request, scope, token);
    return next();
  } catch (error) {
    return next(handleError(error));
  }
}

function handleError(error: unknown) {
  if (isAxiosError(error)) {
    console.error("Token exchange failed", error.response?.data);
    return error.response?.data;
  }
  return error;
}

function isTokenExpired(token?: Token) {
  if (!token) {
    return true;
  }
  return token.expiresAt < Date.now() / 1000 - 10;
}

const updateSession = (request: Request, scope: string, result: OnBehalfOfResponse | ClientCredentialsResponse) => {
  const oboToken = {
    expiresAt: Date.now() / 1000 + result.expires_in,
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
  };
  setOboTokenForRequest(request, oboToken, scope);
};

async function onBehalfOfFlow(scope: string, request: Request) {
  const userAccessToken =
    request.headers["authorization"]?.split(" ")[1] ?? "Could not find authorization token in request";

  const parameters = new URLSearchParams();
  const clientAssertion = await generateClientAssertionToken();
  parameters.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  parameters.append("client_id", config.azureAd.clientId());
  parameters.append("scope", scope);
  parameters.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  parameters.append("client_assertion", clientAssertion.toString());
  parameters.append("requested_token_use", "on_behalf_of");
  parameters.append("assertion", userAccessToken);

  const tokenResponse = await axios.post<OnBehalfOfResponse>(
    config.azureAd.tokenEndpoint(),
    parameters,
    azureAdHeaderConfig,
  );
  return tokenResponse.data;
}

async function clientCredentialsFlow(scope: string) {
  const parameters = new URLSearchParams();
  const clientAssertion = await generateClientAssertionToken();
  parameters.append("grant_type", "client_credentials");
  parameters.append("client_id", config.azureAd.clientId());
  parameters.append("scope", scope);
  parameters.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  parameters.append("client_assertion", clientAssertion.toString());

  const tokenResponse = await axios.post<ClientCredentialsResponse>(
    config.azureAd.tokenEndpoint(),
    parameters,
    azureAdHeaderConfig,
  );
  return tokenResponse.data;
}

function generateClientAssertionToken() {
  const bodyCnt = {
    sub: config.azureAd.clientId,
    aud: config.azureAd.issuer,
    nbf: Math.floor(Date.now() / 1000) - 30,
    iss: config.azureAd.clientId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    jti: uuidv4(),
    iat: Math.floor(Date.now() / 1000) - 30,
  };

  return jose.JWS.createSign(
    {
      alg: "RS256",
      format: "compact",
    },
    JSON.parse(config.azureAd.jwk()),
  )
    .update(JSON.stringify(bodyCnt), "utf8")
    .final();
}

async function getRefreshToken(refreshToken: string, scope: string) {
  const parameters = new URLSearchParams();
  const clientAssertion = await generateClientAssertionToken();

  parameters.append("grant_type", "refresh_token");
  parameters.append("client_id", config.azureAd.clientId());
  parameters.append("scope", scope);
  parameters.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  parameters.append("client_assertion", clientAssertion.toString());
  parameters.append("refresh_token", refreshToken);

  const tokenResponse = await axios.post<OnBehalfOfResponse>(
    config.azureAd.tokenEndpoint(),
    parameters,
    azureAdHeaderConfig,
  );

  return tokenResponse.data;
}
