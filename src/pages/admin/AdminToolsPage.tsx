import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, AlertTriangle, Database, Wrench } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ConfirmModal from '@/components/admin/ConfirmModal';
import './AdminToolsPage.css';
import { functions } from '@/firebase/firebaseConfig';

type FixVariantGroupsTimestampsResult = {
  success: boolean;
  scanned?: number;
  fixed?: number;
  errors?: number;
  message?: string;
};

type FixSalesHistoryShapeResult = {
  success: boolean;
  scanned?: number;
  fixedProducts?: number;
  fixedRounds?: number;
  errors?: number;
  message?: string;
};

const AdminToolsPage = () => {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState<any>(null);
  const [isFixConfirmOpen, setIsFixConfirmOpen] = useState(false);
  const [shapeLoading, setShapeLoading] = useState(false);
  const [shapeResult, setShapeResult] = useState<any>(null);
  const [isShapeConfirmOpen, setIsShapeConfirmOpen] = useState(false);
  const [targetProductId, setTargetProductId] = useState('');

  // ✅ getFunctions(region 하드코딩) 대신 프로젝트 공용 functions 인스턴스 사용
  const rebuildFunction = useMemo(() => httpsCallable(functions, 'rebuildStockStats_v1'), []);
  const fixTimestampFunction = useMemo(
    () => httpsCallable<undefined, FixVariantGroupsTimestampsResult>(functions, 'fixVariantGroupsTimestamps'),
    []
  );
  const fixShapeFunction = useMemo(
    () => httpsCallable<{ productId: string | null }, FixSalesHistoryShapeResult>(functions, 'fixSalesHistoryShape_v1'),
    []
  );

  const runRebuild = async () => {
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

  const runFixTimestamps = async () => {
    setFixLoading(true);
    setFixResult(null);
    const toastId = toast.loading('variantGroups Timestamp 복구 중... (수 분 소요될 수 있습니다)');

    try {
      const result = await fixTimestampFunction();
      
      console.log('복구 결과:', result.data);
      setFixResult(result.data);
      
      toast.success(`작업 완료! ${result.data?.fixed || 0}개 상품이 복구되었습니다.`, { id: toastId, duration: 5000 });

    } catch (error: any) {
      console.error('복구 실패:', error);
      toast.error(`실패: ${error.message}`, { id: toastId });
    } finally {
      setFixLoading(false);
    }
  };

  const runFixShape = async () => {
    setShapeLoading(true);
    setShapeResult(null);
    const toastId = toast.loading('백필(구조 복구) 실행 중... (수 분 소요될 수 있습니다)');

    try {
      const payload = { productId: targetProductId.trim() || null };
      const result = await fixShapeFunction(payload);
      console.log('구조 복구 결과:', result.data);
      setShapeResult(result.data);
      toast.success('백필(구조 복구) 완료!', { id: toastId, duration: 5000 });
    } catch (error: any) {
      console.error('구조 복구 실패:', error);
      toast.error(`실패: ${error.message}`, { id: toastId });
    } finally {
      setShapeLoading(false);
    }
  };

  return (
    <div className="admin-tools-container">
      <AdminPageHeader 
        title="시스템 관리 도구"
        icon={<Settings size={28} />}
        priority="low"
      />

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
              type="button"
              className={`danger-button danger`}
              onClick={() => setIsConfirmOpen(true)}
              disabled={loading}
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

      {/* ✅ 데이터 복구/백필 섹션 */}
      <div className="tools-card" style={{ marginTop: '24px' }}>
        <h2 className="card-title">
          <Wrench className="w-5 h-5 text-purple-600" />
          백필 / 데이터 복구
        </h2>
        
        <div className="warning-box">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <p className="warning-text">
            <strong>주의사항:</strong> 아래 기능들은 “상품이 목록에서 아예 사라지는” 형태의 데이터 손상(배열→객체 등)을 복구하거나,
            `expirationDate` Timestamp 형식 문제를 복구합니다.<br/>
            전체 스캔 시 상품 수에 따라 수 분이 소요될 수 있습니다.
          </p>
        </div>

        <div className="space-y-6">

          <div className="tool-item">
            <div className="tool-info">
              <span className="step-badge step-purple">Backfill</span>
              <h3>백필: salesHistory/variantGroups 배열 구조 복구</h3>
              <p>특정 상품ID만 또는 전체 스캔으로 “목록에서 아예 안 뜨는” 구조 손상을 복구합니다.</p>
            </div>

            <input
              className="tool-input"
              value={targetProductId}
              onChange={(e) => setTargetProductId(e.target.value)}
              placeholder="(선택) 상품ID 입력 시 해당 상품만"
            />
            
            <button
              type="button"
              className={`danger-button danger`}
              onClick={() => setIsShapeConfirmOpen(true)}
              disabled={shapeLoading}
            >
              {shapeLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  백필 진행 중...
                </>
              ) : (
                <>
                  <Wrench size={16} />
                  백필 실행하기
                </>
              )}
            </button>
          </div>

          {shapeResult && (
            <div className="result-box">
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                실행 결과 리포트:
              </h4>
              <div className="bg-gray-800 text-green-400 p-4 rounded text-sm font-mono overflow-auto">
                <p>✅ 성공 여부: {shapeResult.success ? '성공' : '실패'}</p>
                <p>📦 스캔: {shapeResult.scanned?.toLocaleString()}개</p>
                <p>🧩 복구된 상품: {shapeResult.fixedProducts?.toLocaleString()}개</p>
                <p>🧱 복구된 회차(누적): {shapeResult.fixedRounds?.toLocaleString()}개</p>
                <p>❌ 에러: {shapeResult.errors?.toLocaleString()}개</p>
                {shapeResult.message && <p>📝 메시지: {shapeResult.message}</p>}
              </div>
            </div>
          )}
          
          <div className="tool-item">
            <div className="tool-info">
              <span className="step-badge step-purple">Timestamp</span>
              <h3>복구: variantGroups items.expirationDate Timestamp</h3>
              <p>가격 수정 등으로 인해 손상된 Timestamp 데이터를 복구합니다.</p>
            </div>
            
            <button
              type="button"
              className={`danger-button danger`}
              onClick={() => setIsFixConfirmOpen(true)}
              disabled={fixLoading}
            >
              {fixLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  복구 진행 중...
                </>
              ) : (
                <>
                  <Wrench size={16} />
                  복구 실행하기
                </>
              )}
            </button>
          </div>

          {/* 결과 표시 창 */}
          {fixResult && (
            <div className="result-box">
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                실행 결과 리포트:
              </h4>
              <div className="bg-gray-800 text-green-400 p-4 rounded text-sm font-mono overflow-auto">
                <p>✅ 성공 여부: {fixResult.success ? '성공' : '실패'}</p>
                <p>📦 스캔한 상품 수: {fixResult.scanned?.toLocaleString()}개</p>
                <p>🔧 복구된 상품 수: {fixResult.fixed?.toLocaleString()}개</p>
                <p>❌ 에러 발생: {fixResult.errors?.toLocaleString()}개</p>
                {fixResult.message && <p>📝 메시지: {fixResult.message}</p>}
              </div>
            </div>
          )}

        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={async () => {
          setIsConfirmOpen(false);
          await runRebuild();
        }}
        title="재고 통계 재구축을 실행할까요?"
        variant="danger"
        requirePhrase="재구축"
        confirmLabel="재구축 실행"
        cancelLabel="취소"
        description={
          <>
            <p style={{ margin: 0 }}>
              이 작업은 <strong>`orders` 전체를 스캔</strong>하여 <strong>`stockStats_v1`을 다시 계산하고 덮어씁니다.</strong>
              <br />
              주문이 많을수록 시간이 오래 걸릴 수 있습니다.
            </p>
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#7f1d1d" }}>
              <strong>되돌리기 어려운 작업</strong>입니다. 실행 전 대상/상황을 다시 확인하세요.
            </div>
          </>
        }
      />

      <ConfirmModal
        isOpen={isFixConfirmOpen}
        onClose={() => setIsFixConfirmOpen(false)}
        onConfirm={async () => {
          setIsFixConfirmOpen(false);
          await runFixTimestamps();
        }}
        title="variantGroups Timestamp 복구를 실행할까요?"
        variant="danger"
        requirePhrase="복구"
        confirmLabel="복구 실행"
        cancelLabel="취소"
        description={
          <>
            <p style={{ margin: 0 }}>
              이 작업은 <strong>모든 상품의 `variantGroups` 내부 `items` 배열</strong>을 스캔하여 
              <strong>손상된 `expirationDate` Timestamp를 복구합니다.</strong>
              <br />
              상품이 많을수록 시간이 오래 걸릴 수 있습니다 (수 분 소요 가능).
            </p>
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#7f1d1d" }}>
              <strong>되돌리기 어려운 작업</strong>입니다. 실행 전 대상/상황을 다시 확인하세요.
            </div>
          </>
        }
      />

      <ConfirmModal
        isOpen={isShapeConfirmOpen}
        onClose={() => setIsShapeConfirmOpen(false)}
        onConfirm={async () => {
          setIsShapeConfirmOpen(false);
          await runFixShape();
        }}
        title="백필(구조 복구)을 실행할까요?"
        variant="danger"
        requirePhrase="백필"
        confirmLabel="백필 실행"
        cancelLabel="취소"
        description={
          <>
            <p style={{ margin: 0 }}>
              이 작업은 <strong>`salesHistory` / `variantGroups` / `items`</strong>가 배열이 아닌 형태로 저장된 데이터를
              <strong>배열로 복구(백필)</strong>합니다.
              <br />
              상품ID를 입력했다면 해당 상품만, 비워두면 전체를 스캔합니다.
            </p>
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#7f1d1d" }}>
              <strong>되돌리기 어려운 작업</strong>입니다. 실행 전 대상/상황을 다시 확인하세요.
            </div>
          </>
        }
      />
    </div>
  );
};

export default AdminToolsPage;