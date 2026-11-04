import { UserRound } from 'lucide-react';
import { usePhotoUrl, usePhotoVersion } from '@/features/profile/photos';
import { cn, initials } from '@/lib/utils';

const SIZES = {
  sm: 'size-6 text-[11px] [&_svg]:size-3.5',
  md: 'size-8 text-xs [&_svg]:size-4',
  lg: 'size-10 text-[13px] [&_svg]:size-5',
  xl: 'size-14 text-base [&_svg]:size-6',
} as const;

interface MemberAvatarProps {
  name?: string | null;
  size?: keyof typeof SIZES;
  /** Nobody: a dashed circle (the "Sem responsável" of lists and cells). */
  unassigned?: boolean;
  className?: string;
  /** The person, to show the profile photo (spec §15.3); the initials stay as the fallback. */
  userId?: string | null;
  /**
   * Version of the photo (`photoUpdatedAt`) when the caller has it; otherwise it comes from the
   * workspace's members (the photo directory of the app shell).
   */
  photoVersion?: string | null;
}

/** Initials (or the photo) of a member in a circle, like the account avatar of the rail. */
export function MemberAvatar({ name, size = 'sm', unassigned, className, userId, photoVersion }: MemberAvatarProps) {
  if (unassigned || !name) {
    return (
      <span
        aria-hidden
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-subtle', SIZES[size], className)}
      >
        <UserRound />
      </span>
    );
  }
  const base = cn('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-soft-fg', SIZES[size], className);
  if (userId) return <PhotoAvatar userId={userId} version={photoVersion} name={name} className={base} />;
  return (
    <span aria-hidden className={base}>
      {initials(name)}
    </span>
  );
}

function PhotoAvatar({ userId, version, name, className }: { userId: string; version?: string | null; name: string; className: string }) {
  const known = usePhotoVersion(userId);
  const url = usePhotoUrl(userId, version === undefined ? known : version);
  return (
    <span aria-hidden className={cn(className, url && 'overflow-hidden')}>
      {url ? <img src={url} alt="" className="size-full object-cover" draggable={false} /> : initials(name)}
    </span>
  );
}

export interface AvatarPerson {
  id?: string | null;
  name: string;
}

/** Up to `max` avatars overlapped, then "+N". */
export function AvatarStack({ names, people, max = 4, className }: { names?: string[]; people?: AvatarPerson[]; max?: number; className?: string }) {
  const list: AvatarPerson[] = people ?? (names ?? []).map((name) => ({ name }));
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <span className={cn('flex items-center -space-x-1.5', className)} aria-hidden>
      {shown.map((p, i) => (
        <MemberAvatar key={`${p.id ?? p.name}-${i}`} name={p.name} userId={p.id} className="ring-2 ring-surface" />
      ))}
      {rest > 0 ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-bg-subtle text-[11px] font-semibold text-muted ring-2 ring-surface">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
