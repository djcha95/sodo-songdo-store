// src/utils/imageUtils.ts

/**
 * Firebase Storage 이미지 URL을 Firebase Extensions(Resize Images)를 통해 생성된
 * 최적화된 WebP 이미지 URL로 변환합니다.
 * @param originalUrl 원본 이미지의 Firebase Storage URL
 * @param size 변환할 이미지 사이즈 (예: '200x200' 또는 '1080x1080')
 * @returns 최적화된 WebP 이미지 URL. 변환이 불가능한 경우 원본 URL을 반환합니다.
 */
export const getOptimizedImageUrl = (
  originalUrl: string,
  size: '200x200' | '1080x1080'
): string => {
  // URL이 유효하지 않거나 Firebase Storage URL이 아닌 경우 원본을 그대로 반환합니다.
  if (!originalUrl || !originalUrl.includes('firebasestorage.googleapis.com')) {
    return originalUrl;
  }

  try {
    // URL에서 쿼리 파라미터(예: alt=media&token=...)를 분리합니다.
    const urlObject = new URL(originalUrl);
    const pathname = decodeURIComponent(urlObject.pathname);

    // 파일 경로에서 확장자를 찾아, 파일명과 확장자로 분리합니다.
    // 예: /v0/b/project.appspot.com/o/products/image.jpg
    const lastDotIndex = pathname.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return originalUrl; // 확장자가 없는 URL은 처리하지 않습니다.
    }
    
    const pathWithoutExtension = pathname.substring(0, lastDotIndex);
    
    // 최적화된 이미지 경로를 생성합니다. (예: .../products/image_200x200.webp)
    const newPath = `${pathWithoutExtension}_${size}.webp`;
    
    // 분리했던 쿼리 파라미터를 그대로 유지하여 최종 URL을 조립합니다.
    urlObject.pathname = encodeURIComponent(newPath).replace(/%2F/g, '/');
    
    return urlObject.toString();

  } catch (error) {
    console.error('이미지 URL을 최적화하는 중 오류가 발생했습니다:', error);
    return originalUrl; // 오류 발생 시 안전하게 원본 URL을 반환합니다.
  }
};