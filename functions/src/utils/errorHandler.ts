// functions/src/utils/errorHandler.ts

import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
 * 에러 타입 분류
 */
export enum ErrorCategory {
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  VALIDATION = "validation",
  NOT_FOUND = "not_found",
  CONFLICT = "conflict",
  RESOURCE_EXHAUSTED = "resource_exhausted",
  INTERNAL = "internal",
  EXTERNAL_SERVICE = "external_service",
}

/**
 * 구조화된 에러 정보
 */
export interface StructuredError {
  code: string;
  message: string;
  category: ErrorCategory;
  details?: Record<string, any>;
  originalError?: Error;
}

/**
 * 에러를 구조화된 형태로 변환
 */
export const normalizeError = (error: unknown): StructuredError => {
  // HttpsError인 경우
  if (error instanceof HttpsError) {
    const category = mapHttpsErrorCodeToCategory(error.code);
    return {
      code: error.code,
      message: error.message,
      category,
      details: error.details as Record<string, any> | undefined,
    };
  }

  // 일반 Error인 경우
  if (error instanceof Error) {
    return {
      code: "internal",
      message: error.message || "알 수 없는 오류가 발생했습니다.",
      category: ErrorCategory.INTERNAL,
      originalError: error,
    };
  }

  // 기타 타입
  return {
    code: "internal",
    message: String(error) || "알 수 없는 오류가 발생했습니다.",
    category: ErrorCategory.INTERNAL,
  };
};

/**
 * HttpsError 코드를 ErrorCategory로 매핑
 */
const mapHttpsErrorCodeToCategory = (code: string): ErrorCategory => {
  switch (code) {
    case "unauthenticated":
      return ErrorCategory.AUTHENTICATION;
    case "permission-denied":
      return ErrorCategory.AUTHORIZATION;
    case "invalid-argument":
    case "failed-precondition":
      return ErrorCategory.VALIDATION;
    case "not-found":
      return ErrorCategory.NOT_FOUND;
    case "already-exists":
    case "aborted":
      return ErrorCategory.CONFLICT;
    case "resource-exhausted":
      return ErrorCategory.RESOURCE_EXHAUSTED;
    case "internal":
    case "unavailable":
    case "deadline-exceeded":
      return ErrorCategory.INTERNAL;
    case "unimplemented":
      return ErrorCategory.EXTERNAL_SERVICE;
    default:
      return ErrorCategory.INTERNAL;
  }
};

/**
 * 에러를 로깅하고 적절한 HttpsError로 변환
 */
export const handleError = (
  error: unknown,
  context?: {
    functionName?: string;
    userId?: string;
    additionalDetails?: Record<string, any>;
  }
): HttpsError => {
  const normalized = normalizeError(error);

  // 에러 로깅
  const logContext = {
    category: normalized.category,
    code: normalized.code,
    functionName: context?.functionName,
    userId: context?.userId,
    ...context?.additionalDetails,
    ...normalized.details,
  };

  if (normalized.category === ErrorCategory.INTERNAL) {
    logger.error(
      `[ERROR] ${context?.functionName || "Unknown"} - ${normalized.message}`,
      {
        ...logContext,
        stack: normalized.originalError?.stack,
      }
    );
  } else {
    logger.warn(
      `[ERROR] ${context?.functionName || "Unknown"} - ${normalized.message}`,
      logContext
    );
  }

  // HttpsError로 변환하여 반환
  if (error instanceof HttpsError) {
    return error;
  }

  // 사용자에게 보여줄 메시지 결정
  let userMessage = normalized.message;
  
  // 내부 에러는 사용자에게 상세 정보를 숨김
  if (normalized.category === ErrorCategory.INTERNAL) {
    userMessage = "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  // FunctionsErrorCode 타입으로 변환 (유효한 에러 코드인지 확인)
  const validErrorCodes = [
    "ok", "cancelled", "unknown", "invalid-argument", "deadline-exceeded",
    "not-found", "already-exists", "permission-denied", "resource-exhausted",
    "failed-precondition", "aborted", "out-of-range", "unimplemented",
    "internal", "unavailable", "data-loss", "unauthenticated"
  ] as const;
  
  type FunctionsErrorCode = typeof validErrorCodes[number];
  const errorCode: FunctionsErrorCode = validErrorCodes.includes(normalized.code as FunctionsErrorCode) 
    ? (normalized.code as FunctionsErrorCode)
    : "internal";

  return new HttpsError(errorCode, userMessage, normalized.details);
};

/**
 * 비동기 함수를 에러 핸들러로 래핑
 */
export const withErrorHandling = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: {
    functionName?: string;
    getUserId?: (...args: Parameters<T>) => string | undefined;
    getAdditionalDetails?: (...args: Parameters<T>) => Record<string, any> | undefined;
  }
): T => {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const userId = context?.getUserId?.(...args);
      const additionalDetails = context?.getAdditionalDetails?.(...args);
      
      throw handleError(error, {
        functionName: context?.functionName || fn.name,
        userId,
        additionalDetails,
      });
    }
  }) as T;
};


