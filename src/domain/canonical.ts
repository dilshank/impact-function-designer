// crc-canonical-json/1 serialisation and the definition hash.
// SHA-256 is implemented here (not crypto.subtle) so hashing stays synchronous and deterministic.

type Json = null | number | string | boolean | Json[] | { [k: string]: Json };

/** Shortest round-trip binary64 form, always with a decimal point or exponent. */
export function canonNum(v: number): string {
  if (v === 0) return '0.0';
  const exp = v.toExponential();
  const m = exp.match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/);
  if (!m) throw new Error('canonNum: non-finite number ' + v);
  const sign = m[1];
  const digits = m[2] + (m[3] || '');
  const e = parseInt(m[4], 10);
  if (e >= -5 && e < 16) {
    let intPart: string;
    let frac: string;
    if (e >= 0) {
      const padded = digits.length <= e + 1 ? digits + '0'.repeat(e + 1 - digits.length) : digits;
      intPart = padded.slice(0, e + 1);
      frac = padded.slice(e + 1);
    } else {
      intPart = '0';
      frac = '0'.repeat(-e - 1) + digits;
    }
    return sign + intPart + '.' + (frac === '' ? '0' : frac);
  }
  const mant = m[2] + (m[3] ? '.' + m[3] : '');
  return sign + mant + 'e' + (e > 0 ? '+' : '-') + Math.abs(e);
}

/** Sorted keys, no whitespace. */
export function canon(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return canonNum(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const o = v as Record<string, Json>;
  const keys = Object.keys(o).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}

/** Readable form in authored key order; short scalar arrays and small objects stay on one line. */
export function pretty(v: unknown, pad = ''): string {
  const next = pad + '  ';
  if (v === null || typeof v !== 'object') return canon(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) return '[' + v.map(canon).join(', ') + ']';
    return '[\n' + v.map((x) => next + pretty(x, next)).join(',\n') + '\n' + pad + ']';
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (!keys.length) return '{}';
  if (keys.every((k) => o[k] === null || typeof o[k] !== 'object') && keys.length <= 2) {
    return '{ ' + keys.map((k) => JSON.stringify(k) + ': ' + canon(o[k])).join(', ') + ' }';
  }
  return '{\n' + keys.map((k) => next + JSON.stringify(k) + ': ' + pretty(o[k], next)).join(',\n') + '\n' + pad + '}';
}

export function utf8(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(bytes: number[]): string {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  const W = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < msg.length; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = (msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) | (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
}

/** SHA-256 of the canonical UTF-8 bytes; never embedded in the definition itself. */
export function definitionHash(def: unknown): string {
  return 'sha256:' + sha256(utf8(canon(def)));
}
