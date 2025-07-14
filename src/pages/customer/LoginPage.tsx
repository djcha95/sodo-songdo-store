// src/pages/customer/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, OAuthProvider } from "firebase/auth";
import { auth, processUserSignIn } from '../../firebase';
import './LoginPage.css';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// Kakao SDK 초기화 로직
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
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const initializeSDK = async () => {
      try {
        await initKakaoSDK();
      } catch (err) {
        console.error("DEBUG: Kakao SDK 초기화 오류:", err);
        toast.error("카카오 로그인 기능을 불러올 수 없습니다.");
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
    if (!window.Kakao?.isInitialized()) {
      toast.error("카카오 로그인 기능이 아직 준비되지 않았습니다.");
      return;
    }
    
    setLoading(true);
    const provider = new OAuthProvider('oidc.kakao');
    
    provider.addScope('openid');
    provider.addScope('profile_nickname');
    provider.addScope('name');
    provider.addScope('phone_number');
    provider.addScope('gender');
    provider.addScope('age_range');
    // ✅ [추가] 카카오톡 채널 관련 스코프를 추가합니다.
    provider.addScope('plusfriends');

    const loginPromise = signInWithPopup(auth, provider)
      .then(async (result) => {
        try {
          const kakaoUserData = await window.Kakao.API.request({
            url: '/v2/user/me',
          });
          
          await processUserSignIn(result.user, kakaoUserData);

        } catch (apiError) {
          console.error("카카오 사용자 정보 API 요청 실패:", apiError);
          toast.error("사용자 정보를 가져오는 데 실패했습니다.");
          await processUserSignIn(result.user, null);
        }
        return result;
      });

    toast.promise(loginPromise, {
        loading: '카카오 로그인 중입니다...',
        success: <b>로그인 성공! 환영합니다.</b>,
        error: (err) => {
            if (err.code === 'auth/popup-closed-by-user') { return null; }
            console.error("카카오 로그인 상세 오류:", err);
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
          <button onClick={handleKakaoLogin} className="kakao-login-button" disabled={isButtonDisabled}>
            {isButtonDisabled ? '준비 중...' : '카카오로 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;