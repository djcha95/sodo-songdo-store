// src/pages/customer/LoginPage.tsx
import React, { useEffect, useState } from "react";
// ✅ [수정] useLocation import 추가
import { useNavigate, useLocation } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import type { UserCredential } from "firebase/auth";
import { auth, processUserSignIn } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

import "./LoginPage.css";

// Kakao 타입 정의 (window 객체 확장을 위해)
declare global {
  interface Window {
    Kakao: any;
  }
}

const KAKAO_SDK_SCRIPT_ID = "kakao-sdk-script";

const LoginPage: React.FC = () => {
  // sdkReady: 스크립트 로드 및 초기화 완료 상태
  // sdkError: 스크립트 로드 실패 상태
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false); // 로그인 버튼 클릭 시 로딩 상태
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // ✅ [추가] useLocation 훅을 사용해 리디렉션 상태를 가져옵니다.
  const location = useLocation();

  useEffect(() => {
    // 스크립트가 이미 있는지 확인
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
            console.error("Kakao JS Key is not configured in environment variables.");
            toast.error("카카오 로그인 설정이 올바르지 않습니다.");
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
        toast.error("카카오 SDK 초기화에 실패했습니다.");
        setSdkError(true);
      }
    };

    script.onerror = () => {
      console.error("Failed to load the Kakao SDK script.");
      toast.error("카카오 로그인 기능을 불러오는 데 실패했습니다.");
      setSdkError(true);
    };

    document.head.appendChild(script);
  }, []);

  /* 이미 로그인됐으면 홈으로 */
  useEffect(() => {
    if (!authLoading && user) {
      // ✅ [수정] 로그인 완료 후, 원래 가려던 페이지로 이동합니다.
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, location.state]);

  /* ───── 카카오 로그인 ───── */
  const handleKakaoLogin = async () => {
    if (!sdkReady || isLoggingIn) {
      if(sdkError) {
        toast.error("카카오 로그인 기능을 사용할 수 없습니다. 페이지를 새로고침 해주세요.");
      } else {
        toast("카카오 로그인을 준비 중입니다. 잠시 후 다시 시도해주세요.");
      }
      return;
    }

    setIsLoggingIn(true);

    const loginPromise: Promise<UserCredential> = new Promise((resolve, reject) => {
      window.Kakao.Auth.login({
        scope: "profile_nickname,account_email,name,gender,age_range,phone_number",
        success: async (authObj: { access_token: string }) => {
          try {
            const apiUrl = "/api/kakaoLogin"; // Vercel 서버리스 함수 경로
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: authObj.access_token }),
            });

            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              throw new Error(errorData.message || "Firebase 토큰 생성에 실패했습니다.");
            }

            const { firebaseToken } = await res.json();
            if (!firebaseToken) {
              throw new Error("서버로부터 Firebase 토큰을 받지 못했습니다.");
            }

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
          console.error("Kakao login failed:", err);
          reject(new Error("카카오 인증에 실패했습니다."));
        },
      });
    });

    toast.promise(loginPromise, {
      loading: "카카오 로그인 중...",
      success: "로그인 성공! 환영합니다.",
      error: (err: Error) => err.message || "알 수 없는 오류가 발생했습니다.",
    }).finally(() => {
      setIsLoggingIn(false);
    });
  };
  
  // 로그인 버튼 비활성화 조건
  const isButtonDisabled = !sdkReady || isLoggingIn || authLoading;

  // 버튼에 표시될 텍스트
  const getButtonText = () => {
    if (authLoading) return "사용자 정보 확인 중...";
    if (!sdkReady && !sdkError) return "카카오 로그인 준비 중...";
    if (sdkError) return "로그인 불가";
    if (isLoggingIn) return "로그인 중...";
    return "카카오로 시작하기";
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="title">소도몰</h2>
        <p className="subtitle">소비자도 도매가로!</p>
        <button
          className="kakao-login-button"
          onClick={handleKakaoLogin}
          disabled={isButtonDisabled}
        >
          {getButtonText()}
        </button>
        {sdkError && (
          <p className="error-message">
            로그인 기능 로드에 실패했습니다. <br/>
            네트워크 상태를 확인 후 새로고침 해주세요.
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginPage;