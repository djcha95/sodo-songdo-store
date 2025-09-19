// src/pages/admin/BoardAdminPage.tsx

import { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
// ✅ [수정] onSnapshot -> getDocs
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
// ✅ [수정] db를 firebaseConfig에서 직접 가져옵니다 (lite 버전 사용)
import { db } from '@/firebase/firebaseConfig';
import './BoardAdminPage.css';
import SodomallLoader from '@/components/common/SodomallLoader';


type RequestStatus = '요청' | '검토중' | '공구확정' | '반려';
interface RequestPost {
  id: string;
  title: string;
  authorName: string;
  createdAt: Timestamp;
  likes: number;
  status: RequestStatus;
}

// ✅ [삭제] 기존 LoadingSpinner 컴포넌트 삭제


const BoardAdminPage = () => {
  useDocumentTitle('게시판 관리');

  const [posts, setPosts] = useState<RequestPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ✅ [수정] 1회성 데이터 조회로 변경
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const postList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestPost));
        setPosts(postList);
      } catch (error) {
        console.error("게시글 목록 로딩 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
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
  
  // ✅ [수정] LoadingSpinner를 SodomallLoader로 교체
  if (isLoading) {
    return <SodomallLoader message="게시판 데이터를 불러오는 중..." />;
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