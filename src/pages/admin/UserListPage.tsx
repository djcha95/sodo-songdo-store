// src/pages/admin/UserListPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import {
	Crown, Gem, Sparkles, ShieldAlert, ShieldX, User, // ✅ [추가]
	Search, ArrowUpDown, Database, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import PointManagementModal from '@/components/admin/PointManagementModal';
import { formatPhoneNumber } from '@/utils/formatUtils';
import type { UserDocument as AppUser, LoyaltyTier } from '@/shared/types';
import './UserListPage.css';

type SortKey = 'createdAt' | 'points' | 'displayName' | 'nickname' | 'noShowCount' | 'loyaltyTier' | 'role' | 'isSuspended';

const tierInfo: Record<LoyaltyTier, { icon: React.ReactNode; color: string }> = {
	'공구의 신': { icon: <Crown size={16} />, color: 'var(--loyalty-god)' },
	'공구왕': { icon: <Gem size={16} />, color: 'var(--loyalty-king)' },
	'공구요정': { icon: <Sparkles size={16} />, color: 'var(--loyalty-fairy)' },
	'공구새싹': { icon: <i className="seedling-icon">🌱</i>, color: 'var(--loyalty-sprout)' },
	'공구초보': { icon: <User size={16} />, color: 'var(--text-color-light)' }, // '공구초보' 추가
	'공구제한': { icon: <ShieldX size={16} />, color: 'var(--loyalty-restricted)' }, // '공구제한'으로 변경
};

const roleInfo: Record<AppUser['role'], { label: string; className: string }> = {
	master: { label: '마스터', className: 'role-master' },
	admin: { label: '관리자', className: 'role-admin' },
	customer: { label: '고객', className: 'role-customer' },
};

const PaginationControls: React.FC<{
	currentPage: number; totalPages: number; onPageChange: (page: number) => void; itemsPerPage: number; onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; totalItems: number;
}> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems }) => {
	if (totalItems === 0) return null;
	return (
		<div className="pagination-container">
			<div className="pagination-left">
				<div className="items-per-page-selector"><label htmlFor="itemsPerPage">표시 개수:</label><select id="itemsPerPage" value={itemsPerPage} onChange={onItemsPerPageChange}><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></div>
			</div>
			<div className="pagination-center">
				<button onClick={() => onPageChange(1)} disabled={currentPage === 1} title="첫 페이지"><ChevronsLeft size={16} /></button>
				<button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>이전</button>
				<span className="page-info">{currentPage} / {totalPages}</span>
				<button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>다음</button>
				<button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} title="마지막 페이지"><ChevronsRight size={16} /></button>
			</div>
			<div className="pagination-right"><span className="total-items-display">총 {totalItems}명</span></div>
		</div>
	);
};

