import type { TableStorage } from './worker-host.ts';

/**
 * Tables in the Origin Private File System, through synchronous access handles: they exist only
 * in dedicated workers, read straight into the buffer the engine then uses without a copy (shared
 * memory, or WebAssembly memory), and have no size limit per value as IndexedDB implementations
 * do. A file left half-written by a
 * closed tab fails the header check and is rebuilt. See docs/adr/0004.
 */
export const opfsStorage: TableStorage = {
  async read(name, allocate) {
    const root = await navigator.storage.getDirectory();
    let file: FileSystemFileHandle;
    try {
      file = await root.getFileHandle(name);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return null;
      throw error;
    }
    const access = await file.createSyncAccessHandle();
    try {
      const bytes = allocate(access.getSize());
      access.read(bytes, { at: 0 });
      return bytes;
    } finally {
      access.close();
    }
  },

  async write(name, bytes) {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle(name, { create: true });
    const access = await file.createSyncAccessHandle();
    try {
      access.truncate(0);
      access.write(bytes, { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
  },
};

/** Storage only exists where the browser offers OPFS with synchronous access. */
export function availableStorage(): TableStorage | null {
  return typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createSyncAccessHandle' in FileSystemFileHandle.prototype
    ? opfsStorage
    : null;
}
