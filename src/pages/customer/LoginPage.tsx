import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, OAuthProvider } from "firebase/auth";
import { auth } from '../../firebase';
import './LoginPage.css';

// [추가] 카카오 SDK를 초기화하고 Firebase와 연동하기 위한 함수
const initKakao = () => {
  if (window.Kakao && !window.Kakao.isInitialized()) {
    // [중요] 여기에 본인의 카카오 JavaScript 키를 입력해주세요.
    // .env 파일에 VITE_KAKAO_JS_KEY 로 저장하고 사용하시는 것을 추천합니다.
    window.Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
  }
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // [추가] 컴포넌트 마운트 시 카카오 SDK 초기화
  React.useEffect(() => {
    initKakao();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // [추가] 카카오 로그인 핸들러
  const handleKakaoLogin = async () => {
    setError('');
    try {
      // 카카오 로그인이 팝업창을 띄우도록 설정
      const provider = new OAuthProvider('oidc.kakao');
      // Firebase signInWithPopup을 사용하여 카카오 계정으로 로그인
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
      console.error("Kakao 로그인 실패:", err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>로그인</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="login-button">로그인</button>
        </form>
        <div className="social-login-options">
          <button onClick={handleGoogleLogin} className="google-login-button">
            Google로 로그인
          </button>
          {/* [추가] 카카오 로그인 버튼 */}
          <button onClick={handleKakaoLogin} className="kakao-login-button">
            Kakao로 로그인
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;