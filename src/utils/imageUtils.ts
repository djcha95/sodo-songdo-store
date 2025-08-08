// src/utils/imageUtils.ts

/**
 * 원본 이미지 URL과 원하는 사이즈를 기반으로
 * Firebase Storage에 생성된 리사이즈된 WebP 이미지 URL을 반환합니다.
 * 이 함수는 이미 리사이즈된 URL이 들어와도 안전하게 처리합니다.
 * @param originalUrl 원본 이미지의 URL
 * @param size '200x200' 또는 '1080x1080'과 같은 원하는 사이즈 문자열
 * @returns 변환된 WebP 이미지 URL
 */
export const getOptimizedImageUrl = (
  originalUrl: string,
  size: '200x200' | '1080x1080'
): string => {
  // 1. 가드 조항: URL이 유효하지 않거나 Firebase URL이 아니면 원본을 그대로 반환합니다.
  if (!originalUrl || !originalUrl.includes('firebasestorage.googleapis.com')) {
    return originalUrl;
  }

  try {
    // 2. URL에서 쿼리스트링(?alt=media&token=...)을 분리합니다.
    // 이 방식은 URL을 디코딩하지 않으므로, 경로에 포함된 %2F와 같은 인코딩을 그대로 보존하여 안정적입니다.
    const urlParts = originalUrl.split('?');
    const baseUrl = urlParts[0];
    const queryParams = urlParts.length > 1 ? `?${urlParts[1]}` : '';

    // 3. 이미 다른 사이즈의 webp로 변환된 URL일 경우를 대비해, 사이즈 부분을 먼저 제거합니다.
    // 예: .../image_1080x1080.webp -> .../image.webp
    let basePath = baseUrl.replace(/_(\d{1,4}x\d{1,4})\.webp$/i, '.webp');

    // 4. 원본 확장자(.jpg, .png, .webp 등)를 정규식으로 찾아 제거합니다.
    // 이렇게 하면 어떤 확장자로 끝나든 안전하게 처리할 수 있습니다.
    // 예: .../image.webp -> .../image
    const originalExtRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
    basePath = basePath.replace(originalExtRegex, '');
    
    // 5. 최종적으로 원하는 사이즈와 .webp 확장자를 붙여 새로운 URL을 만듭니다.
    const newFileName = `${basePath}_${size}.webp`;
    
    // 6. 분리해두었던 쿼리 파라미터를 다시 붙여 반환합니다.
    return newFileName + queryParams;

  } catch (error) {
    console.error("이미지 URL 최적화 중 오류 발생:", error);
    // 오류 발생 시 원본 URL을 반환하여 이미지가 깨지는 것을 방지합니다.
    return originalUrl;
  }
};