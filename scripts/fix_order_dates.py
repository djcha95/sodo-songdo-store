# scripts/fix_order_dates.py

import firebase_admin
from firebase_admin import credentials, firestore
import os

# --- Firebase 초기화 ---

# ✅ [수정] 절대 경로 대신, 현재 스크립트 위치를 기준으로 경로를 동적으로 설정합니다.
script_dir = os.path.dirname(os.path.abspath(__file__))
service_account_key_path = os.path.join(script_dir, 'sso-do-firebase-adminsdk-fbsvc-6fcec91050.json')


if not os.path.exists(service_account_key_path):
    print(f"오류: 서비스 계정 키 파일 '{service_account_key_path}'을(를) 찾을 수 없습니다.")
    print("스크립트와 동일한 'scripts' 폴더 안에 'sso-do-firebase-adminsdk-fbsvc-6fcec91050.json' 파일이 있는지 확인해주세요.")
    exit()

try:
    cred = credentials.Certificate(service_account_key_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase Admin SDK가 성공적으로 초기화되었습니다.")
except Exception as e:
    print(f"❌ Firebase 초기화 실패: {e}")
    exit()

def migrate_order_dates():
    """
    모든 주문을 순회하며, 누락된 pickupDate 및 pickupDeadlineDate를
    원본 상품의 salesHistory에서 찾아와 업데이트합니다.
    """
    orders_ref = db.collection('orders')
    products_ref = db.collection('products')
    
    batch = db.batch()
    batch_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    # 캐시를 사용해 동일 상품에 대한 반복적인 읽기를 방지
    products_cache = {}

    print("\n--- 주문 데이터 날짜 정보 복구를 시작합니다 ---")

    try:
        all_orders = orders_ref.stream()

        for order_doc in all_orders:
            order_data = order_doc.to_dict()
            order_id = order_doc.id

            # 이미 최상위 레벨에 pickupDeadlineDate가 있으면 건너뛰기
            if 'pickupDeadlineDate' in order_data and order_data['pickupDeadlineDate'] is not None:
                skipped_count += 1
                continue

            if not order_data.get('items') or len(order_data['items']) == 0:
                skipped_count += 1
                continue

            representative_item = order_data['items'][0]
            product_id = representative_item.get('productId')
            round_id = representative_item.get('roundId')

            if not product_id or not round_id:
                print(f"  [오류] 주문 '{order_id}'에 productId 또는 roundId가 없습니다.")
                error_count += 1
                continue

            product_data = None
            if product_id in products_cache:
                product_data = products_cache[product_id]
            else:
                product_doc = products_ref.document(product_id).get()
                if product_doc.exists:
                    product_data = product_doc.to_dict()
                    products_cache[product_id] = product_data
                else:
                    print(f"  [오류] 주문 '{order_id}'에 연결된 상품 '{product_id}'를 찾을 수 없습니다.")
                    error_count += 1
                    continue
            
            sales_history = product_data.get('salesHistory', [])
            target_round = next((r for r in sales_history if r.get('roundId') == round_id), None)

            if not target_round:
                print(f"  [오류] 상품 '{product_id}'에서 라운드 '{round_id}'를 찾을 수 없습니다.")
                error_count += 1
                continue

            update_data = {}
            # order 객체 자체에 필드가 없을 경우에만 업데이트
            if 'pickupDate' not in order_data and 'pickupDate' in target_round:
                update_data['pickupDate'] = target_round['pickupDate']
            
            if 'pickupDeadlineDate' not in order_data and 'pickupDeadlineDate' in target_round:
                update_data['pickupDeadlineDate'] = target_round.get('pickupDeadlineDate') # .get()으로 안전하게 접근

            if update_data:
                batch.update(orders_ref.document(order_id), update_data)
                print(f"  [준비] 주문 '{order_id}' 업데이트 준비 완료.")
                batch_count += 1
                updated_count += 1
            else:
                skipped_count += 1

            if batch_count >= 400:
                print(f"--- {batch_count}개 문서 배치 커밋 중... ---")
                batch.commit()
                print("--- 배치 커밋 완료. ---")
                batch = db.batch()
                batch_count = 0

        if batch_count > 0:
            print(f"--- 남은 {batch_count}개 문서 배치 커밋 중... ---")
            batch.commit()
            print("--- 남은 배치 커밋 완료. ---")

    except Exception as e:
        print(f"\n❌ 스크립트 실행 중 심각한 오류 발생: {e}")
        return

    print("\n--- 데이터 복구 완료 ---")
    print(f"✅ 총 업데이트된 주문: {updated_count}개")
    print(f"➡️ 총 건너뛴 주문 (이미 날짜가 있거나 정보 부족): {skipped_count}개")
    print(f"❌ 오류 발생 주문: {error_count}개")

if __name__ == "__main__":
    migrate_order_dates()