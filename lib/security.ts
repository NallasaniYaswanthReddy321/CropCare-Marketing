/**
 * CropCare security kernel (OWASP ASVS L2 controls, client + edge shared logic).
 * Everything here is real, executable logic used by the app's Security Center.
 */
import nacl from 'tweetnacl';
import { b64decode, b64encode, b64url, chainAppend, ChainEntry, hmacSha1, sha256Hex, uid, unhex, utf8, hex } from './crypto';

/* ------------------------- signing keys + rotation ------------------------ */
export type SigningKey = { kid: string; pub: string; sec: string; createdAt: number; retiredAt?: number };

export function generateSigningKey(): SigningKey {
  const kp = nacl.sign.keyPair();
  return { kid: uid('kid'), pub: b64encode(kp.publicKey), sec: b64encode(kp.secretKey), createdAt: Date.now() };
}

/**
 * Token format follows the JWS compact serialization (header.payload.signature).
 * Algorithm: EdDSA/Ed25519 — the pure-JS, side-channel-resistant analogue of RS256
 * used on device; the Flask edge verifies with the same key material.
 */
export function issueToken(key: SigningKey, claims: Record<string, any>, ttlSec: number) {
  const header = { alg: 'EdDSA', typ: 'JWT', kid: key.kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, nbf: now, exp: now + ttlSec, jti: uid('jti'), iss: 'cropcare.local' };
  const signingInput = `${b64url(utf8(JSON.stringify(header)))}.${b64url(utf8(JSON.stringify(payload)))}`;
  const sig = nacl.sign.detached(utf8(signingInput), b64decode(key.sec));
  return { token: `${signingInput}.${b64url(sig)}`, payload };
}

export function verifyToken(token: string, keys: SigningKey[]): { ok: boolean; reason?: string; payload?: any } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  let header: any, payload: any;
  try {
    header = JSON.parse(new TextDecoder().decode(b64decode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64decode(parts[1])));
  } catch {
    return { ok: false, reason: 'undecodable' };
  }
  if (header.alg !== 'EdDSA') return { ok: false, reason: 'alg-confusion-blocked' };
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: 'unknown-kid' };
  const ok = nacl.sign.detached.verify(utf8(`${parts[0]}.${parts[1]}`), b64decode(parts[2]), b64decode(key.pub));
  if (!ok) return { ok: false, reason: 'bad-signature' };
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return { ok: false, reason: 'expired' };
  if (payload.nbf > now + 5) return { ok: false, reason: 'not-yet-valid' };
  return { ok: true, payload };
}

/* ---------------------- refresh rotation + reuse detect ------------------- */
export type RefreshRecord = { id: string; family: string; used: boolean; createdAt: number; parent?: string };

export function rotateRefresh(store: RefreshRecord[], presented?: string) {
  if (!presented) {
    const rec: RefreshRecord = { id: uid('rt'), family: uid('fam'), used: false, createdAt: Date.now() };
    return { store: [...store, rec], issued: rec, revokedFamily: null as string | null, reuse: false };
  }
  const rec = store.find((r) => r.id === presented);
  if (!rec) return { store, issued: null, revokedFamily: null, reuse: false, error: 'unknown-refresh' };
  if (rec.used) {
    // Reuse of an already-rotated token ⇒ token theft. Revoke the entire family.
    const purged = store.filter((r) => r.family !== rec.family);
    return { store: purged, issued: null, revokedFamily: rec.family, reuse: true };
  }
  const next: RefreshRecord = { id: uid('rt'), family: rec.family, used: false, createdAt: Date.now(), parent: rec.id };
  return {
    store: store.map((r) => (r.id === rec.id ? { ...r, used: true } : r)).concat(next),
    issued: next,
    revokedFamily: null,
    reuse: false,
  };
}

