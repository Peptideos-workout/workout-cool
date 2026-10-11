interface SessionCookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string | boolean;
}

async function hmacSha256Base64(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Same format as better-call `setSignedCookie` / Better Auth session cookies. */
export async function signBetterAuthCookieValue(value: string, secret: string): Promise<string> {
  const signature = await hmacSha256Base64(value, secret);
  return encodeURIComponent(`${value}.${signature}`);
}

export async function serializeBetterAuthSignedCookie(
  name: string,
  value: string,
  secret: string,
  options: SessionCookieOptions = {},
): Promise<string> {
  const signed = await signBetterAuthCookieValue(value, secret);
  const parts = [`${name}=${signed}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = typeof options.sameSite === "string" ? options.sameSite : "Lax";
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }
  return parts.join("; ");
}

export async function verifyBetterAuthCookieValue(encoded: string, secret: string): Promise<string | null> {
  const value = decodeURIComponent(encoded);
  const signatureStartPos = value.lastIndexOf(".");
  if (signatureStartPos < 1) return null;
  const signedValue = value.slice(0, signatureStartPos);
  const signature = value.slice(signatureStartPos + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) return null;
  const expected = await hmacSha256Base64(signedValue, secret);
  return expected === signature ? signedValue : null;
}
