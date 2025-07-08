// src/context/AdminBulkSelectionContext.tsx

import React, { createContext, useState, useContext, useCallback } from 'react';

interface AdminBulkSelectionContextType {
  selectedIds: string[];
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

const AdminBulkSelectionContext = createContext<AdminBulkSelectionContextType | undefined>(undefined);

export const AdminBulkSelectionProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.includes(id);
  }, [selectedIds]);

  const value = { selectedIds, toggleSelection, selectAll, clearSelection, isSelected };

  return (
    <AdminBulkSelectionContext.Provider value={value}>
      {children}
    </AdminBulkSelectionContext.Provider>
  );
};

export const useAdminBulkSelection = () => {
  const context = useContext(AdminBulkSelectionContext);
  if (context === undefined) {
    throw new Error('useAdminBulkSelection must be used within an AdminBulkSelectionProvider');
  }
  return context;
};