/* --------------------------------- TOTP ---------------------------------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s: string): Uint8Array {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export function base32Encode(b: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s step). */
export function totp(secretB32: string, at = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(at / 1000 / step);
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setUint32(4, counter >>> 0);
  new DataView(buf.buffer).setUint32(0, Math.floor(counter / 0x100000000));
  const h = hmacSha1(base32Decode(secretB32), buf);
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}
export const totpVerify = (secret: string, code: string, at = Date.now()) =>
  [-1, 0, 1].some((w) => totp(secret, at + w * 30000) === code.trim());

/* ------------------------------- RBAC + ABAC ------------------------------ */
export type Role = 'owner' | 'family' | 'agronomist' | 'buyer' | 'fpo_admin' | 'auditor' | 'robot';
export type Subject = { id: string; role: Role; farmIds: string[]; kycLevel: number; attrs?: Record<string, any> };
export type Resource = { type: string; farmId?: string; ownerId?: string; sensitivity?: 'public' | 'internal' | 'pii' | 'financial' };

const RBAC: Record<Role, string[]> = {
  owner: ['*'],
  family: ['scan:read', 'scan:create', 'irrigation:read', 'market:read', 'advisor:*', 'passport:read', 'livestock:*'],
  agronomist: ['scan:read', 'advisor:*', 'twin:*', 'field:read', 'scouting:*'],
  buyer: ['market:read', 'passport:read', 'order:create', 'escrow:read'],
  fpo_admin: ['ledger:*', 'market:read', 'member:read', 'buying:*'],
  auditor: ['audit:read', 'ledger:read', 'passport:read'],
  robot: ['telemetry:write', 'task:read', 'irrigation:read'],
};

export function authorize(sub: Subject, action: string, res: Resource): { allow: boolean; reason: string } {
  const perms = RBAC[sub.role] || [];
  const rbacOk = perms.some((p) => p === '*' || p === action || (p.endsWith(':*') && action.startsWith(p.slice(0, -1))));
  if (!rbacOk) return { allow: false, reason: `RBAC: role "${sub.role}" lacks ${action}` };
  // ABAC layer — tenancy, sensitivity and KYC attribute checks.
  if (res.farmId && !sub.farmIds.includes(res.farmId) && sub.role !== 'auditor')
    return { allow: false, reason: 'ABAC: cross-tenant farm access denied (RLS)' };
  if (res.sensitivity === 'financial' && sub.kycLevel < 2)
    return { allow: false, reason: 'ABAC: financial resource requires KYC level ≥ 2' };
  if (res.sensitivity === 'pii' && !['owner', 'auditor'].includes(sub.role))
    return { allow: false, reason: 'ABAC: PII restricted to data subject + auditor' };
  return { allow: true, reason: `allow ${sub.role} → ${action}` };
}

/* ----------------------------- rate limiting ----------------------------- */
export type Bucket = { tokens: number; last: number };
export function tokenBucket(bucket: Bucket | undefined, capacity: number, refillPerSec: number, now = Date.now()) {
  const b = bucket ?? { tokens: capacity, last: now };
  const refilled = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  if (refilled < 1) return { bucket: { tokens: refilled, last: now }, allowed: false, retryAfter: (1 - refilled) / refillPerSec };
  return { bucket: { tokens: refilled - 1, last: now }, allowed: true, retryAfter: 0 };
}

