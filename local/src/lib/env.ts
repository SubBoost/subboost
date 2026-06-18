type RequiredEnvName = "DATABASE_URL" | "ENCRYPTION_KEY" | "JWT_SECRET" | "APP_URL";

export function requireEnv(name: RequiredEnvName): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function getAppUrl(): string {
  return requireEnv("APP_URL").replace(/\/+$/, "");
}

export function isHttpsAppUrl(): boolean {
  return getAppUrl().startsWith("https://");
}

export function getAppOrigin(): string | null {
  try {
    return new URL(getAppUrl()).origin;
  } catch {
    return null;
  }
}
