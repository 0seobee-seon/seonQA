export function adminFetch(url: string, password: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
      ...(opts.headers ?? {}),
    },
  });
}
