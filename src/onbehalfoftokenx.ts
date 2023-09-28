import { NextFunction, Request, Response } from "express";
import jose from "node-jose";
import { BaseClient, Issuer, TokenSet } from "openid-client";

import config from "./config";
import { getOboTokenForRequest, OboToken, setOboTokenForRequest } from "./sessionCache";

const ACCESS_TOKEN_DRIFT_TIME_SECONDS = 10;

// Only initialize class if necessary
export class TokenX {
  private tokenxClient?: BaseClient;
  private async initializeTokenxClient(): Promise<BaseClient> {
    const tokenxIssuer = await Issuer.discover(config.tokenx().wellKnownUrl);
    return new tokenxIssuer.Client(
      {
        client_id: config.tokenx().clientId,
        token_endpoint_auth_method: "private_key_jwt",
      },
      { keys: [config.tokenx().clientJwk as typeof jose.JWK] },
    );
  }

  constructor() {
    this.initializeTokenxClient()
      .then((it) => (this.tokenxClient = it))
      .catch((error) => {
        throw error;
      });
  }

  private async getTokenXTokenSet(token: string, additionalClaims: object) {
    try {
      const out = await this.tokenxClient?.grant(
        {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          audience: config.tokenx().audience,
          subject_token: token,
        },
        additionalClaims,
      );
      return out && this.tokenSetToOboToken(out);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error(
        `Noe gikk galt med token exchange mot TokenX.
            Feilmelding fra openid-client: (${error}).
            HTTP Status fra TokenX: (${error.response.statusCode} ${error.response.statusMessage})
            Body fra TokenX:`,
        error.response.body,
      );
    }
  }

  getCurrentUnixTimestampInSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  async addTokenXOnBehalfOfToken(request: Request, response: Response, next: NextFunction, scope: string) {
    const existingTokenXSession = getOboTokenForRequest(request, scope);
    if (existingTokenXSession) {
      const now = this.getCurrentUnixTimestampInSeconds();
      // // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // // @ts-ignore
      const tokenExpiresIn = ((existingTokenXSession.expires_at as number) ?? 0) - now;

      // If token expires in less than 10 seconds we request a new token in order to give requests more flight-time-buffer.
      if (tokenExpiresIn > ACCESS_TOKEN_DRIFT_TIME_SECONDS) {
        return next();
      }
    }

    const idPortenToken = request.headers.authorization?.split(" ")[1];

    if (!idPortenToken) {
      throw new Error("IdPorten token was not present when attempting tokenX exchange");
    }
    const additionalClaims = {
      clientAssertionPayload: {
        nbf: this.getCurrentUnixTimestampInSeconds(),
        // TokenX only allows a single audience
        aud: [this.tokenxClient?.issuer.metadata.token_endpoint],
      },
    };

    const tokenX = await this.getTokenXTokenSet(idPortenToken, additionalClaims);
    if (tokenX) {
      setOboTokenForRequest(request, tokenX, scope);
    }
    next();
  }

  private tokenSetToOboToken(t: TokenSet): OboToken {
    return {
      expires_at: t.expires_at,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
    } as OboToken;
  }
}
