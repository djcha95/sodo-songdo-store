// src/pages/customer/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, OAuthProvider } from "firebase/auth";
import { auth } from '../../firebase';
import './LoginPage.css';
import { useAuth } from '@/context/AuthContext';

// [개선] 카카오 SDK 초기화 함수를 Promise 기반으로 변경
const initKakaoSDK = () => {
  return new Promise<void>((resolve, reject) => {
    // 이미 초기화된 경우 즉시 resolve
    if (window.Kakao && window.Kakao.isInitialized()) {
      console.log("DEBUG: Kakao SDK is already initialized.");
      resolve();
      return;
    }

    // 스크립트 로드 상태를 확인하는 함수
    const checkKakaoLoad = () => {
      if (window.Kakao) {
        try {
          console.log("DEBUG: Kakao SDK script loaded. Initializing...");
          window.Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
          console.log("DEBUG: Kakao SDK initialized successfully.");
          resolve();
        } catch (error) {
          console.error("DEBUG: Failed to initialize Kakao SDK:", error);
          reject(error);
        }
      } else {
        // SDK가 로드될 때까지 재귀적으로 확인
        setTimeout(checkKakaoLoad, 100);
      }
    };

    // 최초 로드 확인
    checkKakaoLoad();
  });
};

const LoginPage: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); // [수정] 초기 로딩 상태를 true로 설정
  const { user, loading: authLoading } = useAuth(); // AuthContext의 로딩 상태도 가져옴
  const navigate = useNavigate();

  // [개선] 컴포넌트 마운트 시 카카오 SDK 초기화를 시도하고 로딩 상태를 관리
  useEffect(() => {
    const initializeSDK = async () => {
      try {
        await initKakaoSDK();
      } catch (err) {
        console.error("DEBUG: Kakao SDK 초기화 오류:", err);
        setError("카카오 로그인 기능을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        setLoading(false); // SDK 초기화 완료 후 로딩 상태 해제
      }
    };
    initializeSDK();
  }, []);
  
  // [수정] user 상태 변경 시 페이지 전환 로직
  useEffect(() => {
    // AuthContext의 user와 loading 상태를 모두 확인
    if (!authLoading && user) {
      console.log("DEBUG: User logged in. Redirecting to home.");
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleKakaoLogin = async () => {
    console.log("DEBUG: handleKakaoLogin clicked.");
    setError('');
    setLoading(true); // 버튼 클릭 시 다시 로딩 상태로 변경
    
    // [개선] SDK가 초기화되지 않았으면 즉시 오류 처리
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      setError("카카오 로그인 기능이 아직 준비되지 않았습니다. 잠시만 기다려주세요.");
      setLoading(false);
      return;
    }
    
    try {
      const provider = new OAuthProvider('oidc.kakao');
      console.log("DEBUG: Attempting to sign in with Kakao via Firebase popup.");
      await signInWithPopup(auth, provider);
      // AuthContext의 user 상태가 업데이트되면 useEffect에서 리디렉션 처리
      console.log("DEBUG: signInWithPopup successful. Waiting for AuthContext to update user state.");
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
          console.log("DEBUG: Login popup was closed by user.");
      } else {
          setError(err.message);
          console.error("DEBUG: Kakao login failed:", err);
      }
      setLoading(false); // 로그인 실패 시 로딩 상태 해제
    }
  };

  const isButtonDisabled = loading || authLoading;

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="title">차도몰</h2>
        <p className="subtitle">차도몰에 오신 것을 환영합니다!</p>
        <div className="social-login-options">
          {error && <p className="error-message">{error}</p>}
          <button onClick={handleKakaoLogin} className="kakao-login-button" disabled={isButtonDisabled}>
            {isButtonDisabled ? '준비 중...' : '카카오로 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;