const UserListPage = () => {
	useDocumentTitle('전체 고객 관리');
	const [allUsers, setAllUsers] = useState<AppUser[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState('');
	const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'desc' | 'asc' }>({ key: 'createdAt', direction: 'desc' });
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(20);

	useEffect(() => {
		setIsLoading(true);
		const usersQuery = query(collection(db, 'users'));
		const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
			const usersData = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as AppUser));
			setAllUsers(usersData);
			setIsLoading(false);
		}, (error) => {
			console.error("사용자 목록 로딩 오류:", error);
			setIsLoading(false);
		});
		return () => unsubscribe();
	}, []);

	useEffect(() => {
		setCurrentPage(1);
	}, [searchTerm, itemsPerPage, sortConfig]);

	const handleSort = (key: SortKey) => {
		let direction: 'asc' | 'desc' = 'desc';
		if (sortConfig.key === key && sortConfig.direction === 'desc') {
			direction = 'asc';
		}
		setSortConfig({ key, direction });
	};

	const filteredAndSortedUsers = useMemo(() => {
		let results = allUsers.filter(user =>
			(user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
			(user.nickname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
			(user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
			(user.phone || '').includes(searchTerm)
		);

		results.sort((a, b) => {
			const { key, direction } = sortConfig;
			const dir = direction === 'asc' ? 1 : -1;

			// ✅ [수정] points와 noShowCount를 명시적으로 숫자로 변환하여 정렬 오류를 근본적으로 해결
			if (key === 'points' || key === 'noShowCount') {
				const numA = Number(a[key as 'points' | 'noShowCount'] || 0);
				const numB = Number(b[key as 'points' | 'noShowCount'] || 0);
				return (numA - numB) * dir;
			}

			if (key === 'loyaltyTier') {
                // ✅ [수정] 새로운 등급 순서로 변경
				const tierOrder: LoyaltyTier[] = ['공구의 신', '공구왕', '공구요정', '공구새싹', '공구초보', '공구제한'];
				const aIndex = tierOrder.indexOf(a.loyaltyTier || '공구초보'); // ✅ [수정] 기본값 '공구초보'로 변경
				const bIndex = tierOrder.indexOf(b.loyaltyTier || '공구초보'); // ✅ [수정] 기본값 '공구초보'로 변경
				return (aIndex - bIndex) * dir;
			}

			if (key === 'role') {
				const roleOrder: AppUser['role'][] = ['master', 'admin', 'customer'];
				const aIndex = roleOrder.indexOf(a.role || 'customer');
				const bIndex = roleOrder.indexOf(b.role || 'customer');
				return (aIndex - bIndex) * dir;
			}

			if (key === 'isSuspended') {
				const aVal = a.isSuspended ? 1 : 0;
				const bVal = b.isSuspended ? 1 : 0;
				return (aVal - bVal) * dir;
			}

			if (key === 'nickname') {
				const aNickname = a.nickname || '';
				const bNickname = b.nickname || '';
				return aNickname.localeCompare(bNickname) * dir;
			}

			const aValue = a[key as keyof AppUser];
			const bValue = b[key as keyof AppUser];

			if (aValue instanceof Timestamp && bValue instanceof Timestamp) {
				return (aValue.toMillis() - bValue.toMillis()) * dir;
			}
			if (aValue == null) return 1 * dir;
			if (bValue == null) return -1 * dir;
			if (typeof aValue === 'number' && typeof bValue === 'number') {
				return (aValue - bValue) * dir;
			}
			return String(aValue).localeCompare(String(bValue)) * dir;
		});

		return results;
	}, [searchTerm, allUsers, sortConfig]);

	const paginatedUsers = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		return filteredAndSortedUsers.slice(startIndex, startIndex + itemsPerPage);
	}, [filteredAndSortedUsers, currentPage, itemsPerPage]);

	const handleOpenModal = (user: AppUser) => {
		setSelectedUser(user);
		setIsModalOpen(true);
	};

	if (isLoading) return <SodomallLoader message="고객 정보를 불러오는 중..." />;

	return (
		<>
			<PointManagementModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} user={selectedUser} />
			<div className="admin-page-container full-width-container">
				<header className="admin-page-header">
					<h1 className="admin-page-title">전체 고객 관리</h1>
				</header>
				<div className="list-controls-v3">
					<div className="search-bar-wrapper-v2">
						<Search size={20} className="search-icon-v2" />
						<input
							type="text"
							placeholder="고객명, 닉네임, 이메일, 전화번호로 검색..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="search-input-v2"
						/>
					</div>
				</div>
				<div className="admin-table-container">
					<table className="admin-table excel-style responsive-table">
						<thead>
							<tr>
								<th className="col-tier" onClick={() => handleSort('loyaltyTier')}><div className="sortable-header">등급 <ArrowUpDown size={12} /></div></th>
								<th className="col-name-nickname" onClick={() => handleSort('displayName')}><div className="sortable-header">이름(닉네임) <ArrowUpDown size={12} /></div></th>
								<th className="col-phone">전화번호</th>
								<th className="col-email">이메일</th>
								<th className="col-role" onClick={() => handleSort('role')}><div className="sortable-header">권한 <ArrowUpDown size={12} /></div></th>
								<th className="col-points" onClick={() => handleSort('points')}><div className="sortable-header">신뢰도 P <ArrowUpDown size={12} /></div></th>
								<th className="col-noshow" onClick={() => handleSort('noShowCount')}><div className="sortable-header">노쇼 <ArrowUpDown size={12} /></div></th>
								<th className="col-status" onClick={() => handleSort('isSuspended')}><div className="sortable-header">상태 <ArrowUpDown size={12} /></div></th>
								<th className="col-created" onClick={() => handleSort('createdAt')}><div className="sortable-header">가입일 <ArrowUpDown size={12} /></div></th>
								<th className="col-actions cell-center"><div className="header-content-centered">관리</div></th>
							</tr>
						</thead>
						<tbody>
							{paginatedUsers.length > 0 ? paginatedUsers.map(user => {
								const userTier = user.loyaltyTier || '공구새싹';
								const currentTierInfo = tierInfo[userTier];
								const userRole = user.role || 'customer';
								const currentRoleInfo = roleInfo[userRole];

								return (
									<tr key={user.uid}>
										<td><div className="tier-cell" style={{ color: currentTierInfo.color }}>{currentTierInfo.icon} <span>{userTier}</span></div></td>
										<td title={`${user.displayName}${user.nickname ? ` (${user.nickname})` : ''}`}>{user.displayName || '이름 없음'}{user.nickname ? ` (${user.nickname})` : ''}</td>
										<td>{formatPhoneNumber(user.phone)}</td>
										<td title={user.email || ''}>{user.email}</td>
										<td><span className={`role-badge ${currentRoleInfo.className}`}>{currentRoleInfo.label}</span></td>
										<td className="cell-right">{(user.points || 0).toLocaleString()} P</td>
										<td className={`cell-center ${user.noShowCount && user.noShowCount > 0 ? 'text-danger' : ''}`}>{user.noShowCount || 0}</td>
										<td className="cell-center">
											{user.isSuspended ? (
												<span className="status-badge restricted">이용 제한</span>
											) : (
												<span className="status-badge active">정상</span>
											)}
										</td>
										<td>{(user.createdAt as Timestamp)?.toDate().toLocaleDateString('ko-KR')}</td>
										<td className="cell-center">
											<div className="action-cell-buttons">
												<Link to={`/admin/users/${user.uid}`} className="action-button-v2">상세</Link>
												<button onClick={() => handleOpenModal(user)} className="action-button-v2 primary"><Database size={14} /> 포인트</button>
											</div>
										</td>
									</tr>
								)
							}) : (
								<tr><td colSpan={10} className="no-results-cell">표시할 고객이 없습니다.</td></tr>
							)}
						</tbody>
					</table>
				</div>
				<PaginationControls
					currentPage={currentPage}
					totalPages={Math.ceil(filteredAndSortedUsers.length / itemsPerPage)}
					onPageChange={setCurrentPage}
					itemsPerPage={itemsPerPage}
					onItemsPerPageChange={(e) => setItemsPerPage(Number(e.target.value))}
					totalItems={filteredAndSortedUsers.length}
				/>
			</div>
		</>
	);
};

export default UserListPage;