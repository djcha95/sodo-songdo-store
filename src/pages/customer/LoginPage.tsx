// src/pages/customer/LoginPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth, processUserSignIn } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

import "./LoginPage.css";

/* ───────── Kakao SDK 초기화 ───────── */
const initKakaoSDK = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Kakao && window.Kakao.isInitialized()) return resolve();

    const wait = () => {
      if (window.Kakao) {
        try {
          const key = import.meta.env.VITE_KAKAO_JS_KEY;
          if (key && !window.Kakao.isInitialized()) window.Kakao.init(key);
          resolve();
        } catch (e) {
          console.error("Kakao SDK init error:", e);
          reject(e);
        }
      } else setTimeout(wait, 100);
    };
    wait();
  });

/* ───────── API URL 계산 ───────── */
// ✅ [수정] 혼동을 막기 위해 환경 변수(.env)보다 프록시 경로를 항상 우선하도록 변경합니다.
const getApiUrl = () => {
  // 로컬 개발 시에는 Vite 프록시를 통하도록 상대 경로를 반환합니다.
  // 실제 배포 환경(Vercel)에서는 vercel.json의 rewrite 규칙에 의해 처리됩니다.
  return `/api/http-kakaoLogin`;
};

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  /* SDK 로드 */
  useEffect(() => {
    (async () => {
      try {
        await initKakaoSDK();
      } catch {
        toast.error("카카오 로그인 기능을 불러오는 데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* 이미 로그인됐으면 홈으로 */
  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
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

    const loginPromise = new Promise(async (resolve, reject) => {
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
              const { message } = await res.json().catch(() => ({}));
              throw new Error(message || "Firebase 토큰 생성 실패");
            }

            const { firebaseToken } = await res.json();
            const userCred = await signInWithCustomToken(auth, firebaseToken);

            const kakaoUserData = await window.Kakao.API.request({
              url: "/v2/user/me",
            });

            await processUserSignIn(userCred.user, kakaoUserData);
            resolve(userCred);
          } catch (err) {
            reject(err);
          }
        },
        fail: (err) => reject(new Error(JSON.stringify(err))),
      });
    });

    toast
      .promise(loginPromise, {
        loading: "카카오 로그인 중...",
        success: "로그인 성공! 환영합니다.",
        error: (err) => (err as Error).message,
      })
      .finally(() => setLoading(false));
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