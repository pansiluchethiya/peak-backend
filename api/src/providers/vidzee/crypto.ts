/**
 * VidZee serves its stream index encrypted with a small WebAssembly module that
 * is shipped inside the player bundle. This module reproduces the (public)
 * glue the player uses so the API can decrypt the payload server side.
 */

interface VidzeeExports {
  memory: WebAssembly.Memory;
  __new(size: number, align?: number): number;
  __pin(ptr: number): number;
  __unpin(ptr: number): void;
  decrypt(a: number, b: number): number;
}

interface VidzeeCrypto {
  decrypt(bytes: Uint8Array, hostname: string): Uint8Array | null;
}

function createGlue(exports: VidzeeExports): VidzeeCrypto {
  const view = new DataView(exports.memory.buffer);
  const pinned = new Map<number, number>();

  const readU32 = (address: number): number => view.getUint32(address, true);
  const writeU32 = (address: number, value: number): void => view.setUint32(address, value, true);

  const allocString = (value: string): number => {
    const pointer = exports.__new(value.length << 1, 2) >>> 0;
    const utf16 = new Uint16Array(exports.memory.buffer);
    for (let index = 0; index < value.length; index += 1) {
      utf16[(pointer >>> 1) + index] = value.charCodeAt(index);
    }
    return pointer;
  };

  const allocBytes = (bytes: Uint8Array): number => {
    const length = bytes.length;
    const dataPointer = exports.__pin(exports.__new(length, 1)) >>> 0;
    const handle = exports.__new(12, 6) >>> 0;
    writeU32(handle, dataPointer);
    writeU32(handle + 4, dataPointer);
    writeU32(handle + 8, length);
    new Uint8Array(exports.memory.buffer, dataPointer, length).set(bytes);
    exports.__unpin(dataPointer);
    return handle;
  };

  const readResult = (pointer: number): Uint8Array | null => {
    if (!pointer) return null;
    const length = readU32(pointer + 8) / Uint8Array.BYTES_PER_ELEMENT;
    return new Uint8Array(exports.memory.buffer, readU32(pointer + 4), length).slice();
  };

  const pin = (pointer: number): number => {
    if (pointer) {
      const count = pinned.get(pointer);
      if (count) pinned.set(pointer, count + 1);
      else pinned.set(exports.__pin(pointer), 1);
    }
    return pointer;
  };

  const unpin = (pointer: number): void => {
    if (!pointer) return;
    const count = pinned.get(pointer);
    if (count === 1) {
      exports.__unpin(pointer);
      pinned.delete(pointer);
    } else if (count) {
      pinned.set(pointer, count - 1);
    }
  };

  return {
    decrypt(bytes: Uint8Array, hostname: string): Uint8Array | null {
      const byteHandle = pin(allocBytes(bytes));
      const hostHandle = allocString(hostname);
      try {
        return readResult(exports.decrypt(byteHandle, hostHandle) >>> 0);
      } finally {
        unpin(byteHandle);
      }
    },
  };
}

let cryptoPromise: Promise<VidzeeCrypto | null> | null = null;

/** Pull the WebAssembly module out of the player bundle. */
export function extractWasmBase64(bundle: string): string | undefined {
  const candidates = bundle.match(/[A-Za-z0-9+/]{1000,}={0,2}/g) ?? [];
  for (const candidate of candidates.sort((a, b) => b.length - a.length)) {
    const decoded = Buffer.from(candidate, 'base64');
    if (decoded.subarray(0, 4).toString('binary') === '\0asm') return candidate;
  }
  return undefined;
}

export function createVidzeeCrypto(wasmBase64: string): VidzeeCrypto | null {
  try {
    const bytes = Buffer.from(wasmBase64, 'base64');
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module, {
      env: {
        abort(): void {
          throw new Error('vidzee wasm aborted');
        },
      },
    });
    return createGlue(instance.exports as unknown as VidzeeExports);
  } catch {
    return null;
  }
}

/** Load (and cache) the VidZee WebAssembly crypto helper. */
export function loadVidzeeCrypto(bundleUrl: string): Promise<VidzeeCrypto | null> {
  cryptoPromise ??= (async () => {
    try {
      const response = await fetch(bundleUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const bundle = await response.text();
      const wasmBase64 = extractWasmBase64(bundle);
      if (!wasmBase64) return null;
      return createVidzeeCrypto(wasmBase64);
    } catch {
      return null;
    }
  })();
  return cryptoPromise;
}
