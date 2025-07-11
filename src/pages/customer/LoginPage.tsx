// src/pages/customer/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, OAuthProvider } from "firebase/auth";
import { auth } from '../../firebase';
import './LoginPage.css';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast'; // 1. toast import

const initKakaoSDK = () => {
  return new Promise<void>((resolve, reject) => {
    if (window.Kakao && window.Kakao.isInitialized()) {
      resolve();
      return;
    }
    const checkKakaoLoad = () => {
      if (window.Kakao) {
        try {
          window.Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
          resolve();
        } catch (error) {
          reject(error);
        }
      } else {
        setTimeout(checkKakaoLoad, 100);
      }
    };
    checkKakaoLoad();
  });
};

const LoginPage: React.FC = () => {
  // 2. error 상태 제거
  // const [error, setError] = useState(''); 
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const initializeSDK = async () => {
      try {
        await initKakaoSDK();
      } catch (err) {
        console.error("DEBUG: Kakao SDK 초기화 오류:", err);
        // 3. setError를 toast.error로 교체
        toast.error("카카오 로그인 기능을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        setLoading(false);
      }
    };
    initializeSDK();
  }, []);
  
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleKakaoLogin = async () => {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      toast.error("카카오 로그인 기능이 아직 준비되지 않았습니다. 잠시만 기다려주세요.");
      return;
    }
    
    setLoading(true);
    const provider = new OAuthProvider('oidc.kakao');
    const loginPromise = signInWithPopup(auth, provider);

    // 4. toast.promise로 로그인 과정을 사용자에게 명확히 보여줌
    toast.promise(loginPromise, {
        loading: '카카오 로그인 중입니다...',
        success: <b>로그인 성공! 환영합니다.</b>,
        error: (err) => {
            // 사용자가 팝업을 닫은 경우는 오류 메시지를 띄우지 않음
            if (err.code === 'auth/popup-closed-by-user') {
                return null;
            }
            return '로그인 중 오류가 발생했습니다.';
        }
    }).finally(() => {
        setLoading(false);
    });
  };

  const isButtonDisabled = loading || authLoading;

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="title">소도몰</h2>
        <p className="subtitle">소비자도!</p>
        <div className="social-login-options">
          {/* 5. 기존 오류 메시지 p 태그 제거 */}
          <button onClick={handleKakaoLogin} className="kakao-login-button" disabled={isButtonDisabled}>
            {isButtonDisabled ? '준비 중...' : '카카오로 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;