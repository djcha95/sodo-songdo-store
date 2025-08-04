// src/pages/customer/LoginPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import type { UserCredential } from "firebase/auth"; // UserCredential 타입 명시적 import
import { auth, processUserSignIn } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

import "./LoginPage.css";

/* ───────── Kakao SDK 초기화 ───────── */
const initKakaoSDK = () =>
  new Promise<void>((resolve, reject) => {
    // 스크립트가 이미 로드 및 초기화되었는지 확인
    if (window.Kakao && window.Kakao.isInitialized()) {
      return resolve();
    }

    // 스크립트가 로드되었지만 초기화되지 않은 경우를 위한 대기 로직
    const wait = () => {
      if (window.Kakao) {
        try {
          const key = import.meta.env.VITE_KAKAO_JS_KEY;
          if (key && !window.Kakao.isInitialized()) {
            window.Kakao.init(key);
          }
          resolve();
        } catch (e) {
          console.error("Kakao SDK init error:", e);
          reject(e);
        }
      } else {
        // window.Kakao가 아직 없으면 잠시 후 다시 시도
        setTimeout(wait, 100);
      }
    };
    wait();
  });

/* ───────── API URL 계산 ───────── */
const getApiUrl = () => {
  // ✅ [수정] 올바른 API 경로로 수정합니다.
  // Vercel에 배포된 서버리스 함수 이름인 'kakaoLogin'에 맞춰 경로를 지정합니다.
  return `/api/kakaoLogin`;
};

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  /* SDK 로드 */
  useEffect(() => {
    initKakaoSDK()
      .catch(() => {
        toast.error("카카오 로그인 기능을 불러오는 데 실패했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  /* 이미 로그인됐으면 홈으로 */
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  /* ───── 카카오 로그인 ───── */
  const handleKakaoLogin = () => {
    if (!window.Kakao?.isInitialized()) {
      toast.error("카카오 SDK가 아직 준비되지 않았습니다.");
      return;
    }

    const kakaoLogin = window.Kakao.Auth?.login;
    if (typeof kakaoLogin !== "function") {
      toast.error("Kakao.Auth.login 메서드를 찾을 수 없습니다.");
      return;
    }

    setLoading(true);

    const loginPromise: Promise<UserCredential> = new Promise((resolve, reject) => {
      kakaoLogin({
        scope: "profile_nickname,account_email,name,gender,age_range,phone_number",
        throughTalk: false,
        success: async ({ access_token }) => {
          try {
            const apiUrl = getApiUrl();
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: access_token }),
            });

            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              // 서버에서 보낸 에러 메시지가 있다면 사용하고, 없다면 기본 메시지 사용
              throw new Error(errorData.message || "Firebase 토큰 생성에 실패했습니다.");
            }

            const { firebaseToken } = await res.json();
            if (!firebaseToken) {
                throw new Error("서버로부터 Firebase 토큰을 받지 못했습니다.");
            }

            const userCred = await signInWithCustomToken(auth, firebaseToken);

            // 카카오 사용자 정보 요청
            const kakaoUserData = await window.Kakao.API.request({
              url: "/v2/user/me",
            });

            // Firestore에 사용자 정보 저장/업데이트
            await processUserSignIn(userCred.user, kakaoUserData);
            resolve(userCred);
          } catch (err) {
            console.error("Login process failed:", err);
            reject(err);
          }
        },
        fail: (err) => {
          console.error("Kakao login failed:", err);
          reject(new Error("카카오 인증에 실패했습니다."));
        },
      });
    });

    toast
      .promise(loginPromise, {
        loading: "카카오 로그인 중...",
        success: "로그인 성공! 환영합니다.",
        error: (err: Error) => err.message || "알 수 없는 오류가 발생했습니다.",
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const disabled = loading || authLoading;

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="title">소도몰</h2>
        <p className="subtitle">소비자도!</p>
        <button
          className="kakao-login-button"
          onClick={handleKakaoLogin}
          disabled={disabled}
        >
          {disabled ? "준비 중..." : "카카오로 시작하기"}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;