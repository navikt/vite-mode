/**
 * Require the existence of an environment variable. Will throw error if it does not exist
 */
export function requireEnvironment(environmentName: string) {
  const environmentContent = process.env[environmentName];
  if (!environmentContent) throw new Error("Missing environment variable with name: " + environmentName);
  return environmentContent;
}
