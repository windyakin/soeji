// CSRF token cookie name (must match backend)
const CSRF_COOKIE_NAME = "soeji_csrf_token";

// CSRF header name (must match backend)
export const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Get CSRF token from cookie
 * Returns null if token is not found
 */
export function getCsrfToken(): string | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Get CSRF headers object for fetch requests
 * Returns empty object if no token is available
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  if (token) {
    return { [CSRF_HEADER_NAME]: token };
  }
  return {};
}
