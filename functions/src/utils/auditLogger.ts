// functions/src/utils/auditLogger.ts

import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * 관리자 작업 감사 로그 타입
 */
export interface AdminAuditLog {
  adminId: string;
  adminEmail?: string;
  action: string;
  resourceType: string; // 'order', 'product', 'user', 'stock', etc.
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Timestamp;
  success: boolean;
  errorMessage?: string;
}

/**
 * 관리자 작업 감사 로그를 Firestore에 기록
 * @param logData 감사 로그 데이터
 */
export const logAdminAction = async (logData: Omit<AdminAuditLog, "timestamp">): Promise<void> => {
  try {
    const auditLog: AdminAuditLog = {
      ...logData,
      timestamp: Timestamp.now(),
    };

    await db.collection("adminAuditLogs").add(auditLog);

    // Cloud Functions 로그에도 기록
    const logMessage = `[ADMIN_AUDIT] ${logData.adminId} - ${logData.action} on ${logData.resourceType}${logData.resourceId ? ` (${logData.resourceId})` : ""} - ${logData.success ? "SUCCESS" : "FAILED"}`;
    
    if (logData.success) {
      logger.info(logMessage, logData.details || {});
    } else {
      logger.error(logMessage, { 
        error: logData.errorMessage,
        details: logData.details 
      });
    }
  } catch (error) {
    // 감사 로그 기록 실패는 시스템 로그에만 기록 (무한 루프 방지)
    logger.error("[AUDIT_LOG_ERROR] Failed to write audit log:", error);
  }
};

/**
 * 관리자 작업을 래핑하여 자동으로 감사 로그를 기록하는 헬퍼 함수
 * @param adminId 관리자 ID
 * @param action 작업 이름
 * @param resourceType 리소스 타입
 * @param fn 실행할 함수
 * @param options 추가 옵션
 */
export const withAuditLog = async <T>(
  adminId: string,
  action: string,
  resourceType: string,
  fn: () => Promise<T>,
  options?: {
    resourceId?: string;
    details?: Record<string, any>;
    adminEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<T> => {
  const startTime = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let result: T;

  try {
    result = await fn();
    success = true;
    return result;
  } catch (error: any) {
    success = false;
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    
    await logAdminAction({
      adminId,
      adminEmail: options?.adminEmail,
      action,
      resourceType,
      resourceId: options?.resourceId,
      details: {
        ...options?.details,
        duration: `${duration}ms`,
      },
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      success,
      errorMessage,
    });
  }
};

/**
 * HTTP 요청에서 IP 주소와 User-Agent 추출
 */
export const extractRequestInfo = (request: any): { ipAddress?: string; userAgent?: string } => {
  return {
    ipAddress: request.ip || 
               request.headers["x-forwarded-for"]?.split(",")[0] || 
               request.headers["x-real-ip"] ||
               undefined,
    userAgent: request.headers["user-agent"] || undefined,
  };
};

