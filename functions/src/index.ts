// functions/src/index.ts

import {onRequest} from "firebase-functions/v2/https";
// ✨ [수정] onDocumentUpdated 추가
import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Response} from "express";
import * as logger from "firebase-functions/logger";

import {initializeApp, applicationDefault, AppOptions} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

import axios from "axios";
import cors from "cors";

// ─────────────────────────────────────────────────────────────────────────────
// ✨ 1. 초기 설정 및 공통 타입/함수 정의
// ─────────────────────────────────────────────────────────────────────────────

if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}

const appOptions: AppOptions = { projectId: "sso-do" };
if (!process.env.FUNCTIONS_EMULATOR) {
  appOptions.credential = applicationDefault();
}
initializeApp(appOptions);

const auth = getAuth();
const db = getFirestore();

const corsHandler = cors({
  origin: [
    "http://localhost:5173",
    "http://sodo-songdo.store",
    "https://sodomall.vercel.app",
  ],
});

// 공통 타입 정의 (프론트엔드 types.ts와 동기화)
interface PointLog {
  amount: number;
  reason: string;
  createdAt: Timestamp;
  orderId?: string;
  expiresAt?: Timestamp | null;
  isExpired?: boolean;
}

interface UserDocument {
  uid: string;
  displayName: string | null;
  points: number;
  pickupCount?: number;
  referredBy?: string | null;
  pointHistory?: PointLog[];
}

// 등급 계산 로직 (Cloud Functions 환경에 맞게 재정의)
const calculateTier = (points: number): string => {
  if (points >= 500) return "공구의 신";
  if (points >= 200) return "공구왕";
  if (points >= 50) return "공구요정";
  if (points >= 0) return "공구새싹";
  if (points >= -299) return "주의 요망";
  return "참여 제한";
};

// ✨ [신규] 함수 내에서 사용할 포인트 정책
const POINT_POLICIES = {
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
};


// ─────────────────────────────────────────────────────────────────────────────
// � 2. HTTP 함수 (클라이언트 요청 처리)
// ─────────────────────────────────────────────────────────────────────────────