/* -------------------------------- WAF ------------------------------------ */
export const WAF_RULES: { id: string; name: string; re: RegExp; severity: 'high' | 'medium' }[] = [
  { id: 'CC-SQLI-01', name: 'SQL injection (union/or-tautology)', re: /(\bunion\b.*\bselect\b)|('\s*or\s*'?1'?\s*=\s*'?1)|(;\s*drop\s+table)/i, severity: 'high' },
  { id: 'CC-XSS-02', name: 'Cross-site scripting', re: /<\s*script|javascript:|on(error|load|click)\s*=/i, severity: 'high' },
  { id: 'CC-PATH-03', name: 'Path traversal', re: /(\.\.\/){2,}|\/etc\/passwd|%2e%2e%2f/i, severity: 'high' },
  { id: 'CC-CMD-04', name: 'Command injection', re: /[;|`]\s*(rm|curl|wget|nc|bash|sh)\b/i, severity: 'high' },
  { id: 'CC-SSTI-05', name: 'Template injection', re: /\{\{.*(config|self|__class__).*\}\}/i, severity: 'medium' },
  { id: 'CC-NOSQL-06', name: 'NoSQL operator injection', re: /\$(where|ne|gt|regex)\s*:/i, severity: 'medium' },
];
export function wafScan(input: string) {
  const hits = WAF_RULES.filter((r) => r.re.test(input));
  return { blocked: hits.length > 0, hits };
}

/* --------------------------- SSRF allowlisting ---------------------------- */
export const SSRF_ALLOWLIST = ['api.cropcare.local', 'sentinel.dataspace.copernicus.eu', 'agmarknet.gov.in', 'localhost:11434'];
const PRIVATE_RE = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|0x)/;
export function ssrfCheck(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return { allow: false, reason: `scheme ${u.protocol} blocked` };
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    if (PRIVATE_RE.test(u.hostname) && !SSRF_ALLOWLIST.includes(hostPort)) return { allow: false, reason: 'private/link-local address blocked' };
    if (!SSRF_ALLOWLIST.some((h) => hostPort === h || u.hostname.endsWith(h))) return { allow: false, reason: 'host not in egress allowlist' };
    return { allow: true, reason: 'allowlisted egress' };
  } catch {
    return { allow: false, reason: 'unparseable URL' };
  }
}

/* ----------------------------- upload scanning ---------------------------- */
const MAGIC: { sig: number[]; type: string }[] = [
  { sig: [0xff, 0xd8, 0xff], type: 'image/jpeg' },
  { sig: [0x89, 0x50, 0x4e, 0x47], type: 'image/png' },
  { sig: [0x52, 0x49, 0x46, 0x46], type: 'image/webp' },
];
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR';
export function scanUpload(bytes: Uint8Array, declaredType: string, maxBytes = 8 * 1024 * 1024) {
  const findings: string[] = [];
  const match = MAGIC.find((m) => m.sig.every((b, i) => bytes[i] === b));
  if (!match) findings.push('magic-byte mismatch: not a recognised image container');
  else if (declaredType && !declaredType.includes(match.type.split('/')[1])) findings.push(`content-type spoofing: declared ${declaredType}, actual ${match.type}`);
  if (bytes.length > maxBytes) findings.push(`oversize upload ${(bytes.length / 1048576).toFixed(1)} MB > 8 MB`);
  const head = Array.from(bytes.slice(0, 2048)).map((b) => String.fromCharCode(b)).join('');
  if (head.includes(EICAR)) findings.push('EICAR test signature detected');
  if (/<\?php|<script/i.test(head)) findings.push('polyglot payload: embedded script in image header');
  return { clean: findings.length === 0, findings, sha256: sha256Hex(bytes), bytes: bytes.length };
}

/* ------------------------------ HMAC webhooks ----------------------------- */
export function signWebhook(secret: string, body: string, ts = Date.now()) {
  const sig = hex(nacl.hash(utf8(`${ts}.${secret}.${body}`)).slice(0, 32));
  return { header: `t=${ts},v1=${sig}`, ts, sig };
}
export function verifyWebhook(secret: string, body: string, header: string, toleranceMs = 300000) {
  const m = /t=(\d+),v1=([a-f0-9]+)/.exec(header);
  if (!m) return { ok: false, reason: 'malformed signature header' };
  const ts = Number(m[1]);
  if (Math.abs(Date.now() - ts) > toleranceMs) return { ok: false, reason: 'replay window exceeded' };
  const expected = signWebhook(secret, body, ts).sig;
  // constant-time compare
  let diff = expected.length ^ m[2].length;
  for (let i = 0; i < Math.min(expected.length, m[2].length); i++) diff |= expected.charCodeAt(i) ^ m[2].charCodeAt(i);
  return { ok: diff === 0, reason: diff === 0 ? 'valid' : 'signature mismatch' };
}

/* ---------------------------- fraud detection ----------------------------- */
export type ReferralEdge = { from: string; to: string; at: number };

/** Detects collusion rings (cycles) and burst farms in the referral graph. */
export function referralFraud(edges: ReferralEdge[]) {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => adj.set(e.from, [...(adj.get(e.from) || []), e.to]));
  const cycles: string[][] = [];
  const visit = (node: string, path: string[], seen: Set<string>) => {
    if (path.length > 6) return;
    for (const nxt of adj.get(node) || []) {
      if (nxt === path[0]) cycles.push([...path, nxt]);
      else if (!seen.has(nxt)) visit(nxt, [...path, nxt], new Set(seen).add(nxt));
    }
  };
  Array.from(adj.keys()).forEach((n) => visit(n, [n], new Set([n])));
  const byHour = new Map<string, number>();
  edges.forEach((e) => {
    const k = `${e.from}|${Math.floor(e.at / 3600000)}`;
    byHour.set(k, (byHour.get(k) || 0) + 1);
  });
  const bursts = Array.from(byHour.entries()).filter(([, c]) => c >= 5).map(([k, c]) => ({ actor: k.split('|')[0], count: c }));
  const score = Math.min(100, cycles.length * 28 + bursts.length * 22);
  return { cycles: cycles.slice(0, 5), bursts, score };
}

/** Robust z-score (MAD) anomaly detection for insurance claim amounts. */
export function claimAnomaly(amounts: number[], candidate: number) {
  if (amounts.length < 4) return { z: 0, anomalous: false, median: candidate, mad: 0 };
  const sorted = [...amounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...amounts].map((a) => Math.abs(a - median)).sort((a, b) => a - b)[Math.floor(amounts.length / 2)] || 1;
  const z = (0.6745 * (candidate - median)) / mad;
  return { z: Number(z.toFixed(2)), anomalous: Math.abs(z) > 3.5, median, mad };
}

/** Diagnosis spoofing: perceptual-hash duplicates, impossible GPS velocity, stale capture. */
export function diagnosisSpoof(input: {
  phash: string;
  knownHashes: string[];
  capturedAt: number;
  submittedAt: number;
  gps?: { lat: number; lon: number; prev?: { lat: number; lon: number; at: number } };
}) {
  const flags: string[] = [];
  if (input.knownHashes.includes(input.phash)) flags.push('duplicate image hash — photo reused from another submission');
  const ageH = (input.submittedAt - input.capturedAt) / 3600000;
  if (ageH > 72) flags.push(`capture timestamp ${ageH.toFixed(0)} h old — outside 72 h freshness window`);
  if (input.gps?.prev) {
    const dKm = haversine(input.gps.lat, input.gps.lon, input.gps.prev.lat, input.gps.prev.lon);
    const dtH = Math.max(0.01, (input.capturedAt - input.gps.prev.at) / 3600000);
    if (dKm / dtH > 350) flags.push(`impossible travel ${(dKm / dtH).toFixed(0)} km/h between captures`);
  }
  return { flags, risk: Math.min(100, flags.length * 40) };
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------- audit log -------------------------------- */
export type AuditEvent = { actor: string; action: string; resource: string; outcome: 'allow' | 'deny' | 'info'; meta?: any };
export const appendAudit = (chain: ChainEntry<AuditEvent>[], e: AuditEvent) => [...chain, chainAppend(chain, e)];

/* --------------------------- ASVS L2 checklist ---------------------------- */
export type CheckItem = { id: string; area: string; title: string; verify: () => boolean; detail: string };
