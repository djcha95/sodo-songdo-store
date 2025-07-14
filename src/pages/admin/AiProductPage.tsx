// src/pages/admin/AiProductPage.tsx

import React from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
// ✅ [수정] ComingSoon 컴포넌트의 실제 파일 위치에 맞게 import 경로를 수정합니다.
import ComingSoon from '@/components/common/ComingSoon';
import { Bot } from 'lucide-react';

const AiProductPage: React.FC = () => {
  useDocumentTitle('AI 상품 추천');

  return (
    <ComingSoon
      title="AI 상품 추천"
      description="준비 중인 기능입니다. AI가 판매 데이터와 트렌드를 분석하여 새로운 공동구매 상품 아이디어를 제안해 드릴 예정입니다."
      icon={<Bot size={48} />}
    />
  );
};

export default AiProductPage;