// src/pages/admin/RaffleEventAdminPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import type { Product, SalesRound } from '@/shared/types';
import toast from 'react-hot-toast';
import { Ticket, Users, Trophy, Clock, Download, AlertTriangle, ArrowLeft, CheckCircle } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import { reportError } from '@/utils/logger';
import dayjs from 'dayjs';
import './RaffleEventAdminPage.css';
// ✅ [추가] 안전한 날짜 변환을 위해 safeToDate 함수를 import 합니다.
import { safeToDate } from '@/utils/productUtils'; 

interface Entrant {
    userId: string;
    name: string;
    phone: string;
    entryAt: { toDate: () => Date }; // 백엔드에서는 Timestamp로 오지만, 프론트에서는 변환 필요
}

interface Winner {
    userId: string;
    name: string;
    phone: string;
}

const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: string | number }> = ({ icon, label, value }) => (
    <div className="stat-card">
        <div className="stat-icon">{icon}</div>
        <div className="stat-content">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
        </div>
    </div>
);

const RaffleEventAdminPage: React.FC = () => {
    const { productId, roundId } = useParams<{ productId: string; roundId: string }>();
    useDocumentTitle('이벤트 추첨 관리');
    
    const [product, setProduct] = useState<Product | null>(null);
    const [round, setRound] = useState<SalesRound | null>(null);
    const [entrants, setEntrants] = useState<Entrant[]>([]);
    const [winners, setWinners] = useState<Winner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDrawing, setIsDrawing] = useState(false);

    const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    const getProductByIdWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductByIdWithStock'), [functions]);
    const getRaffleEntrantsCallable = useMemo(() => httpsCallable(functions, 'getRaffleEntrants'), [functions]);
    const drawRaffleWinnersCallable = useMemo(() => httpsCallable(functions, 'drawRaffleWinners'), [functions]);

    const fetchData = useCallback(async () => {
        if (!productId || !roundId) return;
        setLoading(true);
        try {
            const [productResult, entrantsData] = await Promise.all([
                getProductByIdWithStockCallable({ productId }),
                getRaffleEntrantsCallable({ productId, roundId })
            ]);

            const fetchedProduct = (productResult.data as { product: Product }).product;
            const fetchedRound = fetchedProduct?.salesHistory.find(r => r.roundId === roundId);
            
            if (!fetchedProduct || !fetchedRound) {
                toast.error("이벤트 정보를 찾을 수 없습니다.");
                return;
            }

            setProduct(fetchedProduct);
            setRound(fetchedRound);
            setEntrants((entrantsData.data as { entrants: Entrant[] }).entrants || []);

        } catch (error) {
            reportError("Raffle Event Page Load Failed", error);
            toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    }, [productId, roundId, getRaffleEntrantsCallable, getProductByIdWithStockCallable]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDrawWinners = async () => {
        if (!productId || !roundId || !round) return;
        
        const winnerCount = round.variantGroups[0]?.totalPhysicalStock || 0;
        if (winnerCount <= 0) {
            toast.error("당첨 인원이 설정되지 않아 추첨할 수 없습니다.");
            return;
        }

        toast((t) => (
            <div>
              <h4>추첨을 진행하시겠습니까?</h4>
              <p>
                총 {entrants.length}명 중 {winnerCount}명의 당첨자를 선정합니다.<br/>
                이 작업은 되돌릴 수 없습니다.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  className="toast-button-cancel"
                  onClick={() => toast.dismiss(t.id)}
                >
                  취소
                </button>
                <button
                  className="toast-button-confirm"
                  onClick={async () => {
                    toast.dismiss(t.id);
                    setIsDrawing(true);
                    try {
                        const result = await drawRaffleWinnersCallable({ productId, roundId });
                        const drawnWinners = (result.data as { winners: Winner[] }).winners || [];
                        setWinners(drawnWinners);
                        toast.success(`${drawnWinners.length}명의 당첨자 추첨이 완료되었습니다!`);
                        fetchData();
                    } catch (error: any) {
                        reportError("Raffle Draw Failed", error);
                        toast.error(error.message || "추첨 중 오류가 발생했습니다.");
                    } finally {
                        setIsDrawing(false);
                    }
                  }}
                >
                  추첨 진행
                </button>
              </div>
            </div>
          ), { duration: Infinity, position: 'top-center' }
        );
    };

    const downloadAsCSV = (data: Entrant[] | Winner[], fileName: string) => {
        const headers = ["No", "이름", "연락처", "응모시간"];
        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + data.map((row, index) => {
                const name = `"${row.name}"`;
                const phone = `"${row.phone}"`;
                // ✅ [수정] safeToDate 사용하여 안전하게 날짜 변환
                const time = 'entryAt' in row ? `"${dayjs(safeToDate((row as Entrant).entryAt)).format('YYYY-MM-DD HH:mm')}"` : 'N/A';
                return [index + 1, name, phone, time].join(",");
            }).join("\n");

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `${fileName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <SodomallLoader message="이벤트 정보를 불러오는 중..." />;
    if (!product || !round) return <div className="raffle-page-container"><p>이벤트 정보를 찾을 수 없습니다.</p></div>;

    const isDrawCompleted = round.status === 'DRAW_COMPLETED';
    // ✅ [수정] safeToDate 사용하여 안전하게 날짜 변환
    const canDraw = dayjs().isAfter(dayjs(safeToDate(round.deadlineDate))) && !isDrawCompleted;
    const winnerCount = round.variantGroups[0]?.totalPhysicalStock || 0;
    
    return (
        <div className="admin-page-container raffle-page-container">
            <div className="raffle-page-header">
                <Link to="/admin/products?filterStatus=event" className="back-link"><ArrowLeft size={20} /> 이벤트 목록으로</Link>
                <h1>{product.groupName}</h1>
                <p>{round.roundName} - 이벤트 추첨 관리</p>
            </div>

            <div className="stat-cards-grid">
                <StatCard icon={<Users size={24} />} label="총 응모자" value={`${entrants.length}명`} />
                <StatCard icon={<Trophy size={24} />} label="당첨 인원" value={`${winnerCount}명`} />
                {/* ✅ [수정] safeToDate 사용하여 안전하게 날짜 변환 */}
                <StatCard icon={<Clock size={24} />} label="응모 마감" value={dayjs(safeToDate(round.deadlineDate)).format('YYYY.MM.DD HH:mm')} />
            </div>

            <div className="action-card">
                <h3>추첨 진행</h3>
                {isDrawCompleted ? (
                    <div className="draw-completed-message">
                        <CheckCircle size={20} />
                        <span>이 이벤트는 추첨이 완료되었습니다.</span>
                    </div>
                ) : canDraw ? (
                    <>
                        <p>응모가 마감되었습니다. 아래 버튼을 눌러 추첨을 진행하세요.</p>
                        <button className="draw-button" onClick={handleDrawWinners} disabled={isDrawing || entrants.length === 0}>
                            {isDrawing ? "추첨 중..." : `✨ ${winnerCount}명 공정하게 추첨하기`}
                        </button>
                    </>
                ) : (
                    <div className="draw-disabled-message">
                        <AlertTriangle size={20} />
                        <span>아직 응모 기간이 종료되지 않아 추첨을 진행할 수 없습니다.</span>
                    </div>
                )}
            </div>

            <div className="list-container">
                <div className="list-header">
                    <h2>{isDrawCompleted && winners.length > 0 ? "🏆 최종 당첨자 명단" : "🎟️ 전체 응모자 명단"}</h2>
                    <button className="download-button" onClick={() => downloadAsCSV(isDrawCompleted ? winners : entrants, `${product.groupName}_${isDrawCompleted ? '당첨자' : '응모자'}`)} disabled={(isDrawCompleted ? winners : entrants).length === 0}>
                        <Download size={16} /> 엑셀 다운로드
                    </button>
                </div>
                <div className="table-wrapper">
                     <table>
                        <thead>
                            <tr>
                                <th>순번</th>
                                <th>이름</th>
                                <th>연락처</th>
                                {!isDrawCompleted && <th>응모시간</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {(isDrawCompleted ? winners : entrants).map((person, index) => (
                                <tr key={person.userId}>
                                    <td>{index + 1}</td>
                                    <td>{person.name}</td>
                                    <td>{person.phone}</td>
                                    {/* ✅ [수정] safeToDate 사용하여 안전하게 날짜 변환 */}
                                    {!isDrawCompleted && 'entryAt' in person && <td>{dayjs(safeToDate((person as Entrant).entryAt)).format('YYYY-MM-DD HH:mm')}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {(isDrawCompleted ? winners.length === 0 : entrants.length === 0) && (
                        <div className="no-data-message">{isDrawCompleted ? "당첨 정보가 없습니다." : "응모자가 없습니다."}</div>
                     )}
                </div>
            </div>
        </div>
    );
};

export default RaffleEventAdminPage;