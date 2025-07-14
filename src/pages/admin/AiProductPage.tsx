// src/pages/admin/AiProductPage.tsx

import React from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle'; // ✅ [추가]
import ComingSoon from '@/components/common/admin/ComingSoon'; // ComingSoon 컴포넌트를 가져옵니다.
import { Bot } from 'lucide-react';

const AiProductPage: React.FC = () => {
  useDocumentTitle('AI 상품 추천'); // ✅ [추가]

  return (
    <ComingSoon
      title="AI 상품 추천"
      description="준비 중인 기능입니다. AI가 판매 데이터와 트렌드를 분석하여 새로운 공동구매 상품 아이디어를 제안해 드릴 예정입니다."
      icon={<Bot size={48} />}
    />
  );
};

export default AiProductPage;