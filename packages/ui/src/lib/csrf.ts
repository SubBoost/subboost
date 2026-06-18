"use client";

const CSRF_STORAGE_KEY = "subboost-local-csrf-token";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getCsrfToken(): string {
  const storage = getStorage();
  return storage?.getItem(CSRF_STORAGE_KEY) ?? "";
}

export function setCsrfToken(token: string | null | undefined) {
  const storage = getStorage();
  if (!storage) return;
  if (token && token.trim()) {
    storage.setItem(CSRF_STORAGE_KEY, token.trim());
    return;
  }
  storage.removeItem(CSRF_STORAGE_KEY);
}

export function withCsrfHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  if (!token) return headers;

  const normalized = new Headers(headers);
  normalized.set("x-subboost-csrf", token);
  return normalized;
}
