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
const getApiUrl = () => {
  // 1순위 .env 값
  const envUrl = import.meta.env.VITE_KAKAO_LOGIN_API;
  if (envUrl) return envUrl;

  // 2순위: firebase hosting rewrite → same‑origin + /api/kakaoLogin
  return `${window.location.origin.replace(/\/$/, "")}/api/kakaoLogin`;
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
        // 동의 항목 (전화번호 + 성별·연령대)
        scope: "profile_nickname,account_email,name,gender,age_range,phone_number",
        throughTalk: false, // PC·모바일 통일: 항상 웹 창
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
