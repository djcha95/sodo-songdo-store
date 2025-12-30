// src/components/admin/MenuGroup.tsx

import React from 'react';
import './MenuGroup.css';

interface MenuGroupProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isSidebarOpen: boolean;
  priority?: 'high' | 'normal' | 'low';
}

const MenuGroup: React.FC<MenuGroupProps> = ({
  title,
  icon,
  children,
  isSidebarOpen,
  priority = 'normal'
}) => {
  if (!isSidebarOpen) {
    // 사이드바가 접혔을 때는 그룹 헤더 없이 아이템만 표시
    return <ul className="menu-group">{children}</ul>;
  }

  return (
    <div className={`menu-group priority-${priority}`}>
      <div className="menu-group-header">
        {icon && <span className="menu-group-icon">{icon}</span>}
        <span className="menu-group-title">{title}</span>
      </div>
      <ul className="menu-group-list">{children}</ul>
    </div>
  );
};

export default MenuGroup;





