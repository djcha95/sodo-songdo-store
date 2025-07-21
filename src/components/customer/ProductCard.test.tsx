// src/components/customer/ProductCard.test.tsx

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event'; // ✅ [추가] 사용자 액션을 위한 라이브러리
import { MemoryRouter } from 'react-router-dom';
import ProductCard from './ProductCard';
import type { Product } from '@/types';
import { Timestamp } from 'firebase/firestore';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isSuspendedUser: false,
  }),
}));

// ✅ [수정] addToCart 함수를 테스트에서 감시할 수 있도록 vi.fn()으로 만듭니다.
const mockAddToCart = vi.fn();
vi.mock('@/context/CartContext', () => ({
  useCart: () => ({
    addToCart: mockAddToCart,
  }),
}));

const mockProduct: Product = {
  id: 'product-1',
  groupName: '테스트 상품',
  description: '설명',
  imageUrls: ['image.jpg'],
  storageType: 'ROOM',
  isArchived: false,
  createdAt: Timestamp.now(),
  salesHistory: [
    {
      roundId: 'round-1',
      roundName: '1차 판매',
      status: 'selling',
      publishAt: Timestamp.now(),
      deadlineDate: Timestamp.fromMillis(Date.now() + 86400000),
      pickupDate: Timestamp.fromMillis(Date.now() + 172800000),
      createdAt: Timestamp.now(),
      variantGroups: [{
        id: 'vg-1',
        groupName: '기본',
        stockUnitType: '개',
        totalPhysicalStock: 10,
        items: [{
          id: 'item-1',
          name: '기본 옵션',
          price: 15000,
          stock: -1,
          stockDeductionAmount: 1,
        }],
      }],
    }
  ],
};

describe('ProductCard', () => {
  // ✅ [추가] 각 테스트가 끝나면 mock 함수 호출 기록을 초기화합니다.
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('구매 가능한 단일 옵션 상품일 경우, 상품명, 가격, "담기" 버튼을 렌더링해야 합니다.', () => {
    render(
      <MemoryRouter>
        <ProductCard 
          product={mockProduct} 
          reservedQuantitiesMap={new Map()} 
        />
      </MemoryRouter>
    );

    expect(screen.getByText('테스트 상품')).toBeInTheDocument();
    expect(screen.getByText('15,000원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /담기/ })).toBeInTheDocument();
  });

  it('옵션이 여러 개인 상품일 경우, "옵션 선택하기" 버튼을 렌더링해야 합니다.', () => {
    const multiOptionProduct = {
      ...mockProduct,
      salesHistory: [{
        ...mockProduct.salesHistory[0],
        variantGroups: [
          ...mockProduct.salesHistory[0].variantGroups,
          {
            id: 'vg-2',
            groupName: '세트',
            stockUnitType: '개',
            totalPhysicalStock: 5,
            items: [{ id: 'item-2', name: '2개 세트', price: 28000, stock: -1, stockDeductionAmount: 2 }],
          }
        ],
      }],
    };

    render(
      <MemoryRouter>
        <ProductCard 
          product={multiOptionProduct} 
          reservedQuantitiesMap={new Map()} 
        />
      </MemoryRouter>
    );
    
    expect(screen.getByText('옵션 선택하기')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /담기/ })).not.toBeInTheDocument();
  });

  // ✅ [추가] 사용자 상호작용 테스트 케이스
  it('"담기" 버튼을 클릭하면 addToCart 함수가 호출되어야 합니다.', async () => {
    // 1. userEvent를 설정합니다.
    const user = userEvent.setup();

    // 2. 테스트할 컴포넌트를 렌더링합니다.
    render(
      <MemoryRouter>
        <ProductCard 
          product={mockProduct} 
          reservedQuantitiesMap={new Map()} 
        />
      </MemoryRouter>
    );

    // 3. 화면에서 '담기' 버튼을 찾습니다.
    const addToCartButton = screen.getByRole('button', { name: /담기/ });

    // 4. 사용자가 버튼을 클릭하는 행동을 시뮬레이션합니다.
    await user.click(addToCartButton);

    // 5. addToCart mock 함수가 1번 호출되었는지 확인합니다.
    expect(mockAddToCart).toHaveBeenCalledTimes(1);
  });
});