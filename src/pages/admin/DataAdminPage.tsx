// src/pages/admin/DataAdminPage.tsx

import React, { useState } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { Database, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
// ✅ [수정] 최종적으로 확정된 두 함수를 import 합니다.
import { runDataReaggregation, runGrant100PointsToAll } from '@/firebase/userService'; 
import './DataAdminPage.css';

const DataAdminPage: React.FC = () => {
  useDocumentTitle("데이터 보정 도구");
  
  // '재계산' 스크립트의 로딩 상태
  const [isLoading, setIsLoading] = useState(false);
  // '100P 지급' 스크립트의 로딩 상태
  const [isGranting, setIsGranting] = useState(false);

  // --- 핸들러 #1: 데이터 전체 재계산 ---
  const handleRunScript = () => {
    toast((t) => (
      <div className="confirmation-toast-content">
        <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--danger-color)' }} />
        <h4>데이터 전체 재계산</h4>
        <p>
          모든 사용자의 픽업/노쇼 횟수와 포인트를 과거 주문 내역 전체를 기반으로 다시 계산합니다.<br/>
          <strong>이 작업은 되돌릴 수 없으며, 사용자 수가 많을 경우 시간이 오래 걸릴 수 있습니다.</strong> 정말 실행하시겠습니까?
        </p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-danger button-medium" onClick={() => {
            toast.dismiss(t.id);
            executeScript();
          }}>네, 실행합니다</button>
        </div>
      </div>
    ), { id: 'reaggregation-confirmation', duration: Infinity, style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  };
  
  const executeScript = () => {
    setIsLoading(true);
    const promise = runDataReaggregation();

    toast.promise(promise, {
      loading: '모든 사용자 데이터 재계산을 시작합니다... (시간이 오래 걸릴 수 있습니다)',
      success: (result) => {
        setIsLoading(false);
        return result.message || '데이터 보정이 성공적으로 완료되었습니다!';
      },
      error: (err) => {
        setIsLoading(false);
        return err.message || '데이터 보정 중 오류가 발생했습니다.';
      }
    }, {
        success: { duration: 6000 },
        error: { duration: 6000 }
    });
  };

  // --- 핸들러 #2: 전체 고객 100P 지급 ---
  const handleGrantPoints = () => {
    toast((t) => (
        <div className="confirmation-toast-content">
        <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--primary-color)' }} />
        <h4>전체 고객 100P 지급 확인</h4>
        <p>
            모든 고객에게 '포인트 시스템 오류 보상' 명목으로
            <br/><strong>100 포인트를 즉시 지급</strong>합니다. 실행하시겠습니까?
        </p>
        <div className="toast-buttons">
            <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
            <button className="common-button button-primary button-medium" onClick={() => {
                toast.dismiss(t.id);
                executeGrantScript();
            }}>네, 지급합니다</button>
        </div>
        </div>
    ));
  };

  const executeGrantScript = () => {
      setIsGranting(true);
      const promise = runGrant100PointsToAll();
      toast.promise(promise, {
          loading: '전체 사용자에게 100 포인트를 지급하는 중...',
          success: (result) => { setIsGranting(false); return result.message; },
          error: (err) => { setIsGranting(false); return err.message; }
      });
  };


  return (
    <div className="data-admin-page">
      <header className="page-header">
        <h1><Database /> 데이터 보정 도구</h1>
        <p>시스템 전체 데이터의 정합성을 맞추기 위한 강력한 도구입니다. 신중하게 사용해주세요.</p>
      </header>

      {/* --- 기능 #1: 데이터 전체 재계산 --- */}
      <div className="danger-zone-card">
        <div className="card-header">
          <AlertTriangle size={20} />
          <h3>전체 사용자 데이터 재계산</h3>
        </div>
        <div className="card-body">
          <p>
            이 버튼을 누르면 서버에서 모든 사용자의 전체 주문 기록을 처음부터 다시 읽어옵니다.
            이를 바탕으로 각 사용자의 **픽업 횟수, 노쇼 횟수, 누적 포인트를 재계산**하여 현재 값에 덮어씁니다.
          </p>
          <ul>
            <li>누락되었던 '픽업 완료' 포인트를 모두 재지급합니다.</li>
            <li>과거 '마감 임박 취소' 건에 대해 0.5 노쇼를 일괄 적용합니다.</li>
            <li>포인트 계산 오류로 인해 발생한 데이터 불일치를 바로잡습니다.</li>
          </ul>
        </div>
        <div className="card-footer">
          <button className="common-button button-danger" onClick={handleRunScript} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spin-icon' : ''} />
            {isLoading ? '실행 중...' : '재계산 스크립트 실행'}
          </button>
        </div>
      </div>

      {/* --- 기능 #2: 전체 고객 100P 지급 --- */}
      <div className="info-card" style={{ marginTop: '2rem' }}>
          <div className="card-header">
              <h3>포인트 시스템 오류 보상 지급</h3>
          </div>
          <div className="card-body">
              <p>
                  이 버튼을 누르면 현재 시스템에 등록된 <strong>모든 사용자</strong>에게
                  '포인트 시스템 오류 보상' 명목으로 <strong>100 포인트를 일괄 지급</strong>합니다.
              </p>
          </div>
          <div className="card-footer">
              <button className="common-button button-primary" onClick={handleGrantPoints} disabled={isGranting}>
                  <RefreshCw size={16} className={isGranting ? 'spin-icon' : ''} />
                  {isGranting ? '지급 중...' : '전체 고객 100P 지급 실행'}
              </button>
          </div>
      </div>
    </div>
  );
};

export default DataAdminPage;