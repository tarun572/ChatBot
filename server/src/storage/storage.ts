export type StoredFile = {
  url: string;
  publicId: string;
};

export interface StorageProvider {
  save(key: string, buffer: Buffer, contentType: string): StoredFile;
  remove(publicId: string): void;
}
