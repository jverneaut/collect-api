function withScheme(value) {
  if (!value) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `https://${value}`;
}

export function normalizeDomainInput(input) {
  const url = new URL(withScheme(input));
  const host = url.host.toLowerCase();
  return {
    host,
    canonicalUrl: `https://${host}`,
  };
}

export function normalizeUrlInput(input) {
  const url = new URL(withScheme(input));
  const host = url.host.toLowerCase();
  const pathname = url.pathname ? url.pathname : '/';
  const path = pathname === '' ? '/' : pathname;
  const normalizedPath = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  const normalizedUrl = `https://${host}${normalizedPath === '/' ? '/' : normalizedPath}`;
  return {
    host,
    path: normalizedPath === '' ? '/' : normalizedPath,
    normalizedUrl,
  };
}

