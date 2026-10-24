import { beforeAll, it, expect } from "vitest";
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { verifyAccess } from "../../worker/auth";
import { env } from "./fixtures";
let privateKey: CryptoKey, key: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  key = createLocalJWKSet({ keys: [{ ...jwk, kid: "test", alg: "RS256" }] });
});
async function token(
  options: { aud?: string; iss?: string; exp?: number } = {},
) {
  return new SignJWT({ email: "member@local.test" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("user-1")
    .setIssuedAt()
    .setIssuer(options.iss || "https://" + env.ACCESS_TEAM_DOMAIN)
    .setAudience(options.aud || env.ACCESS_AUD)
    .setExpirationTime(options.exp || Math.floor(Date.now() / 1000) + 60)
    .sign(privateKey);
}
const req = (jwt?: string) =>
  new Request("https://api.test/api/analyze-job", {
    headers: jwt
      ? { "Cf-Access-Jwt-Assertion": jwt }
      : { "Cf-Access-Authenticated-User-Email": "forged@local.test" },
  });
it("validates signature, issuer, audience, expiry and requires a signed identity", async () => {
  expect((await verifyAccess(req(await token()), env, key)).sub).toBe("user-1");
  await expect(verifyAccess(req(), env, key)).rejects.toThrow();
  await expect(
    verifyAccess(req(await token({ aud: "wrong" })), env, key),
  ).rejects.toThrow();
  await expect(
    verifyAccess(
      req(await token({ iss: "https://other.cloudflareaccess.com" })),
      env,
      key,
    ),
  ).rejects.toThrow();
  await expect(
    verifyAccess(
      req(await token({ exp: Math.floor(Date.now() / 1000) - 60 })),
      env,
      key,
    ),
  ).rejects.toThrow();
  const t = await token();
  const parts = t.split(".");
  parts[1] = btoa(
    JSON.stringify({ sub: "attacker", email: "forged@local.test" }),
  );
  await expect(verifyAccess(req(parts.join(".")), env, key)).rejects.toThrow();
  await expect(
    verifyAccess(req(t), { ...env, ACCESS_TEAM_DOMAIN: "evil.test" }, key),
  ).rejects.toThrow();
});