export const kakaoLogin = onRequest(
  {region: "asia-northeast3"},
  (request, response: Response) => {
    corsHandler(request, response, async () => {
      if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
      }
      const token: string | undefined = request.body.token;
      if (!token) {
        return response
          .status(400)
          .json({message: "카카오 토큰이 제공되지 않았습니다."});
      }
      try {
        const kakaoUserResponse = await axios.get(
          "https://kapi.kakao.com/v2/user/me",
          {headers: {Authorization: `Bearer ${token}`}}
        );
        const kakaoId = kakaoUserResponse.data.id;
        if (!kakaoId) {
          throw new Error("카카오 사용자 ID를 가져올 수 없습니다.");
        }
        const uid = `kakao:${kakaoId}`;
        try {
          await auth.getUser(uid);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            (error as { code?: string }).code === "auth/user-not-found"
          ) {
            await auth.createUser({
              uid,
              email: kakaoUserResponse.data.kakao_account?.email,
              displayName: kakaoUserResponse.data.properties?.nickname,
            });
          } else {
            throw error;
          }
        }
        const firebaseToken = await auth.createCustomToken(uid);
        return response.status(200).json({firebaseToken});
      } catch (error: unknown) {
        let errorMessage = "인증 처리 중 서버에서 오류가 발생했습니다.";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        logger.error("Firebase 커스텀 토큰 생성 중 오류:", error);
        if (axios.isAxiosError(error)) {
          logger.error("Axios error details:", error.response?.data);
        }
        return response.status(500).json({message: errorMessage, error: error});
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 3. Firestore 단순 트리거 함수 (단일 문서 변경 감지)
// ─────────────────────────────────────────────────────────────────────────────

export const createNotificationOnPointChange = onDocumentCreated(
  {
    document: "users/{userId}/pointLogs/{logId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("이벤트에 데이터가 없습니다.", {params: event.params});
      return;
    }

    const {userId} = event.params;
    const pointLog = snapshot.data();
    const {amount, reason} = pointLog;

    if (amount === 0) {
      return;
    }

    if (amount === undefined || !reason) {
      logger.error("포인트 로그에 amount 또는 reason 필드가 없습니다.", {
        data: pointLog,
      });
      return;
    }

    let message = "";
    if (amount > 0) {
      message = `🎉 '${reason}'으로 ${amount.toLocaleString()}P가 적립되었어요!`;
    } else {
      message = `🛍️ '${reason}'으로 ${Math.abs(
        amount
      ).toLocaleString()}P를 사용했어요.`;
    }

    const newNotification = {
      message,
      type: amount > 0 ? "POINTS_EARNED" : "POINTS_USED",
      read: false,
      timestamp: FieldValue.serverTimestamp(),
      link: "/mypage/points",
    };

    try {
      await db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .add(newNotification);
      logger.info(`사용자 [${userId}]에게 알림을 성공적으로 보냈습니다.`);
    } catch (error) {
      logger.error(
        `사용자 [${userId}]에게 알림을 보내는 중 오류 발생:`,
        error
      );
    }
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// ✨ 4. Firestore 복합 트리거 함수 (여러 문서 조회/수정)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @description 신규 유저가 첫 픽업을 완료했을 때, 추천인에게 보상 포인트를 지급합니다.
 */
export const rewardReferrerOnFirstPickup = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event) => {
    if (!event.data) {
      logger.error("이벤트 데이터가 없습니다.");
      return;
    }

    const before = event.data.before.data();
    const after = event.data.after.data();

    // 1. 주문 상태가 'PICKED_UP'으로 변경되었는지 확인
    if (before.status === "PICKED_UP" || after.status !== "PICKED_UP") {
      return;
    }

    const newUserId = after.userId;
    if (!newUserId) {
      logger.warn("주문 데이터에 userId가 없습니다.");
      return;
    }
    const newUserRef = db.collection("users").doc(newUserId);

    try {
      const newUserDoc = await newUserRef.get();
      if (!newUserDoc.exists) {
        logger.warn(`주문자(ID: ${newUserId})의 사용자 문서를 찾을 수 없습니다.`);
        return;
      }

      const newUser = newUserDoc.data() as UserDocument;

      // 2. 이 픽업이 '첫 번째' 픽업이고, 추천인을 통해 가입했는지 확인
      // pickupCount는 픽업 완료 시점에 1이 되므로, 이전 상태(0)를 기준으로 판단
      const isFirstPickup = (newUser.pickupCount || 0) === 1;
      const wasReferred = newUser.referredBy && newUser.referredBy !== "__SKIPPED__";

      if (isFirstPickup && wasReferred) {
        logger.info(`첫 픽업 사용자(ID: ${newUserId}) 확인. 추천인 검색을 시작합니다.`);

        // 3. 추천인 찾기
        const referrerQuery = db.collection("users")
          .where("referralCode", "==", newUser.referredBy)
          .limit(1);

        const referrerSnapshot = await referrerQuery.get();
        if (referrerSnapshot.empty) {
          logger.warn(`추천인 코드(${newUser.referredBy})에 해당하는 사용자를 찾을 수 없습니다.`);
          return;
        }

        const referrerDoc = referrerSnapshot.docs[0];
        const referrerRef = referrerDoc.ref;
        const rewardPoints = POINT_POLICIES.FRIEND_INVITED.points;
        
        // 4. 추천인에게 포인트 지급 (트랜잭션)
        await db.runTransaction(async (transaction) => {
          const freshReferrerDoc = await transaction.get(referrerRef);
          if (!freshReferrerDoc.exists) return;
          
          const referrerData = freshReferrerDoc.data() as UserDocument;
          const currentPoints = referrerData.points || 0;
          const newPoints = currentPoints + rewardPoints;
          const newTier = calculateTier(newPoints);
          
          const now = new Date();
          const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

          const pointLog: Omit<PointLog, "id"> = {
            amount: rewardPoints,
            reason: `${POINT_POLICIES.FRIEND_INVITED.reason} (${newUser.displayName || "신규회원"}님)`,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(expirationDate),
          };

          transaction.update(referrerRef, {
            points: newPoints,
            loyaltyTier: newTier,
            pointHistory: FieldValue.arrayUnion(pointLog),
          });
        });
        
        logger.info(`추천인(ID: ${referrerRef.id})에게 ${rewardPoints}P 지급 완료.`);
      }
    } catch (error) {
      logger.error("추천인 보상 처리 중 오류 발생:", error);
    }
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// 🗓️ 5. 스케줄링 함수 (주기적 실행)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @description 매일 자정에 실행되어 만료된 포인트를 자동으로 소멸시키는 스케줄링 함수
 */
export const expirePointsScheduled = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (event) => {
    logger.log("포인트 유효기간 만료 처리를 시작합니다.");
    const now = new Date();
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      logger.log("처리할 사용자가 없습니다.");
      return;
    }

    const batch = db.batch();
    let updatedUserCount = 0;

    snapshot.forEach((doc) => {
      const user = doc.data() as UserDocument;
      const pointHistory = user.pointHistory || [];
      let totalExpiredAmount = 0;

      const newPointHistory = pointHistory.map((log) => {
        if (
          log.amount > 0 &&
          log.expiresAt &&
          !log.isExpired &&
          log.expiresAt.toDate() <= now
        ) {
          totalExpiredAmount += log.amount;
          return {...log, isExpired: true};
        }
        return log;
      });

      if (totalExpiredAmount > 0) {
        updatedUserCount++;
        const currentPoints = user.points || 0;
        const newPoints = currentPoints - totalExpiredAmount;
        const newTier = calculateTier(newPoints);

        const expirationLog: Omit<PointLog, "orderId" | "isExpired"> = {
          amount: -totalExpiredAmount,
          reason: "포인트 기간 만료 소멸",
          createdAt: Timestamp.now(),
          expiresAt: null,
        };
        newPointHistory.push(expirationLog as PointLog);

        const userRef = usersRef.doc(doc.id);
        batch.update(userRef, {
          points: newPoints,
          loyaltyTier: newTier,
          pointHistory: newPointHistory,
        });

        logger.log(`사용자 ${doc.id}: ${totalExpiredAmount}포인트 소멸 처리.`);
      }
    });

    if (updatedUserCount > 0) {
      await batch.commit();
      logger.log(
        `총 ${updatedUserCount}명의 사용자에 대한 포인트 소멸 처리가 완료되었습니다.`
      );
    } else {
      logger.log("금일 소멸될 포인트가 없습니다.");
    }
  }
);