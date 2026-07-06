import crypto from "crypto"

const JWT_SECRET = process.env.JWT_SECRET || "RlAustraliaJWTSecretStoreKey123!"

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + JWT_SECRET).digest("hex")
}

export function generateToken(payload: Record<string, any>, expiresIn?: string): string {
  const isInfinity = expiresIn === "7300d"
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: isInfinity 
        ? Math.floor(Date.now() / 1000) + 86400 * 365 * 20 // 20 years
        : Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
    })
  ).toString("base64url")
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url")
  return `${header}.${body}.${signature}`
}

export function verifyToken(token: string): Record<string, any> | null {
  try {
    const [header, body, signature] = token.split(".")
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url")

    if (signature !== expectedSig) return null

    const payload = JSON.parse(Buffer.from(body, "base64url").toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}
