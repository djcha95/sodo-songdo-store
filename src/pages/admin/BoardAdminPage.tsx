// src/pages/admin/BoardAdminPage.tsx

import { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle'; // ✅ [추가]
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import './BoardAdminPage.css';
import { Loader } from 'lucide-react';

type RequestStatus = '요청' | '검토중' | '공구확정' | '반려';
interface RequestPost {
  id: string;
  title: string;
  authorName: string;
  createdAt: Timestamp;
  likes: number;
  status: RequestStatus;
}

// 로딩 스피너 컴포넌트 재활용
const LoadingSpinner = () => (
    <div className="loading-overlay">
        <Loader size={48} className="spin" />
        <p>데이터를 불러오는 중...</p>
    </div>
);

const BoardAdminPage = () => {
  useDocumentTitle('게시판 관리'); // ✅ [추가]

  const [posts, setPosts] = useState<RequestPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Firestore 'requests' 컬렉션을 'createdAt' 기준으로 내림차순 정렬하여 실시간으로 가져옴
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    
    // onSnapshot을 사용하여 실시간 업데이트를 구독
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestPost));
      setPosts(postList);
      setIsLoading(false);
    }, (error) => {
      console.error("게시글 목록 실시간 로딩 오류:", error);
      // 오류 발생 시 로딩 상태를 해제하고, 사용자에게 알림을 줄 수 있음
      setIsLoading(false);
      // setError("게시글을 불러오는 데 실패했습니다."); // 필요 시 에러 상태 추가
    });

    // 컴포넌트 언마운트 시 구독 해제
    return () => unsubscribe();
  }, []);

  // 게시글 상태를 업데이트하는 비동기 함수
  const handleStatusChange = async (postId: string, newStatus: RequestStatus) => {
    try {
      const postRef = doc(db, 'requests', postId);
      await updateDoc(postRef, { status: newStatus });
      console.log(`Post ${postId} status updated to ${newStatus}`);
    } catch (error) {
      console.error("게시글 상태 업데이트 실패:", error);
      alert("상태 업데이트에 실패했습니다. 다시 시도해주세요.");
    }
  };
  
  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="board-admin-container">
      <h1 className="board-admin-header">공구 요청 관리</h1>
      <div className="board-table-wrapper">
        {posts.length > 0 ? (
          <table className="board-table">
            <thead>
              <tr>
                <th>요청일</th>
                <th>상품명</th>
                <th>요청자</th>
                <th>추천수</th>
                <th>상태 변경</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td>{post.createdAt?.toDate().toLocaleDateString('ko-KR')}</td>
                  <td>{post.title}</td>
                  <td>{post.authorName}</td>
                  <td>{post.likes}</td>
                  <td>
                    <select
                      value={post.status}
                      onChange={(e) => handleStatusChange(post.id, e.target.value as RequestStatus)}
                      className="board-table-select"
                    >
                      <option value="요청">요청</option>
                      <option value="검토중">검토중</option>
                      <option value="공구확정">공구확정</option>
                      <option value="반려">반려</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data-message">등록된 공구 요청 게시글이 없습니다.</p>
        )}
      </div>
    </div>
  );
};

export default BoardAdminPage;