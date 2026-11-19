/** Masks an IP for display/audit: IPv4 keeps 3 octets (189.6.12.x), IPv6 keeps 3 groups. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.split('.').slice(0, 3).join('.') + '.x';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':x';
  return null;
}

/** First 200 chars of the User-Agent (enough to identify the device in the sessions list). */
export function shortUserAgent(ua: string | null | undefined): string | null {
  return ua ? ua.slice(0, 200) : null;
}

/** The 8 hextets of an IPv6 address (`::` expanded, embedded IPv4 converted), or null. */
function ipv6Groups(ip: string): number[] | null {
  let addr = ip.split('%')[0]!.toLowerCase();
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255)) return null;
    addr = `${addr.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':'));
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * Key of the per-IP rate limits. An IPv6 client usually controls a whole /64 (2^64 addresses): keyed
 * by the full address, it would get a fresh budget per request. IPv4 (also IPv4-mapped IPv6) stays the
 * address itself.
 */
export function rateLimitKey(ip: string | null | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(':')) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}
