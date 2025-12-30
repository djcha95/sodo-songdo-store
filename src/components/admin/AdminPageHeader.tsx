// src/components/admin/AdminPageHeader.tsx

import React from 'react';
import './AdminPageHeader.css';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  priority?: 'high' | 'normal' | 'low';
  icon?: React.ReactNode;
}

const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  subtitle,
  actions,
  priority = 'normal',
  icon
}) => {
  return (
    <header className={`admin-page-header priority-${priority}`}>
      <div className="header-content">
        <div className="header-title-section">
          {icon && <div className="header-icon">{icon}</div>}
          <div>
            <h1 className="header-title">{title}</h1>
            {subtitle && <p className="header-subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
    </header>
  );
};

export default AdminPageHeader;





