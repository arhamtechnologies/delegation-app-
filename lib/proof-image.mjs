// Shrinks a proof screenshot in the browser before it goes to Supabase Storage.
// Phone screenshots (e.g. 1170×2532) come out around 924×2000 WebP, typically 100–400 KB, and text stays readable.

export const TASK_PROOF_BUCKET = 'task-proofs';
export const TASK_PROOF_RETENTION_DAYS = 30;

export const proofImageLimits = {
  maxLongEdge: 2000,
  maxShortEdge: 1200,
  targetBytes: 450 * 1024,
  maxBytes: 1900 * 1024, // the bucket allows 2 MB
  maxInputBytes: 30 * 1024 * 1024,
};

export function fitWithin(width, height, { maxLongEdge = proofImageLimits.maxLongEdge, maxShortEdge = proofImageLimits.maxShortEdge } = {}) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height), maxShortEdge / Math.min(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall back to <img> (e.g. HEIC on Safari) */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let webpSupported;
// Older Safari cannot encode WebP (toBlob silently returns PNG), so check once and use JPEG there.
function outputType() {
  if (webpSupported === undefined) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpSupported = probe.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported ? 'image/webp' : 'image/jpeg';
}

// Returns { blob, type, extension, width, height, originalBytes }.
export async function optimiseProofImage(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Choose an image file (a screenshot or photo).');
  if (file.size > proofImageLimits.maxInputBytes) throw new Error('That image is too large. Choose one under 30 MB.');

  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('This image could not be read. Take a PNG or JPG screenshot and try again.');
  }

  const type = outputType();
  let best = null;
  try {
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    let { width, height } = fitWithin(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff'; // transparent PNG areas would turn black in JPEG
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, width, height);

      for (const quality of [0.82, 0.72, 0.6, 0.5]) {
        const blob = await encode(canvas, type, quality);
        if (!blob) continue;
        best = { blob, width, height };
        if (blob.size <= proofImageLimits.targetBytes) break;
      }
      if (best && best.blob.size <= proofImageLimits.maxBytes) break;
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
  } finally {
    source.close?.();
  }

  if (!best || best.blob.size > proofImageLimits.maxBytes) throw new Error('This image could not be made small enough. Try a smaller screenshot.');
  return { blob: best.blob, type, extension: type === 'image/webp' ? 'webp' : 'jpg', width: best.width, height: best.height, originalBytes: file.size };
}
