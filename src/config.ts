import { ProxySpec } from "./frackend";

export function requireEnvironment(environmentName: string) {
  const environmentContent = process.env[environmentName];
  if (!environmentContent) {
    throw new Error("Missing environment variable with name: " + environmentName);
  }
  return environmentContent;
}

function requireEnvironmentAsJson(environmentName: string) {
  try {
    return JSON.parse(requireEnvironment(environmentName));
  } catch {
    const message = "Environment variable with name: " + environmentName + " is not valid json";
    throw new Error(message);
  }
}

export function requireEnvironmentProxySpec(environmentName: string): ProxySpec {
  const environmentContent = requireEnvironmentAsJson(environmentName);
  const requiredKeys = ["url", "scope"];
  for (const rk of requiredKeys) {
    if (!environmentContent[rk]) {
      throw new Error("Proxyspec missing key: " + rk);
    }
  }
  return { url: environmentContent.url, scope: environmentContent.scope } as ProxySpec;
}

export function requireEnvironmentDeployment(environmentName: string): "LOCAL" | "DEV" | "PROD" {
  const environmentContent = requireEnvironment(environmentName);
  const acceptedList = ["LOCAL", "DEV", "PROD"];
  for (const accepted of acceptedList) {
    if (environmentContent === accepted) return accepted as "LOCAL" | "DEV" | "PROD";
  }
  throw new Error(environmentName + ": is not equal to one of the valid values " + acceptedList);
}

let azureAdStore:
  | {
      clientId: string;
      issuer: string;
      tokenEndpoint: string;
      jwk: string;
      openIdJwkUris: string;
    }
  | undefined;

let idportenStore:
  | {
      clientId: string;
      audience: string;
      jwksUri: string;
      issuer: string;
    }
  | undefined;

let tokenxStore:
  | {
      wellKnownUrl: string;
      clientId: string;
      clientJwk: object;
      audience: string;
    }
  | undefined;

function azureAd() {
  if (azureAdStore) {
    return azureAdStore;
  }
  azureAdStore = {
    clientId: requireEnvironment("AZURE_APP_CLIENT_ID"),
    issuer: requireEnvironment("AZURE_OPENID_CONFIG_ISSUER"),
    tokenEndpoint: requireEnvironment("AZURE_OPENID_CONFIG_TOKEN_ENDPOINT"),
    jwk: requireEnvironment("AZURE_APP_JWK"),
    openIdJwkUris: requireEnvironment("AZURE_OPENID_CONFIG_JWKS_URI"),
  };
  return azureAdStore;
}

function idporten() {
  if (idportenStore) {
    return idportenStore;
  }
  idportenStore = {
    clientId: requireEnvironment("IDPORTEN_CLIENT_ID"),
    audience: requireEnvironment("IDPORTEN_AUDIENCE"),
    jwksUri: requireEnvironment("IDPORTEN_JWKS_URI"),
    issuer: requireEnvironment("IDPORTEN_ISSUER"),
  };
  return idportenStore;
}

function tokenx() {
  if (tokenxStore) {
    return tokenxStore;
  }
  tokenxStore = {
    wellKnownUrl: requireEnvironment("TOKEN_X_WELL_KNOWN_URL"),
    clientId: requireEnvironment("TOKEN_X_CLIENT_ID"),
    clientJwk: requireEnvironmentAsJson("TOKEN_X_PRIVATE_JWK"),
    audience: requireEnvironment("TOKEN_X_AUDIENCE"),
  };
  return tokenxStore;
}

export default { azureAd, idporten, tokenx };
