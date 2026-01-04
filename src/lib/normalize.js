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

function stripWww(host) {
  return host?.toLowerCase()?.startsWith('www.') ? host.slice(4).toLowerCase() : host?.toLowerCase();
}

export function normalizeUrlForDomainHost(input, domainHost) {
  const normalized = normalizeUrlInput(input);
  const inputHost = stripWww(normalized.host);
  const expectedHost = stripWww(domainHost);
  if (inputHost !== expectedHost) {
    throw new Error('URL host must match domain host');
  }

  const normalizedUrl = `https://${domainHost.toLowerCase()}${normalized.path === '/' ? '/' : normalized.path}`;
  return { host: domainHost.toLowerCase(), path: normalized.path, normalizedUrl };
}
