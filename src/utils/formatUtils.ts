// src/utils/formatUtils.ts

/**
 * @description 전화번호를 '010-XXXX-XXXX' 형식으로 변환합니다.
 * @param phone - 데이터베이스에서 가져온 전화번호 문자열 (예: +82 10-1234-5678)
 * @returns 보기 좋게 변환된 전화번호 문자열
 */
export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) {
    return '정보 없음';
  }
  // 국가번호 +82 와 공백을 0으로 변경
  let formatted = phone.replace(/^\+82\s*/, '0');
  
  // 하이픈이 없는 경우 추가 (예: 01012345678 -> 010-1234-5678)
  if (formatted.length === 11 && !formatted.includes('-')) {
    formatted = `${formatted.slice(0, 3)}-${formatted.slice(3, 7)}-${formatted.slice(7)}`;
  }
  
  return formatted;
};