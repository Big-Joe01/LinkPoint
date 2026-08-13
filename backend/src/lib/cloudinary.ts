import { config } from '../config/env';

// Cloudinary abstraction — generates optimized, responsive delivery URLs.
// Uploads are handled via signed upload from the mobile app using a backend-generated
// signature; the secret key never leaves the server.

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/** Build a Cloudinary URL with transformations (resize, format, quality, cache). */
export function buildOptimizedUrl(
  publicId: string,
  opts: { width?: number; height?: number; quality?: number | string; format?: string; thumb?: boolean } = {},
): string {
  if (!config.cloudinary.cloudName) {
    return publicId; // fallback: treat as already a URL
  }
  const transforms: string[] = [];
  if (opts.thumb) {
    transforms.push('c_fill,w_400,h_300');
  } else if (opts.width || opts.height) {
    const parts = ['c_limit'];
    if (opts.width) parts.push(`w_${opts.width}`);
    if (opts.height) parts.push(`h_${opts.height}`);
    transforms.push(parts.join(','));
  }
  transforms.push(`q_${opts.quality ?? 'auto'}`);
  transforms.push('f_auto');
  transforms.push('fl_lossy');
  const base = `https://res.cloudinary.com/${config.cloudinary.cloudName}`;
  const raw = publicId.startsWith('http') ? publicId.replace(`${base}/`, '') : publicId;
  return `${base}/${transforms.join(',')}/v1/${raw}`;
}

export function thumbnailUrl(publicId: string): string {
  return buildOptimizedUrl(publicId, { thumb: true });
}

export function responsiveUrl(publicId: string, width: number): string {
  return buildOptimizedUrl(publicId, { width, quality: 'auto:eco' });
}

export function videoPosterUrl(publicId: string): string {
  // Cloudinary can generate a poster frame from a video.
  if (!config.cloudinary.cloudName) return publicId;
  const base = `https://res.cloudinary.com/${config.cloudinary.cloudName}`;
  const raw = publicId.startsWith('http') ? publicId.replace(`${base}/video/upload/`, '') : publicId;
  return `${base}/video/upload/so_0,f_jpg,w_400/${raw}`;
}
