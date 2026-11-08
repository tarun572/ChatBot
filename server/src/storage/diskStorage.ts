import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';

import { AppError } from '../errors.ts';
import type { StorageProvider, StoredFile } from './storage.ts';

export type DiskStorageOptions = {
  uploadDir: string;
  publicBaseUrl: string;
};

export class DiskStorage implements StorageProvider {
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor({ uploadDir, publicBaseUrl }: DiskStorageOptions) {
    this.uploadDir = uploadDir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  save(key: string, buffer: Buffer, contentType: string): StoredFile {
    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedKey || normalizedKey.includes('..')) {
      throw new AppError(400, 'invalid_storage_key', 'Invalid storage key');
    }

    const destination = resolve(this.uploadDir, normalizedKey);
    const root = resolve(this.uploadDir);
    if (!destination.startsWith(root)) {
      throw new AppError(400, 'invalid_storage_key', 'Storage key escapes upload directory');
    }

    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, buffer);

    return {
      publicId: normalizedKey,
      url: `${this.publicBaseUrl}/files/${normalizedKey}`,
    };
  }

  remove(publicId: string): void {
    if (!publicId) {
      return;
    }

    const destination = resolve(this.uploadDir, publicId.replace(/\\/g, '/').replace(/^\/+/, ''));
    const root = resolve(this.uploadDir);
    if (!destination.startsWith(root)) {
      return;
    }

    try {
      unlinkSync(destination);
    } catch {
      // ignore missing files during cleanup
    }
  }
}
