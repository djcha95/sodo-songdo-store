// src/utils/imageUtils.ts

/**
 * 원본 이미지 URL과 원하는 사이즈를 기반으로
 * Firebase Storage에 생성된 리사이즈된 WebP 이미지 URL을 반환합니다.
 * 이 함수는 이미 리사이즈된 URL이 들어와도 안전하게 처리합니다.
 * @param originalUrl 원본 이미지의 URL
 * @param size '200x200' 또는 '1080x1080'과 같은 원하는 사이즈 문자열
 * @returns 변환된 WebP 이미지 URL
 */
export const getOptimizedImageUrl = (originalUrl: string, size: '200x200' | '1080x1080'): string => {
  if (!originalUrl || !originalUrl.includes('.appspot.com')) {
    return originalUrl;
  }

  try {
    // URL에서 쿼리스트링(?alt=media&token=...)을 분리합니다.
    const urlParts = originalUrl.split('?');
    const baseUrl = urlParts[0];
    const queryParams = urlParts.length > 1 ? `?${urlParts[1]}` : '';

    // 이미 리사이즈된 webp URL인지 확인하고, 그렇다면 기본 이름 부분만 추출합니다.
    // 예: .../image_200x200.webp -> .../image
    const resizedWebpRegex = /_(\d{1,4}x\d{1,4})\.webp$/;
    let basePath = baseUrl.replace(resizedWebpRegex, '');

    // 원본 확장자(.jpg, .png 등)가 남아있다면 제거합니다.
    const originalExtRegex = /\.(jpg|jpeg|png|gif)$/i;
    basePath = basePath.replace(originalExtRegex, '');
    
    // 새로운 파일명과 쿼리스트링을 조합하여 최종 URL을 생성합니다.
    const newFileName = `${basePath}_${size}.webp`;
    return newFileName + queryParams;

  } catch (error) {
    console.error("Error optimizing image URL:", error);
    return originalUrl; // 오류 발생 시 원본 URL 반환
  }
};