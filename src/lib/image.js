// 업로드 전 사진 압축. 이미지가 아니거나 변환이 불가능하면 원본을 그대로 사용합니다.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', {type: 'image/jpeg'});
  } catch { return file; }
}
export function safeFileName(name) {
  const base = String(name).normalize('NFC').replace(/[^\w.\-가-힣]+/g, '_').replace(/_+/g, '_').slice(-80);
  return base || 'file';
}
