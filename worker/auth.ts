import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface AccessConfig {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
}
const resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function accessIssuer(env: AccessConfig): string {
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) ||
    !env.ACCESS_AUD?.trim()
  )
    throw Error("Access configuration is missing");
  return `https://${env.ACCESS_TEAM_DOMAIN}`;
}
export async function verifyAccess(
  request: Request,
  env: AccessConfig,
  key?: JWTVerifyGetKey,
) {
  const issuer = accessIssuer(env);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16384) throw Error("Access session required");
  if (!key && !resolvers.has(issuer))
    resolvers.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
        timeoutDuration: 5000,
        cooldownDuration: 30000,
      }),
    );
  const { payload } = await jwtVerify(token, key || resolvers.get(issuer)!, {
    issuer,
    audience: env.ACCESS_AUD,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub"],
    clockTolerance: 5,
  });
  if (!payload.sub || typeof payload.email !== "string")
    throw Error("Access application identity required");
  return { sub: payload.sub, email: payload.email };
}
