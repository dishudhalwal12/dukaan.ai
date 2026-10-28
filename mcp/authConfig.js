/**
 * OAuth discovery helpers for the MCP resource server.
 *
 * The authorization server is Supabase Auth. This module only builds the
 * RFC 9728 Protected Resource Metadata document and the matching challenge URL;
 * it never issues tokens.
 */

/** Strips one trailing slash; keeps the issuer path intact. */
export function normaliseIssuer(issuer) {
  return String(issuer || '').trim().replace(/\/+$/, '');
}

/**
 * Builds the RFC 9728 document.
 *
 * @param {object} options
 * @param {string} options.resourceUrl  canonical MCP server URL
 * @param {string} options.issuer       Supabase Auth issuer, e.g. https://<ref>.supabase.co/auth/v1
 * @param {string[]} [options.scopes]
 * @param {string} [options.documentationUrl]
 * @param {boolean} [options.allowInsecure] local testing only
 */
export function protectedResourceMetadata({
  resourceUrl,
  issuer,
  scopes = ['openid', 'email', 'profile'],
  documentationUrl,
  allowInsecure = false,
}) {
  const resource = String(resourceUrl || '').trim();
  const normalizedIssuer = normaliseIssuer(issuer);
  if (!resource || !normalizedIssuer) throw new Error('resourceUrl and issuer are required');

  if (!allowInsecure) {
    if (!resource.startsWith('https://')) {
      throw new Error('The MCP resource URL must use HTTPS.');
    }
    if (!normalizedIssuer.startsWith('https://')) {
      throw new Error('The OAuth issuer must use HTTPS. Set allowInsecure only for local testing.');
    }
  }

  return {
    resource,
    authorization_servers: [normalizedIssuer],
    bearer_methods_supported: ['header'],
    scopes_supported: scopes,
    resource_name: 'Nukkad AI Ordering',
    ...(documentationUrl ? { resource_documentation: documentationUrl } : {}),
  };
}

/** RFC 9728 path insertion: /mcp -> /.well-known/oauth-protected-resource/mcp. */
export function protectedResourceMetadataUrl(serverUrl) {
  const url = new URL(serverUrl);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

/** Decodes a JWT payload without verifying it. Null on any malformed input. */
export function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
