// src/utils/imageUtils.ts

/**
 * 원본 이미지 URL과 원하는 사이즈를 기반으로
 * Firebase Storage에 생성된 리사이즈된 WebP 이미지 URL을 반환합니다.
 * @param originalUrl 원본 이미지의 URL
 * @param size '200x200' 또는 '1080x1080'과 같은 원하는 사이즈 문자열
 * @returns 변환된 WebP 이미지 URL
 */
export const getOptimizedImageUrl = (originalUrl: string, size: '200x200' | '1080x1080'): string => {
  if (!originalUrl || !originalUrl.includes('.appspot.com')) {
    return originalUrl;
  }

  const extensionRegex = /\.(jpg|jpeg|png|gif)/i;
  const match = originalUrl.match(extensionRegex);

  // ✅ [오류 수정] match.index가 undefined일 가능성을 확인하는 코드를 추가하여 안정성을 높입니다.
  if (!match || typeof match.index === 'undefined') {
    return originalUrl;
  }

  const fileExtension = match[0];
  const baseName = originalUrl.substring(0, match.index);
  const tokenAndParams = originalUrl.substring(match.index + fileExtension.length);

  const newFileName = `${baseName}_${size}.webp`;

  return newFileName + tokenAndParams;
};