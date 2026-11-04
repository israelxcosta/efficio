import { apiDownload } from './api';

// Profile photos (spec §15.3). The image comes through the API (`GET /profile/photos/:userId?v=`), so
// it works in the demo too, and is kept as an object URL per user and version for the session (a
// dozen people, 256×256 WebP). A new version is a new URL; the old one is released. Signing out (or
// another session) clears everything: photos are personal data.

const cache = new Map<string, Promise<string | null>>();
const latest = new Map<string, string>();

function keyOf(userId: string, version: string) {
  return `${userId}:${version}`;
}

/** Object URL of a member's photo (null while loading, on error or without photo). */
export function loadPhoto(userId: string, version: string): Promise<string | null> {
  const key = keyOf(userId, version);
  let entry = cache.get(key);
  if (!entry) {
    entry = apiDownload(`/profile/photos/${userId}`, { query: { v: version } }, 'foto', { silent: true })
      .then(({ blob }) => {
        const url = URL.createObjectURL(blob);
        const previous = latest.get(userId);
        latest.set(userId, key);
        // The previous version of the same person is no longer shown anywhere.
        if (previous && previous !== key) {
          void cache.get(previous)?.then((u) => u && URL.revokeObjectURL(u));
          cache.delete(previous);
        }
        return url;
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, entry);
  }
  return entry;
}

/** Drops every cached photo (sign out). */
export function clearPhotoCache() {
  for (const entry of cache.values()) void entry.then((u) => u && URL.revokeObjectURL(u));
  cache.clear();
  latest.clear();
}

