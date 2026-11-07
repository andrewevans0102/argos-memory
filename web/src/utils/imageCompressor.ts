export interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
}

const MAX_DIMENSION = 1600;
const COMPRESSION_QUALITY = 0.8;

/**
 * Resizes and downsamples an image to max dimension 1600px at 0.8 quality WebP.
 * Works with both File (e.g. from file picker) and Blob (e.g. from clipboard paste).
 */
export async function compressImage(
  fileOrBlob: File | Blob,
  maxDimension: number = MAX_DIMENSION,
  quality: number = COMPRESSION_QUALITY
): Promise<CompressionResult> {
  const originalSize = fileOrBlob.size;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(fileOrBlob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Calculate constrained dimensions
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      // Draw to offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context for image compression.'));
        return;
      }

      // Enable high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Export to WebP
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob && webpBlob.type === 'image/webp') {
            resolve({
              blob: webpBlob,
              width,
              height,
              originalSize,
              compressedSize: webpBlob.size,
              mimeType: 'image/webp',
            });
            return;
          }

          // Fallback to JPEG if WebP export is not supported by environment
          canvas.toBlob(
            (jpegBlob) => {
              if (jpegBlob) {
                resolve({
                  blob: jpegBlob,
                  width,
                  height,
                  originalSize,
                  compressedSize: jpegBlob.size,
                  mimeType: 'image/jpeg',
                });
              } else {
                reject(new Error('Canvas image compression failed.'));
              }
            },
            'image/jpeg',
            quality
          );
        },
        'image/webp',
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image for compression: ${err}`));
    };

    img.src = objectUrl;
  });
}

/**
 * Format bytes into human-readable string (e.g. 1.2 MB, 340 KB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
