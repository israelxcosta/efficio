import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { useTaskMembers } from '@/features/tasks/api';
import { loadPhoto } from '@/lib/photo-cache';

// Profile photos (spec §15.3): the avatar shows the photo when the person has one (`photoUpdatedAt`),
// the initials otherwise (and while it loads).

export function usePhotoUrl(userId: string | null | undefined, version: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !version) {
      setUrl(null);
      return;
    }
    let alive = true;
    void loadPhoto(userId, version).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [userId, version]);
  return url;
}

/** userId → photo version, for avatars that only know the person's id. */
const PhotoDirectoryContext = createContext<ReadonlyMap<string, string>>(new Map());

export function usePhotoVersion(userId: string | null | undefined): string | null {
  const directory = useContext(PhotoDirectoryContext);
  return userId ? (directory.get(userId) ?? null) : null;
}

/** Built from the members of the workspace (task module, every role) and the signed-in user. */
export function PhotoDirectoryProvider({ children }: { children: ReactNode }) {
  const { user, workspace } = useAuth();
  const members = useTaskMembers({ enabled: Boolean(workspace) });
  const directory = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members.data ?? []) if (m.photoUpdatedAt) map.set(m.id, m.photoUpdatedAt);
    if (user) {
      const own = user.photoUpdatedAt;
      if (own) map.set(user.id, own);
      else map.delete(user.id);
    }
    return map;
  }, [members.data, user]);
  return <PhotoDirectoryContext.Provider value={directory}>{children}</PhotoDirectoryContext.Provider>;
}
