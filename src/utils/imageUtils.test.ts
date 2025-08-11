// src/utils/imageUtils.test.ts

import { describe, it, expect } from 'vitest';
import { getOptimizedImageUrl } from './imageUtils';

describe('getOptimizedImageUrl', () => {
  const jpgUrl = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fsample.jpg?alt=media&token=sample-token';
  const pngUrl = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fanothersample.png?alt=media&token=another-token';

  it('JPG URL을 200x200 사이즈의 WebP URL로 올바르게 변환해야 합니다.', () => {
    const expected = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fsample_200x200.webp?alt=media&token=sample-token';
    const result = getOptimizedImageUrl(jpgUrl, '200x200');
    expect(result).toBe(expected);
  });

  it('PNG URL을 1080x1080 사이즈의 WebP URL로 올바르게 변환해야 합니다.', () => {
    const expected = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fanothersample_1080x1080.webp?alt=media&token=another-token';
    const result = getOptimizedImageUrl(pngUrl, '1080x1080');
    expect(result).toBe(expected);
  });

  it('Firebase Storage URL이 아니면 원본 URL을 그대로 반환해야 합니다.', () => {
    const nonFirebaseUrl = 'https://example.com/image.jpg';
    const result = getOptimizedImageUrl(nonFirebaseUrl, '200x200');
    expect(result).toBe(nonFirebaseUrl);
  });

  it('알 수 없는 파일 확장자를 가진 경우 원본 URL을 그대로 반환해야 합니다.', () => {
    const urlWithUnknownExt = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fsample.svg?alt=media&token=sample-token';
    const result = getOptimizedImageUrl(urlWithUnknownExt, '200x200');
    expect(result).toBe(urlWithUnknownExt);
  });

  it('URL이 비어있는 문자열이면 빈 문자열을 그대로 반환해야 합니다.', () => {
    const result = getOptimizedImageUrl('', '200x200');
    expect(result).toBe('');
  });

  it('파일 확장자가 대문자여도 올바르게 처리해야 합니다.', () => {
    const upperCaseUrl = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fsample.JPG?alt=media&token=sample-token';
    const expected = 'https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/products%2Fsample_200x200.webp?alt=media&token=sample-token';
    const result = getOptimizedImageUrl(upperCaseUrl, '200x200');
    expect(result).toBe(expected);
  });
});