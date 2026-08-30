/**
 * Pure-TS cryptography core for CropCare.
 * - SHA-256 / SHA-1 / HMAC (no native deps, runs identically on web + RN)
 * - Hash-chained ledgers (Farm Passport, audit log, FPO ledger)
 * - X25519 key agreement + authenticated encryption via TweetNaCl
 * - Field-level envelope encryption with per-record data keys (crypto-shredding)
 */
import nacl from 'tweetnacl';

/* ------------------------------ encodings ------------------------------ */
export const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = s.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
};

export const fromUtf8 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
    else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    else {
      const cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    }
  }
  return s;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function b64encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}
export function b64decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[p++] = (n >> 16) & 255;
    if (clean[i + 2]) out[p++] = (n >> 8) & 255;
    if (clean[i + 3]) out[p++] = n & 255;
  }
  return out.slice(0, p);
}
export const b64url = (b: Uint8Array) => b64encode(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
export const unhex = (h: string) => new Uint8Array((h.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16)));

/* -------------------------------- SHA-256 ------------------------------- */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(msg: Uint8Array): Uint8Array {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const l = msg.length;
  const withPad = new Uint8Array((((l + 9) >> 6) + 1) << 6);
  withPad.set(msg);
  withPad[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bits >>> 0);
  dv.setUint32(withPad.length - 8, Math.floor(bits / 0x100000000));
  const w = new Int32Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15], b = w[t - 2];
      w[t] = ((rr(b, 17) ^ rr(b, 19) ^ (b >>> 10)) + w[t - 7] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[t - 16]) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  const o = new DataView(out.buffer);
  H.forEach((v, i) => o.setInt32(i * 4, v));
  return out;
}

/* --------------------------------- SHA-1 -------------------------------- */
export function sha1(msg: Uint8Array): Uint8Array {
  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const l = msg.length;
  const p = new Uint8Array((((l + 9) >> 6) + 1) << 6);
  p.set(msg);
  p[l] = 0x80;
  const dv = new DataView(p.buffer);
  dv.setUint32(p.length - 4, (l * 8) >>> 0);
  const w = new Int32Array(80);
  for (let i = 0; i < p.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 80; t++) w[t] = rr(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 31);
    let [a, b, c, d, e] = H;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? ((b & c) | (~b & d)) + 0x5a827999 : t < 40 ? (b ^ c ^ d) + 0x6ed9eba1 : t < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc : (b ^ c ^ d) + 0xca62c1d6;
      const tmp = (rr(a, 27) + f + e + w[t]) | 0;
      e = d; d = c; c = rr(b, 2); b = a; a = tmp;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
  }
  const out = new Uint8Array(20);
  const o = new DataView(out.buffer);
  H.forEach((v, i) => o.setInt32(i * 4, v));
  return out;
}

/* --------------------------------- HMAC --------------------------------- */
function hmac(hash: (b: Uint8Array) => Uint8Array, blockSize: number, key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key.length > blockSize ? hash(key) : key;
  const pad = new Uint8Array(blockSize);
  pad.set(k);
  const o = new Uint8Array(blockSize), i = new Uint8Array(blockSize);
  for (let n = 0; n < blockSize; n++) { o[n] = pad[n] ^ 0x5c; i[n] = pad[n] ^ 0x36; }
  const inner = hash(concat(i, msg));
  return hash(concat(o, inner));
}
export const hmacSha256 = (key: Uint8Array, msg: Uint8Array) => hmac(sha256, 64, key, msg);
export const hmacSha1 = (key: Uint8Array, msg: Uint8Array) => hmac(sha1, 64, key, msg);

export function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
}

export const sha256Hex = (s: string | Uint8Array) => hex(sha256(typeof s === 'string' ? utf8(s) : s));
export const hmacHex = (key: string, msg: string) => hex(hmacSha256(utf8(key), utf8(msg)));

/* ---------------------------- hash-chained log --------------------------- */
export type ChainEntry<T = any> = { seq: number; ts: number; prev: string; hash: string; payload: T };

export function chainAppend<T>(chain: ChainEntry<T>[], payload: T, ts = Date.now()): ChainEntry<T> {
  const prev = chain.length ? chain[chain.length - 1].hash : '0'.repeat(64);
  const seq = chain.length;
  const body = JSON.stringify({ seq, ts, prev, payload });
  return { seq, ts, prev, hash: sha256Hex(body), payload };
}

export function chainVerify(chain: ChainEntry[]): { ok: boolean; brokenAt: number | null } {
  let prev = '0'.repeat(64);
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    const h = sha256Hex(JSON.stringify({ seq: e.seq, ts: e.ts, prev, payload: e.payload }));
    if (e.prev !== prev || h !== e.hash) return { ok: false, brokenAt: i };
    prev = e.hash;
  }
  return { ok: true, brokenAt: null };
}

/* -------------------------- authenticated crypto ------------------------- */
export type KeyPair = { pub: string; sec: string };

export const randomBytes = (n: number) => nacl.randomBytes(n);

export function newBoxKeys(): KeyPair {
  const kp = nacl.box.keyPair();
  return { pub: b64encode(kp.publicKey), sec: b64encode(kp.secretKey) };
}
export function newSignKeys(): KeyPair {
  const kp = nacl.sign.keyPair();
  return { pub: b64encode(kp.publicKey), sec: b64encode(kp.secretKey) };
}

/** E2E message encryption: X25519 ECDH + XSalsa20-Poly1305 AEAD (NaCl box). */
export function sealTo(plaintext: string, theirPub: string, mySec: string) {
  const nonce = nacl.randomBytes(24);
  const ct = nacl.box(utf8(plaintext), nonce, b64decode(theirPub), b64decode(mySec));
  return { n: b64encode(nonce), c: b64encode(ct) };
}
export function openFrom(env: { n: string; c: string }, theirPub: string, mySec: string): string | null {
  const out = nacl.box.open(b64decode(env.c), b64decode(env.n), b64decode(theirPub), b64decode(mySec));
  return out ? fromUtf8(out) : null;
}

/** Field-level envelope encryption: random 256-bit data key per record (AEAD secretbox). */
export function encryptField(plaintext: string, dataKey?: Uint8Array) {
  const key = dataKey ?? nacl.randomBytes(32);
  const nonce = nacl.randomBytes(24);
  const ct = nacl.secretbox(utf8(plaintext), nonce, key);
  return { dek: b64encode(key), n: b64encode(nonce), c: b64encode(ct) };
}
export function decryptField(env: { n: string; c: string }, dek: string): string | null {
  const out = nacl.secretbox.open(b64decode(env.c), b64decode(env.n), b64decode(dek));
  return out ? fromUtf8(out) : null;
}

/** DPDP/GDPR crypto-shredding: destroying the DEK renders ciphertext unrecoverable. */
export function shred(env: { n: string; c: string }) {
  return { ...env, dek: null, shreddedAt: Date.now() };
}

/* --------------------------------- misc --------------------------------- */
export function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  let s = (h >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${hex(nacl.randomBytes(4))}`;
