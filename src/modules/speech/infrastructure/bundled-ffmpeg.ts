import { createRequire } from 'node:module';

/**
 * Path to the ffmpeg binary that the `ffmpeg-static` package downloads on install, or `null`
 * on a platform it has no build for. Loaded with `require` because the package is CommonJS
 * and exports the path itself.
 */
export const BUNDLED_FFMPEG_PATH = createRequire(import.meta.url)('ffmpeg-static') as string | null;
