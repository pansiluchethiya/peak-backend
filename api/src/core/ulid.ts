// api/src/core/ulid.ts
import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(time: number, length: number): string {
  let str = '';
  for (let i = length - 1; i >= 0; i -= 1) {
    str = ENCODING[time % ENCODING_LEN] + str;
    time = Math.floor(time / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(length: number): string {
  let str = '';
const bytes = randomBytes(length * 5);
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < length; i += 1) {
    while (bits < 5) {
      acc = (acc << 8) | bytes[i * 5 + (bits >> 3)];
      bits += 8;
    }
    bits -= 5;
    str += ENCODING[(acc >> bits) & 31];
  }
  return str;
}

export function ulid(time?: number): string {
  const now = time ?? Date.now();
  if (now === lastTime) {
    // Increment the random part to keep monotonicity.
    let carry = 1;
    for (let i = lastRandom.length - 1; i >= 0 && carry; i -= 1) {
      const next = lastRandom[i] + carry;
      if (next > 31) {
        lastRandom[i] = 0;
      } else {
        lastRandom[i] = next;
        carry = 0;
      }
    }
    if (carry) {
      // Overflow: bump the timestamp.
      lastTime = now + 1;
      lastRandom = Array.from({ length: RANDOM_LEN }, () => Math.floor(Math.random() * ENCODING_LEN));
    }
  } else {
    lastTime = now;
    lastRandom = Array.from({ length: RANDOM_LEN }, () => Math.floor(Math.random() * ENCODING_LEN));
  }

  const randomStr = lastRandom.map((v) => ENCODING[v]).join('');
  return encodeTime(lastTime, TIME_LEN) + randomStr;
}

export function requestId(): string {
  return `req_${ulid()}`;
}
