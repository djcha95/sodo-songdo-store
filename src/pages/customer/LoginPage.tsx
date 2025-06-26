// src/pages/customer/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // [추가] useNavigate 다시 import
import { signInWithPopup, OAuthProvider } from "firebase/auth";
import { auth } from '../../firebase';
import './LoginPage.css';
import { useAuth } from '@/context/AuthContext';

// [수정] 카카오 SDK 초기화 함수를 더욱 견고하게 만듭니다.
let kakaoInitialized = false;

const initKakao = () => {
  return new Promise<void>((resolve, reject) => {
    if (kakaoInitialized) {
      console.log("DEBUG: Kakao SDK is already initialized (via flag).");
      resolve();
      return;
    }

    if (window.Kakao && window.Kakao.isInitialized()) {
      console.log("DEBUG: Kakao SDK is already initialized (via SDK check).");
      kakaoInitialized = true;
      resolve();
      return;
    }
    
    const checkKakaoLoad = setInterval(() => {
      if (window.Kakao) {
        clearInterval(checkKakaoLoad);
        try {
          console.log("DEBUG: Kakao SDK script is loaded. Initializing...");
          window.Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
          kakaoInitialized = true;
          console.log("DEBUG: Kakao SDK initialized successfully.");
          resolve();
        } catch (error) {
          console.error("DEBUG: Failed to initialize Kakao SDK:", error);
          reject(error);
        }
      }
    }, 100);
  });
};

const LoginPage: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate(); // [추가] useNavigate 훅 사용

  useEffect(() => {
    console.log("DEBUG: LoginPage useEffect is running.");
    initKakao().catch(err => {
      console.error("DEBUG: Kakao SDK 초기화 오류 (useEffect):", err);
      setError("카카오 로그인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.");
    });
  }, []);
  
  // [수정] user 상태가 변경되면 메인 페이지로 즉시 이동
  useEffect(() => {
    if (user) {
      console.log("DEBUG: User is now logged in. Navigating to home from LoginPage.");
      navigate('/', { replace: true });
    }
  }, [user, navigate]);


  const handleKakaoLogin = async () => {
    console.log("DEBUG: handleKakaoLogin clicked.");
    setError('');
    setLoading(true);
    
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      console.error("DEBUG: Kakao SDK is not initialized when button clicked.");
      setError("카카오 SDK가 초기화되지 않았습니다. 잠시만 기다려주세요.");
      setLoading(false);
      return;
    }
    
    try {
      const provider = new OAuthProvider('oidc.kakao');
      console.log("DEBUG: Attempting to sign in with Kakao via Firebase popup.");
      await signInWithPopup(auth, provider);
      console.log("DEBUG: signInWithPopup successful. Waiting for AuthContext update.");
      // 페이지 전환은 useEffect에서 user 상태 변화를 감지하여 처리
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
          console.log("DEBUG: Login popup was closed by user.");
      } else {
          setError(err.message);
          console.error("DEBUG: Kakao login failed:", err);
      }
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="title">차도몰</h2>
        <p className="subtitle">차도몰에 오신 것을 환영합니다!</p>
        <div className="social-login-options">
          {error && <p className="error-message">{error}</p>}
          <button onClick={handleKakaoLogin} className="kakao-login-button" disabled={loading}>
            {loading ? '로그인 중...' : '카카오로 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;