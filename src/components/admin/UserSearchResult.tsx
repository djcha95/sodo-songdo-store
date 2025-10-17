// src/components/admin/UserSearchResult.tsx

import React from 'react';
import type { UserDocument } from '@/shared/types';
import './UserSearchResult.css';

interface UserSearchResultProps {
  user: UserDocument;
  onSelect: (user: UserDocument) => void;
}

const UserSearchResult: React.FC<UserSearchResultProps> = ({ user, onSelect }) => {
  return (
    <button className="user-search-result-item" onClick={() => onSelect(user)}>
      <div className="user-info">
        <span className="user-name">{user.displayName}</span>
        <span className="user-phone">{user.phone || '전화번호 미등록'}</span>
      </div>
      <div className="user-tier">
        <span>{user.loyaltyTier}</span>
      </div>
    </button>
  );
};

export default UserSearchResult;