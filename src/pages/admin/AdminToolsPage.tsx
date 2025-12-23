import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/firebase';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, AlertTriangle, Play, Database } from 'lucide-react';
import './AdminToolsPage.css';

const AdminToolsPage = () => {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  // 👇 새로 바뀐 함수 이름 연결
  const functions = getFunctions(app, 'asia-northeast3');
  const rebuildFunction = httpsCallable(functions, 'rebuildStockStats_v1');

  const runRebuild = async () => {
    // 1. 안전장치: 실행 전 확인
    if (!confirm('⚠️ 주의: 모든 주문 내역을 처음부터 다시 훑어서 통계를 덮어씁니다.\n\n정말 실행하시겠습니까? (시간이 조금 걸릴 수 있습니다)')) {
      return;
    }

    setLoading(true);
    setLastResult(null);
    const toastId = toast.loading('재고 통계 재구축 중... (잠시만 기다려주세요)');

    try {
      // 2. 함수 호출 (파라미터 불필요)
      const result = await rebuildFunction();
      
      console.log('재구축 결과:', result.data);
      setLastResult(result.data);
      
      toast.success('작업 완료! 재고 통계가 갱신되었습니다.', { id: toastId });

    } catch (error: any) {
      console.error('재구축 실패:', error);
      toast.error(`실패: ${error.message}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-tools-container">
      <div className="page-header">
        <Settings className="w-8 h-8 text-gray-700" />
        <h1 className="page-title">시스템 관리 도구</h1>
      </div>

      <div className="tools-card">
        <h2 className="card-title">
          <RefreshCw className="w-5 h-5 text-blue-600" />
          재고 통계 재구축 (Rebuild v1)
        </h2>
        
        <div className="warning-box">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <p className="warning-text">
            <strong>주의사항:</strong> 이 기능은 `orders` 컬렉션 전체를 스캔하여 
            `stockStats_v1`을 <strong>통째로 다시 계산하고 덮어씁니다.</strong><br/>
            주문량이 많을 경우 실행에 수 초~수 분이 소요될 수 있습니다.
          </p>
        </div>

        <div className="space-y-6">
          
          <div className="tool-item">
            <div className="tool-info">
              <span className="step-badge step-blue">Full Scan</span>
              <h3>재고 통계 일괄 복구</h3>
              <p>기존 통계가 꼬였거나 정확하지 않을 때 실행하세요.</p>
            </div>
            
            <button 
              onClick={runRebuild} 
              disabled={loading} 
              className={`run-btn ${loading ? 'btn-disabled' : 'btn-primary'}`}
            >
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  작업 진행 중...
                </>
              ) : (
                <>
                  <Database size={16} />
                  재구축 실행하기
                </>
              )}
            </button>
          </div>

          {/* 결과 표시 창 */}
          {lastResult && (
            <div className="result-box">
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                실행 결과 리포트:
              </h4>
              <div className="bg-gray-800 text-green-400 p-4 rounded text-sm font-mono overflow-auto">
                <p>✅ 성공 여부: {lastResult.success ? '성공' : '실패'}</p>
                <p>📦 스캔한 주문 수: {lastResult.scannedOrders?.toLocaleString()}건</p>
                <p>📝 갱신된 통계 문서: {lastResult.statDocsWritten?.toLocaleString()}개</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AdminToolsPage;