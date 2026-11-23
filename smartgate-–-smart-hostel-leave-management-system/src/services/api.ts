const TOKEN_KEY = 'smartgate_auth_token';
const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || '';

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1'
  );
}

function getApiUrl(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(`${configuredApiOrigin}/api${endpoint}`, window.location.origin);
  } catch {
    throw new Error('SmartGate API configuration is invalid. Check VITE_API_BASE_URL.');
  }

  if (import.meta.env.PROD) {
    if (!isLoopbackHost(window.location.hostname) && isLoopbackHost(url.hostname)) {
      throw new Error(
        'The production SmartGate API is configured to use localhost. Set VITE_API_BASE_URL to the deployed backend origin.'
      );
    }
    if (window.location.protocol === 'https:' && url.protocol !== 'https:') {
      throw new Error('The SmartGate API must use HTTPS when the frontend is served over HTTPS.');
    }
  }

  return url.toString();
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null, rememberMe = true): void {
  if (token) {
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = getApiUrl(endpoint);
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[SmartGate API] Request could not reach the API.', {
        url,
        error,
      });
    }

    let crossOrigin = false;
    try {
      crossOrigin = new URL(url).origin !== window.location.origin;
    } catch {
      // The fetch error below still gives the user a safe, actionable message.
    }
    throw new Error(
      crossOrigin
        ? 'Could not reach the SmartGate API. Check that the backend is running and its CORS allowlist includes this site.'
        : 'Could not reach the SmartGate API. Check that the server is running and your network connection is available.'
    );
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (
      res.status === 401 &&
      !endpoint.startsWith('/auth/login') &&
      !endpoint.startsWith('/auth/register')
    ) {
      setStoredToken(null);
      window.dispatchEvent(new CustomEvent('smartgate:unauthorized'));
    }

    if (import.meta.env.DEV) {
      console.error(`[SmartGate API] ${options.method || 'GET'} ${url} returned HTTP ${res.status}.`);
    }

    const serverMessage =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null;
    const fallbackMessages: Record<number, string> = {
      400: 'The submitted information is invalid. Review the fields and try again.',
      401: 'Authentication failed. Check your credentials and try again.',
      409: 'An account with the submitted details already exists.',
      500: 'SmartGate encountered a server error. Please try again later.',
    };
    throw new Error(serverMessage || fallbackMessages[res.status] || `Request failed with status ${res.status}.`);
  }

  return data as T;
}
