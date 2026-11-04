import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProfilePhotoResponse } from '@effinance/shared';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// Profile photo (spec §15.3): the person's own data. The new `photoUpdatedAt` reaches the session
// (`/auth/me`) and the members lists, so every avatar picks the new version.

function useAfterPhotoChange() {
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  return () => Promise.all([refreshMe(), qc.invalidateQueries({ queryKey: qk.taskMembers }), qc.invalidateQueries({ queryKey: qk.members })]);
}

export function useUploadPhoto() {
  const after = useAfterPhotoChange();
  return useMutation({
    mutationFn: (photo: string) => api<ProfilePhotoResponse>('/profile/photo', { method: 'PUT', body: { photo } }),
    // The image is personal data: not kept in the mutation cache.
    gcTime: 0,
    onSuccess: () => after(),
  });
}

export function useRemovePhoto() {
  const after = useAfterPhotoChange();
  return useMutation({
    mutationFn: () => api<void>('/profile/photo', { method: 'DELETE' }),
    onSuccess: () => after(),
  });
}
