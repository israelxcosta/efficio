import { useLayoutEffect, useRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Address of the portal: the app's login (signed-in users are sent on to their start page). */
export const PORTAL_PATH = '/login';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Scrolls to a section of the site and moves the focus to its heading. The demo build routes on the
 * URL hash, so in-page links never change the hash: they scroll instead.
 */
export function goToSection(id: string): void {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const heading = section.querySelector<HTMLElement>('[data-section-heading]');
  heading?.focus({ preventScroll: true });
}

export function SectionLink({
  to,
  onClick,
  children,
  ...props
}: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      href={`#${to}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        goToSection(to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

/** "Portal do cliente": the login of the office's system. */
export function PortalLink({ className, children = 'Portal do cliente' }: { className?: string; children?: ReactNode }) {
  return (
    <Link to={PORTAL_PATH} className={cn('site-button', className)}>
      <LockKeyhole aria-hidden />
      {children}
    </Link>
  );
}

/** Opens in a new tab (WhatsApp, e-mail apps): never hands this page to the opened one. */
export function ExternalLink({ href, className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>
      {children}
    </a>
  );
}

/**
 * Arrivals of the sections: elements with `data-reveal` rise (or open) once, when they enter the
 * viewport. Without IntersectionObserver or with reduced motion, everything is shown as is.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    root.classList.add('site--motion');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      // No bottom inset: consecutive screens tile the page, so a short element is never skipped by a fast scroll.
      { rootMargin: '0px', threshold: 0 },
    );
    const pending = new Set(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    pending.forEach((el) => observer.observe(el));
    // A jump (a link, the End key, a fast fling) can carry an element past the screen between two
    // frames without it ever intersecting: whatever is already above the bottom of the screen is shown.
    let frame = 0;
    const sweep = () => {
      frame = 0;
      for (const el of pending) {
        if (el.classList.contains('is-in')) pending.delete(el);
        else if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-in');
          observer.unobserve(el);
          pending.delete(el);
        }
      }
      if (!pending.size) window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sweep);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      root.classList.remove('site--motion');
    };
  }, []);
  return ref;
}
