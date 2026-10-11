export const LINK_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const LINK_RATE_LIMIT_MAX_USER = 5;
export const LINK_RATE_LIMIT_MAX_IP = 10;

export function createLinkAttemptLimiter(opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const userAttempts = new Map<string, number[]>();
  const ipAttempts = new Map<string, number[]>();

  const prune = (map: Map<string, number[]>, key: string): number[] => {
    const cutoff = now() - LINK_RATE_LIMIT_WINDOW_MS;
    const kept = (map.get(key) ?? []).filter((stamp) => stamp > cutoff);
    if (kept.length > 0) map.set(key, kept);
    else map.delete(key);
    return kept;
  };

  return {
    isLimited(userId: string, ip: string): boolean {
      return prune(userAttempts, userId).length >= LINK_RATE_LIMIT_MAX_USER || prune(ipAttempts, ip).length >= LINK_RATE_LIMIT_MAX_IP;
    },
    recordFailure(userId: string, ip: string): void {
      const userStamps = prune(userAttempts, userId);
      userStamps.push(now());
      userAttempts.set(userId, userStamps);
      const ipStamps = prune(ipAttempts, ip);
      ipStamps.push(now());
      ipAttempts.set(ip, ipStamps);
    }
  };
}

export const defaultLinkAttemptLimiter = createLinkAttemptLimiter();
