import crypto from 'node:crypto';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/**
 * Shared in-memory revocation store consulted by token verifiers.
 *
 * When a session ends or a token is revoked, its hash is recorded here.
 * On every cache hit, verifiers check this store to guarantee that revoked
 * tokens are rejected immediately on the very next request rather than
 * surviving for the remainder of their cache TTL window.
 */
export function createRevocationStore({ maxEntries = 5000, now = () => Date.now() } = {}) {
  // Map of tokenHash -> expiresAtMs
  const revoked = new Map();

  function prune() {
    const current = now();
    for (const [key, exp] of revoked.entries()) {
      if (exp <= current) {
        revoked.delete(key);
      }
    }
  }

  function revoke(token, expiresAtMs) {
    if (!token || typeof token !== 'string') return;
    const key = hashToken(token.trim());
    // Retain the revoked status until token expiry or 24h default fallback
    const exp = Number.isFinite(expiresAtMs) && expiresAtMs > now()
      ? expiresAtMs
      : now() + 24 * 60 * 60 * 1000;

    revoked.set(key, exp);

    if (revoked.size > maxEntries) {
      prune();
      while (revoked.size > maxEntries) {
        const oldest = revoked.keys().next().value;
        revoked.delete(oldest);
      }
    }
  }

  function isRevoked(token) {
    if (!token || typeof token !== 'string') return false;
    const key = hashToken(token.trim());
    const exp = revoked.get(key);
    if (!exp) return false;
    if (exp <= now()) {
      revoked.delete(key);
      return false;
    }
    return true;
  }

  function clear() {
    revoked.clear();
  }

  return {
    revoke,
    isRevoked,
    clear,
    size: () => revoked.size,
  };
}

/** Global shared instance used across verifiers */
export const sharedRevocationStore = createRevocationStore();
