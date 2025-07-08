// src/pages/customer/MyPage.tsx

import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { FiChevronRight } from 'react-icons/fi';
import Header from '../../components/Header';
import './MyPage.css';
import toast from 'react-hot-toast';

const MyPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
      toast.success("성공적으로 로그아웃 되었습니다.");
    } catch (error) {
      console.error("로그아웃 오류:", error);
      toast.error("로그아웃 중 오류가 발생했습니다.");
    }
  };

  return (
    <>
      <Header title="마이페이지" />
      <div className="mypage-container">
        <div className="profile-section">
          <h2>{user?.displayName || '사용자'}님</h2>
          <p>오늘도 소도몰과 함께 즐거운 쇼핑되세요!</p>
        </div>

        <nav className="mypage-nav">
          <ul className="mypage-menu-list">
            <li onClick={() => navigate('/mypage/history')}>
              <span>예약 내역</span>
              <FiChevronRight />
            </li>
            {/* 수정: '주문 달력' -> '픽업 달력'으로 텍스트 변경 */}
            <li onClick={() => navigate('/mypage/orders')}>
              <span>픽업 달력</span>
              <FiChevronRight />
            </li>
            {/* 삭제: 고객용 페이지에서 입고 달력 메뉴 제거 */}
            {/* <li onClick={() => navigate('/mypage/arrivals')}>
              <span>입고 달력</span>
              <FiChevronRight />
            </li> */}
            <li onClick={() => {
              navigate('/encore');
              // toast.info 대신 일반 toast 사용
              toast('마감된 상품 목록 페이지로 이동합니다.', { icon: 'ℹ️' }); // 정보 아이콘 추가 예시
            }}>
              <span>마감된 상품 목록</span>
              <FiChevronRight />
            </li>
            {/* [추가됨] 매장 정보 메뉴 */}
            <li onClick={() => navigate('/mypage/store-info')}>
              <span>매장 정보</span>
              <FiChevronRight />
            </li>
          </ul>
        </nav>

        <div className="logout-section">
          <button onClick={handleLogout} className="logout-button">
            로그아웃
          </button>
        </div>
      </div>
    </>
  );
};

export default MyPage;