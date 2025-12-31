// src/utils/formValidation.ts - 폼 검증 유틸리티

export interface ValidationError {
  field: string;
  message: string;
  type: 'error' | 'warning';
}

export interface FormValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export const validateProductForm = (data: {
  groupName: string;
  composition: string;
  imageUrls: string[];
  selectedStorageType?: 'ROOM' | 'COLD' | 'FROZEN' | 'FRESH';
  variantGroups: Array<{
    groupName: string;
    items: Array<{
      name: string;
      price: number | '';
    }>;
  }>;
  deadlineDate: Date | null;
  pickupDate: Date | null;
  pickupDeadlineDate: Date | null;
}): FormValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 필수 항목 검증
  if (!data.groupName.trim()) {
    errors.push({
      field: 'groupName',
      message: '상품명을 입력해주세요',
      type: 'error',
    });
  } else if (data.groupName.trim().length < 2) {
    warnings.push({
      field: 'groupName',
      message: '상품명이 너무 짧습니다 (최소 2자)',
      type: 'warning',
    });
  }

  if (!data.composition.trim()) {
    errors.push({
      field: 'composition',
      message: '상품 구성을 입력해주세요',
      type: 'error',
    });
  }

  if (data.imageUrls.length === 0) {
    errors.push({
      field: 'imageUrls',
      message: '대표 이미지를 1개 이상 등록해주세요',
      type: 'error',
    });
  }

  // 판매 옵션 검증
  if (data.variantGroups.length === 0) {
    errors.push({
      field: 'variantGroups',
      message: '최소 1개의 판매 옵션을 추가해주세요',
      type: 'error',
    });
  }

  data.variantGroups.forEach((vg, vgIndex) => {
    if (!vg.groupName.trim()) {
      errors.push({
        field: `variantGroups[${vgIndex}].groupName`,
        message: `옵션 그룹 ${vgIndex + 1}의 이름을 입력해주세요`,
        type: 'error',
      });
    }

    if (vg.items.length === 0) {
      errors.push({
        field: `variantGroups[${vgIndex}].items`,
        message: `옵션 그룹 ${vgIndex + 1}에 최소 1개의 선택지를 추가해주세요`,
        type: 'error',
      });
    }

    vg.items.forEach((item, itemIndex) => {
      if (!item.name.trim()) {
        errors.push({
          field: `variantGroups[${vgIndex}].items[${itemIndex}].name`,
          message: `옵션 그룹 ${vgIndex + 1}의 선택지 ${itemIndex + 1} 이름을 입력해주세요`,
          type: 'error',
        });
      }

      if (typeof item.price !== 'number' || item.price <= 0) {
        errors.push({
          field: `variantGroups[${vgIndex}].items[${itemIndex}].price`,
          message: `옵션 그룹 ${vgIndex + 1}의 선택지 ${itemIndex + 1} 가격을 입력해주세요`,
          type: 'error',
        });
      }
    });
  });

  // 날짜 검증
  if (!data.deadlineDate) {
    errors.push({
      field: 'deadlineDate',
      message: '공구 마감일을 설정해주세요',
      type: 'error',
    });
  }

  if (!data.pickupDate) {
    errors.push({
      field: 'pickupDate',
      message: '픽업 시작일을 설정해주세요',
      type: 'error',
    });
  }

  if (!data.pickupDeadlineDate) {
    errors.push({
      field: 'pickupDeadlineDate',
      message: '픽업 마감일을 설정해주세요',
      type: 'error',
    });
  }

  // 날짜 로직 검증
  if (data.deadlineDate && data.pickupDate && data.deadlineDate >= data.pickupDate) {
    warnings.push({
      field: 'deadlineDate',
      message: '공구 마감일은 픽업 시작일보다 이전이어야 합니다',
      type: 'warning',
    });
  }

  if (data.pickupDate && data.pickupDeadlineDate && data.pickupDate >= data.pickupDeadlineDate) {
    const allowSameDay =
      data.selectedStorageType === 'COLD' || data.selectedStorageType === 'FRESH';

    // ✅ 냉장/신선: 당일 픽업(시작일 = 마감일) 허용
    if (!(allowSameDay && data.pickupDate.getTime() === data.pickupDeadlineDate.getTime())) {
      errors.push({
        field: 'pickupDeadlineDate',
        message: allowSameDay
          ? '픽업 마감일은 픽업 시작일보다 이전일 수 없습니다'
          : '픽업 마감일은 픽업 시작일보다 이후여야 합니다',
        type: 'error',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

export const getFieldError = (
  field: string,
  validation: FormValidationResult
): ValidationError | undefined => {
  return validation.errors.find(e => e.field === field) || 
         validation.warnings.find(e => e.field === field);
};

