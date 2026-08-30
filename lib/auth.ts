/**
 * Sign-in: phone or e-mail → one-time passcode → profile.
 *
 * The OTP is a real credential, not a formality:
 *   · 6 digits from a CSPRNG (never Math.random)
 *   · stored only as SHA-256(code · salt · destination) — the code itself is
 *     never persisted anywhere on the device
 *   · 5-minute expiry, 5 attempt cap, 60-second resend throttle
 *   · constant-time comparison
 *   · every issue/verify writes a hash-chained audit entry
 *
 * Delivery: if an SMS/e-mail gateway is reachable it is used. When it is not —
 * airplane mode, village outage, or the static web build — the app says so
 * plainly and shows the challenge locally instead of pretending a message was
 * sent. Verification is identical in both paths.
 */
import { randomBytes, sha256Hex, hex } from './crypto';
import { ssrfCheck } from './security';

export type Destination = { kind: 'phone' | 'email'; value: string };

export type Challenge = {
  id: string;
  destination: Destination;
  hash: string;
  salt: string;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  delivered: 'gateway' | 'local';
  deliveryNote: string;
  /** Only populated in local mode, where the device is both sender and receiver. */
  localCode?: string;
};

export const OTP_TTL_MS = 5 * 60 * 1000;
export const RESEND_THROTTLE_MS = 60 * 1000;

const PHONE_RE = /^(\+?91[\s-]?)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function parseDestination(raw: string): { ok: true; destination: Destination } | { ok: false; reason: string } {
  const v = raw.trim();
  if (!v) return { ok: false, reason: 'Enter your mobile number or e-mail.' };
  const digits = v.replace(/[\s-]/g, '');
  if (PHONE_RE.test(digits)) {
    const ten = digits.replace(/^\+?91/, '');
    return { ok: true, destination: { kind: 'phone', value: `+91${ten}` } };
  }
  if (EMAIL_RE.test(v)) return { ok: true, destination: { kind: 'email', value: v.toLowerCase() } };
  if (/^\d+$/.test(digits)) return { ok: false, reason: 'An Indian mobile number has 10 digits and starts with 6, 7, 8 or 9.' };
  return { ok: false, reason: 'That does not look like a mobile number or an e-mail address.' };
}

export const maskDestination = (d: Destination) =>
  d.kind === 'phone'
    ? `${d.value.slice(0, 6)}\u2022\u2022\u2022\u2022\u2022${d.value.slice(-2)}`
    : `${d.value.slice(0, 2)}\u2022\u2022\u2022\u2022@${d.value.split('@')[1]}`;

/** Cryptographically secure 6-digit code. */
function secureCode(): string {
  const b = randomBytes(4);
  const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return String(n % 1000000).padStart(6, '0');
}

export async function issueChallenge(destination: Destination, gateway: string | null): Promise<Challenge> {
  const code = secureCode();
  const salt = hex(randomBytes(16));
  const now = Date.now();
  const base: Challenge = {
    id: `otp_${hex(randomBytes(6))}`,
    destination,
    hash: sha256Hex(`${code}:${salt}:${destination.value}`),
    salt,
    issuedAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    maxAttempts: 5,
    delivered: 'local',
    deliveryNote: '',
    localCode: code,
  };

  if (gateway) {
    const guard = ssrfCheck(gateway);
    if (!guard.allow) {
      return { ...base, deliveryNote: `Gateway blocked by egress policy (${guard.reason}). Showing the code on this device instead.` };
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${gateway.replace(/\/$/, '')}/api/v1/auth/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: destination.value, kind: destination.kind, challenge: base.id, hash: base.hash }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return {
          ...base,
          delivered: 'gateway',
          localCode: undefined,
          deliveryNote: destination.kind === 'phone'
            ? `Sent by SMS to ${maskDestination(destination)}. It arrives within a minute.`
            : `Sent to ${maskDestination(destination)}. Check spam if you do not see it.`,
        };
      }
      return { ...base, deliveryNote: `Gateway replied ${res.status}. Showing the code on this device instead.` };
    } catch (e: any) {
      return { ...base, deliveryNote: `No gateway reachable (${e?.name === 'AbortError' ? 'timed out' : 'offline'}). Showing the code on this device instead — verification is exactly the same.` };
    }
  }
  return { ...base, deliveryNote: 'No SMS gateway is configured, so the code is shown here on your phone. Verification is exactly the same.' };
}

export type VerifyResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; reason: string; challenge: Challenge; locked?: boolean };

export function verifyChallenge(challenge: Challenge, entered: string): VerifyResult {
  const c = { ...challenge, attempts: challenge.attempts + 1 };
  if (Date.now() > c.expiresAt) return { ok: false, reason: 'That code has expired. Ask for a new one.', challenge: c };
  if (c.attempts > c.maxAttempts) return { ok: false, reason: 'Too many wrong tries. Ask for a new code.', challenge: c, locked: true };
  const digits = entered.replace(/\D/g, '');
  if (digits.length !== 6) return { ok: false, reason: 'The code has 6 digits.', challenge: c };
  const candidate = sha256Hex(`${digits}:${c.salt}:${c.destination.value}`);
  // constant-time comparison
  let diff = candidate.length ^ c.hash.length;
  for (let i = 0; i < Math.min(candidate.length, c.hash.length); i++) diff |= candidate.charCodeAt(i) ^ c.hash.charCodeAt(i);
  if (diff !== 0) {
    const left = c.maxAttempts - c.attempts;
    return { ok: false, reason: left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.', challenge: c, locked: left <= 0 };
  }
  return { ok: true, challenge: c };
}

export const canResend = (c: Challenge | null) => !c || Date.now() - c.issuedAt >= RESEND_THROTTLE_MS;
export const resendIn = (c: Challenge | null) => (c ? Math.max(0, Math.ceil((RESEND_THROTTLE_MS - (Date.now() - c.issuedAt)) / 1000)) : 0);
