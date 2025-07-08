// scripts/populateProductCategories.js

const admin = require('firebase-admin');

const serviceAccount = require('../firebase-admin-sdk-key.json'); 

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const updateProductCategories = async () => {
  console.log("Firestore 'products' 컬렉션 category/subCategory 필드 업데이트 시작...");

  const productsRef = db.collection('products');
  const productsSnapshot = await productsRef.get();

  if (productsSnapshot.empty) {
    console.log("업데이트할 'products' 문서가 없습니다. 먼저 상품 데이터를 추가해주세요.");
    return;
  }

  const batch = db.batch();
  let updateCount = 0;

  productsSnapshot.docs.forEach(doc => {
    const productData = doc.data();
    let categoryToSet = '기타';
    let subCategoryToSet = ''; // 하위 카테고리 초기화

    if (productData.name && typeof productData.name === 'string') {
        const lowerCaseName = productData.name.toLowerCase();

        // 생활용품
        if (lowerCaseName.includes('에프킬라') || lowerCaseName.includes('살충제')) {
            categoryToSet = '생활용품';
            subCategoryToSet = '살충제';
        } else if (lowerCaseName.includes('비누') || lowerCaseName.includes('세제')) {
            categoryToSet = '생활용품';
            subCategoryToSet = '세탁/청소용품';
        } 
        // 건강식품
        else if (lowerCaseName.includes('루테인') || lowerCaseName.includes('영양제')) {
            categoryToSet = '건강식품';
            subCategoryToSet = '영양제';
        } else if (lowerCaseName.includes('글루타치온')) {
            categoryToSet = '건강식품';
            subCategoryToSet = '미용/피부';
        } else if (lowerCaseName.includes('비타민') || lowerCaseName.includes('오메가')) {
            categoryToSet = '건강식품';
            subCategoryToSet = '영양제';
        }
        // 미용용품
        else if (lowerCaseName.includes('미용용품') || lowerCaseName.includes('마스크팩')) {
            categoryToSet = '미용용품';
            subCategoryToSet = '기초화장품';
        } else if (lowerCaseName.includes('니들샷')) {
            categoryToSet = '미용용품';
            subCategoryToSet = '특수케어';
        }
        // 식음료 - 간식거리, 음료수, 주류
        else if (lowerCaseName.includes('과자') || lowerCaseName.includes('초콜릿') || lowerCaseName.includes('젤리') || lowerCaseName.includes('간식')) {
            categoryToSet = '식음료';
            subCategoryToSet = '간식';
        } else if (lowerCaseName.includes('음료수') || lowerCaseName.includes('주스') || lowerCaseName.includes('커피')) {
            categoryToSet = '식음료';
            subCategoryToSet = '음료';
        } else if (lowerCaseName.includes('맥주') || lowerCaseName.includes('소주') || lowerCaseName.includes('와인') || lowerCaseName.includes('주류')) {
            categoryToSet = '식음료';
            subCategoryToSet = '주류';
        }
        // 식품 - 기타
        else if (lowerCaseName.includes('채소') || lowerCaseName.includes('과일') || lowerCaseName.includes('고기')) {
            categoryToSet = '식음료';
            subCategoryToSet = '신선식품';
        } else if (lowerCaseName.includes('쌀') || lowerCaseName.includes('김치')) {
            categoryToSet = '식음료';
            subCategoryToSet = '가공식품';
        }
        // 가전제품
        else if (lowerCaseName.includes('서큘레이터') || lowerCaseName.includes('공기청정기')) {
            categoryToSet = '가전제품';
            subCategoryToSet = '소형가전';
        }
        // 기타
        else {
            categoryToSet = '기타';
            subCategoryToSet = '';
        }
    }

    // 이미 category 필드가 있거나, 특정 조건에서만 업데이트하려면 아래 if문 사용
    // if (!productData.category || productData.category === '기타' || !productData.subCategory) { // subCategory가 없을 경우도 업데이트
        batch.update(doc.ref, { 
            category: categoryToSet,
            subCategory: subCategoryToSet // subCategory도 업데이트
        });
        updateCount++;
    // }
  });

  if (updateCount > 0) {
    await batch.commit();
    console.log(`'products' 컬렉션의 ${updateCount}개 문서에 category/subCategory 필드 업데이트 완료.`);
  } else {
    console.log("업데이트할 문서가 없거나 모든 문서에 이미 category/subCategory 필드가 설정되어 있습니다.");
  }
};

updateProductCategories()
  .then(() => {
    console.log("모든 작업 완료.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("데이터 업데이트 중 오류 발생:", error);
    process.exit(1);
  });