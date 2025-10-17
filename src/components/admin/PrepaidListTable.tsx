// src/components/admin/PrepaidListTable.tsx

import React from 'react';
import { CheckSquare, ChevronDown } from 'lucide-react';
import type { GroupedPrepaidData } from '@/shared/types';
import './PrepaidListTable.css';

interface PrepaidListTableProps {
  groupedData: GroupedPrepaidData[];
  selectedOrderIds: Set<string>;
  onSelectGroup: (orderIds: string[], isSelected: boolean) => void;
  expandedGroups: Set<string>; // ✅ [추가]
  onToggleGroup: (groupKey: string) => void; // ✅ [추가]
}

const PrepaidListTable: React.FC<PrepaidListTableProps> = ({
  groupedData = [],
  selectedOrderIds,
  onSelectGroup,
  expandedGroups,
  onToggleGroup,
}) => {

  const handleCheckboxClick = (e: React.MouseEvent, orderIds: string[], isSelected: boolean) => {
    e.stopPropagation();
    onSelectGroup(orderIds, isSelected);
  };
  
  // ✅ [추가] 상품명과 옵션을 합치는 함수
  const getDisplayProductName = (productName: string, variantName: string): string => {
    if (!variantName || variantName === productName) {
      return productName;
    }
    return `${productName} (${variantName})`;
  };

  return (
    <div className="pcp-table-wrapper">
      <table className="pcp-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}></th>
            <th style={{ width: '45%' }}>상품명 (옵션)</th> {/* ✅ [수정] 헤더 통합 */}
            <th style={{ width: '10%' }}>총 수량</th>
            <th>주문 고객 (수량)</th>
          </tr>
        </thead>
        {groupedData.map(group => {
          const allOrderIdsInGroup = group.orders.map(o => o.id);
          const isGroupSelected = allOrderIdsInGroup.length > 0 && allOrderIdsInGroup.every(id => selectedOrderIds.has(id));
          const isExpanded = expandedGroups.has(group.groupKey); // ✅ [추가] 확장 상태 확인
          
          return (
            <tbody key={group.groupKey} className={`pcp-table-group ${isExpanded ? 'expanded' : ''}`}>
              <tr className="pcp-group-header-row" onClick={() => onToggleGroup(group.groupKey)}>
                <td colSpan={4}> {/* ✅ [수정] colSpan 변경 */}
                  <div className="pcp-group-header-content">
                    <div 
                      className="pcp-checkbox-wrapper" 
                      onClick={(e) => handleCheckboxClick(e, allOrderIdsInGroup, isGroupSelected)}
                    >
                      {isGroupSelected ? <CheckSquare size={20} className="checked-icon" /> : <div className="unchecked-box" />}
                    </div>
                    <h2>{group.groupKey}</h2>
                    <ChevronDown size={22} className="chevron-icon" />
                  </div>
                </td>
              </tr>
              {/* ✅ [추가] isExpanded 상태에 따라 행 렌더링 */}
              {isExpanded && group.products.map(product => (
                <tr key={product.id}>
                  <td></td>
                  {/* ✅ [수정] 상품명/옵션 통합 표시 */}
                  <td>{getDisplayProductName(product.productName, product.variantName)}</td>
                  <td><span className="total-quantity-badge">{product.totalQuantity}</span></td>
                  <td>
                    <div className="customer-list">
                      {product.customers.map((c, index) => (
                        <span key={index} className="customer-tag">
                          {c.name}({c.quantity})
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
};

export default PrepaidListTable;