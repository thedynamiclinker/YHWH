export const marker: string;
export const hostOnly: string;
export const seeds: ReadonlyArray<{ id: string; label: string; description?: string; image?: string; tools?: string }>;
export function universeName(name: string): string;
export function createSeed(root: string, id: string, fs: {
  mkdir(path: string): Promise<unknown>;
  write(path: string, content: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}, join: (directory: string, path: string) => string): Promise<string>;
