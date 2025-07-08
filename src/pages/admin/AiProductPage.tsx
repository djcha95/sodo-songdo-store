// src/pages/admin/AiProductPage.tsx
// 'React' is declared but its value is never read. 오류 해결을 위해 import React from 'react' 제거
const AiProductPage = () => {
  return (
    <div>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
        AI 상품 자동 등록 (구현 예정)
      </h1>
      <p style={{ marginTop: '1rem' }}>
        이 페이지에서 AI를 사용하여 상품 등록을 자동화할 예정입니다.
      </p>
    </div>
  );
};

export default AiProductPage;