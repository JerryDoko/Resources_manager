import fs from 'node:fs';
import path from 'node:path';

// Source, prepared standalone server and installed desktop resources all use
// different working directories. Never assume the worker lives inside server.
export function resolveKokoroResourceRoot(options: {
  cwd?: string;
  configuredRoot?: string;
  resourceRoot?: string;
  exists?: (file: string) => boolean;
} = {}) {
  const cwd = options.cwd || process.cwd();
  const configured = options.configuredRoot ?? process.env.RM_KOKORO_ROOT;
  const resource = options.resourceRoot ?? process.env.RM_KOKORO_RESOURCE_DIR;
  if (configured || resource) return path.resolve(cwd, configured || resource!);
  const exists = options.exists || fs.existsSync;
  const candidates = [
    path.join(cwd, 'runtime', 'kokoro'),
    path.resolve(cwd, '..', 'kokoro'),
    path.resolve(cwd, '..', '..', 'runtime', 'kokoro'),
  ];
  return candidates.find(root => ['install.mjs', 'kokoro_worker.py', 'ort_engine.py'].every(file => exists(path.join(root, file)))) || candidates[0];
}
