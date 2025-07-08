# migrate_products.py

import firebase_admin
from firebase_admin import credentials, firestore
import os
import json

# --- Firebase 초기화 ---
# 1. Firebase 프로젝트 설정에서 "서비스 계정" 탭으로 이동합니다.
# 2. "새 비공개 키 생성" 버튼을 클릭하여 JSON 파일을 다운로드합니다.
# 3. 다운로드한 JSON 파일의 경로를 아래 service_account_key_path 변수에 입력합니다.
#    (예: 'path/to/your/serviceAccountKey.json')
#    또는, 환경 변수로 설정할 수도 있습니다.

# 서비스 계정 키 파일 경로 (다운로드한 JSON 파일의 실제 경로로 변경하세요)
service_account_key_path = r'C:\Users\Computer\Dropbox\sodomall-app\scripts\sso-do-firebase-adminsdk-fbsvc-6fcec91050.json'# 환경 변수에서 키를 로드하는 경우 (더 안전한 방법)
# service_account_key_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY')
# if service_account_key_json:
#     cred = credentials.Certificate(json.loads(service_account_key_json))
# else:
#     cred = credentials.Certificate(service_account_key_path)

# 파일에서 키를 로드하는 경우
if not os.path.exists(service_account_key_path):
    print(f"오류: 서비스 계정 키 파일 '{service_account_key_path}'을(를) 찾을 수 없습니다.")
    print("Firebase 프로젝트 설정에서 '서비스 계정' 탭으로 이동하여 새 비공개 키를 생성하고, 다운로드한 JSON 파일의 경로를 정확히 입력해주세요.")
    exit()

cred = credentials.Certificate(service_account_key_path)
firebase_admin.initialize_app(cred)

db = firestore.client()

print("Firebase Admin SDK가 성공적으로 초기화되었습니다.")

def migrate_product_data():
    products_ref = db.collection('products')
    
    # 배치 쓰기를 위한 변수 초기화
    batch = db.batch()
    batch_count = 0
    updated_count = 0
    skipped_count = 0

    print("상품 데이터 마이그레이션을 시작합니다...")

    # 모든 상품 문서 가져오기
    # .stream()을 사용하여 대량의 데이터를 효율적으로 처리
    docs = products_ref.stream()

    for doc in docs:
        product_data = doc.to_dict()
        doc_id = doc.id
        
        # 새로운 스키마 필드 (groupName, items)가 이미 존재하는지 확인
        # 만약 이미 존재한다면, 이 문서는 이미 마이그레이션된 것으로 간주하고 건너뜁니다.
        if 'groupName' in product_data and 'items' in product_data:
            print(f"  [건너뜀] 문서 '{doc_id}'는 이미 새로운 스키마를 가지고 있습니다.")
            skipped_count += 1
            continue

        # 이전 스키마 필드 (name, pricingOptions)를 기반으로 새로운 데이터 구성
        new_product_data = {}

        # 1. groupName 필드 설정
        # 기존 name 필드가 있다면 groupName으로 사용, 없으면 '이름 없음'
        new_product_data['groupName'] = product_data.get('name', '이름 없음')

        # 2. items 배열 설정
        # 기존 pricingOptions 배열이 있다면 items 배열로 변환
        # pricingOptions가 없다면 빈 배열로 초기화
        if 'pricingOptions' in product_data and isinstance(product_data['pricingOptions'], list):
            new_items = []
            for opt in product_data['pricingOptions']:
                # ProductItem 인터페이스에 맞춰 필드 매핑
                item = {
                    'name': opt.get('name', product_data.get('name', '품목명 없음')), # pricingOptions의 name 또는 상품의 name 사용
                    'price': opt.get('price', 0),
                    'stock': opt.get('stock', -1), # stock 없으면 무제한 (-1)
                    'unitType': opt.get('unit', '개'), # pricingOptions의 unit 사용
                    'limitQuantity': opt.get('limitQuantity', None),
                    'expirationDate': opt.get('expirationDate', None),
                }
                new_items.append(item)
            new_product_data['items'] = new_items
        else:
            # pricingOptions가 없는 경우, 단일 상품으로 간주하고 기본 items 배열 생성
            # 기존 name, price, stock 등을 활용하여 첫 번째 품목 생성
            default_item_name = product_data.get('name', '기본 품목')
            default_item_price = product_data.get('price', 0)
            default_item_stock = product_data.get('stock', -1) # stock 없으면 무제한
            default_item_unit_type = product_data.get('unitType', '개') # 기존 unitType 활용
            default_item_limit_quantity = product_data.get('maxOrderPerPerson', None) # 기존 maxOrderPerPerson 활용
            default_item_expiration_date = product_data.get('expirationDate', None) # 기존 expirationDate 활용

            new_product_data['items'] = [{
                'name': default_item_name,
                'price': default_item_price,
                'stock': default_item_stock,
                'unitType': default_item_unit_type,
                'limitQuantity': default_item_limit_quantity,
                'expirationDate': default_item_expiration_date,
            }]
            print(f"  [정보] 문서 '{doc_id}': pricingOptions가 없어 단일 품목으로 변환되었습니다.")


        # 3. isAvailableForOnsiteSale 필드 설정 (없다면 기본값 False)
        if 'isAvailableForOnsiteSale' not in product_data:
            new_product_data['isAvailableForOnsiteSale'] = False
        
        # 4. 기존 name, pricingOptions, stock, maxOrderPerPerson 필드 제거
        # 이 필드들은 더 이상 사용되지 않으므로 제거합니다.
        fields_to_delete = ['name', 'pricingOptions', 'stock', 'maxOrderPerPerson']
        for field in fields_to_delete:
            if field in product_data:
                new_product_data[field] = firestore.DELETE_FIELD

        # 문서 업데이트 (배치에 추가)
        batch.update(products_ref.document(doc_id), new_product_data)
        batch_count += 1
        updated_count += 1

        print(f"  [준비] 문서 '{doc_id}' 업데이트 준비 완료. (현재 배치: {batch_count})")

        # 500개 문서마다 배치 커밋 (Firestore 배치 쓰기 제한)
        if batch_count >= 499: # 500개에 가까워지면 커밋
            print(f"--- {batch_count}개 문서 배치 커밋 중... ---")
            batch.commit()
            print("--- 배치 커밋 완료. ---")
            batch = db.batch()
            batch_count = 0

    # 남은 문서 커밋
    if batch_count > 0:
        print(f"--- 남은 {batch_count}개 문서 배치 커밋 중... ---")
        batch.commit()
        print("--- 남은 배치 커밋 완료. ---")

    print("\n--- 데이터 마이그레이션 완료 ---")
    print(f"총 업데이트된 문서: {updated_count}개")
    print(f"총 건너뛴 문서 (이미 마이그레이션됨): {skipped_count}개")
    print("마이그레이션 후 Firebase Firestore 콘솔에서 데이터를 확인해주세요.")

if __name__ == "__main__":
    migrate_product_data()