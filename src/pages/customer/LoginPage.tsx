// src/pages/customer/LoginPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import type { UserCredential } from "firebase/auth";
import { auth, processUserSignIn } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

import "./LoginPage.css";

declare global {
  interface Window {
    Kakao: any;
  }
}

const KAKAO_SDK_SCRIPT_ID = "kakao-sdk-script";

const LoginPage: React.FC = () => {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (document.getElementById(KAKAO_SDK_SCRIPT_ID)) {
      if (window.Kakao && window.Kakao.isInitialized()) {
        setSdkReady(true);
      }
      return;
    }

    const script = document.createElement("script");
    script.id = KAKAO_SDK_SCRIPT_ID;
    script.src = "https://developers.kakao.com/sdk/js/kakao.js";
    script.async = true;

    script.onload = () => {
      try {
        if (window.Kakao) {
          const kakaoJsKey = import.meta.env.VITE_KAKAO_JS_KEY;
          if (!kakaoJsKey) {
            console.error("Kakao JS Key is not configured.");
            toast.error("카카오 로그인 설정 오류");
            setSdkError(true);
            return;
          }
          if (!window.Kakao.isInitialized()) {
            window.Kakao.init(kakaoJsKey);
          }
          setSdkReady(true);
        }
      } catch (error) {
        console.error("Kakao SDK initialization failed:", error);
        setSdkError(true);
      }
    };

    script.onerror = () => {
      toast.error("카카오 기능을 불러오지 못했습니다.");
      setSdkError(true);
    };

    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, location.state]);

  const handleKakaoLogin = async () => {
    if (!sdkReady || isLoggingIn) {
      if(sdkError) {
        toast.error("일시적인 오류입니다. 새로고침 해주세요.");
      } else {
        toast("잠시만 기다려주세요.");
      }
      return;
    }

    setIsLoggingIn(true);

    const loginPromise: Promise<UserCredential> = new Promise((resolve, reject) => {
      window.Kakao.Auth.login({
        scope: "profile_nickname,account_email,name,gender,age_range,phone_number",
        success: async (authObj: { access_token: string }) => {
          try {
            const apiUrl = "/api/kakaoLogin";
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: authObj.access_token }),
            });

            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              throw new Error(errorData.message || "로그인 처리에 실패했습니다.");
            }

            const { firebaseToken } = await res.json();
            if (!firebaseToken) throw new Error("토큰 발급 실패");

            const userCred = await signInWithCustomToken(auth, firebaseToken);
            const kakaoUserData = await window.Kakao.API.request({ url: "/v2/user/me" });
            
            await processUserSignIn(userCred.user, kakaoUserData);
            resolve(userCred);

          } catch (err) {
            console.error("Login process failed:", err);
            reject(err);
          }
        },
        fail: (err: any) => {
          reject(new Error("카카오 인증 실패"));
        },
      });
    });

    toast.promise(loginPromise, {
      loading: "로그인 중입니다...",
      success: "반갑습니다! 송도픽에 오신 것을 환영해요.",
      error: (err: Error) => err.message || "오류가 발생했습니다.",
    }).finally(() => {
      setIsLoggingIn(false);
    });
  };
  
  const isButtonDisabled = !sdkReady || isLoggingIn || authLoading;

  const getButtonText = () => {
    if (authLoading) return "확인 중...";
    if (!sdkReady && !sdkError) return "준비 중...";
    if (isLoggingIn) return "로그인 중...";
    return "카카오로 1초 만에 시작하기";
  }

  return (
    <div className="login-container">
      <div className="login-box">
        {/* 브랜드 영역 */}
        <div className="brand-area">
          <h2 className="title">송도픽</h2>
          <span className="brand-en">SONGDOPICK</span>
        </div>
        
        <p className="subtitle">송도주민의 똑똑한 쇼핑생활</p>
        
        <div className="social-login-options">
          <button
            className="kakao-login-button"
            onClick={handleKakaoLogin}
            disabled={isButtonDisabled}
          >
            {/* 카카오 심볼 아이콘 (필요시 이미지나 svg 추가 가능) */}
            <span className="button-text">{getButtonText()}</span>
          </button>
        </div>

        {sdkError && (
          <p className="error-message">
            네트워크 상태를 확인 후 새로고침 해주세요.
          </p>
        )}
        
        <div className="login-footer">
          <p>이용약관 | 개인정보처리방침</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;