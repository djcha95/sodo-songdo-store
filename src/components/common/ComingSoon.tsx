// src/components/common/admin/ComingSoon.tsx

import React, { ReactNode } from 'react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: ReactNode; // 아이콘은 선택적 prop으로 받습니다.
}

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center text-gray-500">
      {icon && <div className="mb-4">{icon}</div>}
      <h1 className="text-3xl font-bold text-gray-800 mb-2">{title}</h1>
      <p className="max-w-md">{description}</p>
    </div>
  );
};

export default ComingSoon;