// src/utils/imageUtils.ts

/**
 * 원본 이미지 URL과 원하는 사이즈를 기반으로
 * Firebase Storage에 생성된 리사이즈된 WebP 이미지 URL을 반환합니다.
 * 이 함수는 이중, 삼중으로 인코딩된 URL도 안전하게 처리합니다.
 */
export const getOptimizedImageUrl = (
  originalUrl: string | null | undefined,
  // ✅ [수정] '150x150' 사이즈를 허용 타입에 추가합니다.
  size: '150x150' | '200x200' | '1080x1080'
): string => {
  // ✅ 안전장치: originalUrl이 없으면 최적화하지 않고 빈 문자열 반환 (렌더 크래시 방지)
  if (!originalUrl || typeof originalUrl !== 'string') {
    return '';
  }

  // 이중 안전장치: 이미 리사이즈된 URL이면, 더 이상 처리하지 않고 즉시 반환합니다.
  if (originalUrl.includes(`_${size}.webp`)) {
    return originalUrl;
  }
  
  if (!originalUrl || !originalUrl.includes('firebasestorage.googleapis.com')) {
    return originalUrl;
  }

  try {
    const url = new URL(originalUrl);
    
    const objPathPrefix = "/o/";
    const prefixIndex = url.pathname.indexOf(objPathPrefix);
    if (prefixIndex === -1) {
      return originalUrl;
    }
    
    const basePath = url.pathname.substring(0, prefixIndex + objPathPrefix.length);
    let objectPath = url.pathname.substring(prefixIndex + objPathPrefix.length);

    // "슈퍼 디코더" 로직: 경로에 '%'가 없을 때까지 계속 디코딩합니다.
    // 이중, 삼중 인코딩된 URL(예: %252F)을 완벽하게 처리합니다.
    while (/%/.test(objectPath)) {
        try {
            const decoded = decodeURIComponent(objectPath);
            if (decoded === objectPath) {
                break; // 더 이상 디코딩되지 않으면 루프 중단
            }
            objectPath = decoded;
        } catch (e) {
            // 잘못된 URI인 경우, 디코딩을 중단하고 현재 상태로 사용
            console.error("Malformed URI sequence detected during decoding:", objectPath);
            break;
        }
    }
    // 여기까지 오면 objectPath는 완전히 디코딩된 상태가 됩니다. (예: "products/image.png")

    const lastDotIndex = objectPath.lastIndexOf('.');
    const pathWithoutExt = lastDotIndex === -1 ? objectPath : objectPath.substring(0, lastDotIndex);

    const newObjectPath = `${pathWithoutExt}_${size}.webp`;
    
    url.pathname = basePath + encodeURIComponent(newObjectPath);
    
    return url.toString();

  } catch (error) {
    console.error("이미지 URL 최적화 중 오류 발생:", error);
    return originalUrl;
  }
};