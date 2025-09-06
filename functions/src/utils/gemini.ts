// functions/src/utils/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 지연 초기화된 Gemini 모델 인스턴스
 * - 배포 분석 단계에서 Secret 미주입으로 크래시 나는 걸 방지
 */
let _model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

function getModel() {
  if (_model) return _model;

  const key = process.env.GEMINI_API_KEY; // v2 Secret (실행 시점에만 접근)
  if (!key) {
    // 실제 호출 시점에만 키 검증
    throw new Error("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(key);
  _model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // 필요시 모델명 조정
  return _model;
}

/**
 * 서울 타임존 기준 오늘 날짜(YYYY-MM-DD)
 */
function todaySeoul(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA 포맷은 기본이 YYYY-MM-DD
  return f.format(new Date());
}

/**
 * 모델 응답에서 JSON만 추출
 * - ```json ... ``` 코드블록 제거
 * - 문장 섞여 있을 때 첫 '{'부터 마지막 '}'까지를 시도
 */
function extractJson(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(/```[a-z]*\n?|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/**
 * AI 분석: 상품 텍스트 → 정형 구조
 * @param text 원문 안내문
 * @param categories 카테고리 후보 목록
 * @returns 모델이 생성한 구조화 JSON
 */
export async function analyzeProductTextWithAI(text: string, categories: string[]) {
  const model = getModel(); // 실행 시점 Secret 검사
  const today = todaySeoul();

  // 카테고리 문자열 안전 처리
  const safeCategories = (Array.isArray(categories) ? categories : [])
    .map((c) => String(c).replace(/"/g, '\\"'));

  const prompt = `
You are a super cheerful and witty marketing copywriter for a Korean group-buying e-commerce platform.
Your task is to extract structured product data and write an irresistible sales description.

OUTPUT: ONE raw JSON object ONLY (no markdown fences, no prose). It must conform exactly to the schema below.

Schema:
{
  "productType": "'single' or 'group'",
  "storageType": "'ROOM' | 'FROZEN' | 'COLD' | 'FRESH'",
  "categoryName": "string (MUST be one of these: [${safeCategories.join(", ")}])",
  "groupName": "string | null",
  "cleanedDescription": "string | null",
  "hashtags": "string[] (CRITICAL: You MUST generate 2 to 4 short, trendy, Korean hashtags. e.g., [\\"#인생맛집\\", \\"#캠핑요리\\"]. Do NOT return null or an empty array.)",
  "variantGroups": [
    {
      "groupName": "string | null",
      "totalPhysicalStock": "number | null",
      "expirationDate": "string | null (YYYY-MM-DD)",
      "pickupDate": "string | null (YYYY-MM-DD)",
      "items": [{"name": "string", "price": "number", "stockDeductionAmount": "number"}]
    }
  ]
}

IMPORTANT INSTRUCTIONS:

1) cleanedDescription (Mobile-Optimized & Persuasive! ✍️)
  1. **첫 3줄**: 상품의 핵심 이미지와 매력을 간단명료하게 3줄로 묘사 (첫 줄은 강렬하게 시작)  
  2. **다음 3줄**: 사용 방법, 경험, 먹는 순간·사용 순간의 느낌을 묘사  
  3. **핵심 특징 3줄**: 📌 아이콘 + 짧은 문장 (한 줄 1특징)  
  4. **구성품 안내 (있을 경우)**: 원문에 '구성품', '구성', '포함 내역' 등의 정보가 있다면, 📦 아이콘을 사용하여 각 구성품을 한 줄씩 명확히 나열합니다. (예: 📦 본품 1개\\n📦 소스 2종)
  5. **판매 옵션 요약**: ✔️ 아이콘 + 각 판매 옵션명과 최종 가격을 한 줄씩 명확히 기재. (예: ✔️ 하늘보리 1병: 800원\\n✔️ 하늘보리 1박스(20병): 12,500원)
  6. 전체 분량은 8~12줄 (구성품 포함 시 늘어날 수 있음), 줄 간격을 유지해 모바일 가독성 확보  
  7. **굵은 글씨**와 이모지를 적절히 사용  
  8. 불필요한 문장은 제거하고, 시각적으로 깔끔하게  

2) Hashtag Generation (MANDATORY REQUIREMENT!)
    - You MUST generate between 2 and 4 relevant hashtags based on the product description.
    - This is not an optional task. The 'hashtags' field must be populated.
    - Hashtags must be in Korean and start with '#'.
    - Make them short, catchy, and something a user would actually search for.

3) Category selection
    - You MUST choose ONE category from this exact list: [${safeCategories.join(", ")}].
    - Analyze the text carefully. Never return null or a category not on the list.

4) Storage type: Infer from '냉장', '냉동', '실온'. For products like eggs, fruits, or vegetables that are stored at room temperature but are fresh and require quick pickup, use 'FRESH'. Default to 'ROOM' for other cases.

5) Product Type Rules (CRITICAL):
    - **'single'**: Use when there is ONLY ONE KIND of product, but it's sold in different quantities or packages. For example, "Narangd Cider 5-pack" and "Narangd Cider 30-pack" are quantity variations of the SAME product, so the type must be 'single'. In this case, the 'variantGroups' array should usually contain only one object.
    - **'group'**: Use when there are MULTIPLE KINDS of products, such as different flavors, colors, or types. For example, "Spicy Ramen" and "Mild Ramen" are different kinds, so the type must be 'group'. Each kind should be a separate object within the 'variantGroups' array.
    - **Clean Names**: When extracting 'groupName' and 'variantGroups.groupName', **ALWAYS remove** store names like "소도몰" and any special characters like "X" or "x". The name should be clean and represent only the product itself.

6) variantGroups / items:
    - Extract prices as pure numbers. Parse expirationDate and pickupDate.
    - **Item Name Rule (아주 중요!)**: 'items' 배열의 각 'name' 값은 판매 단위를 나타내는 가장 깨끗하고 단순한 형태여야 합니다. **모든 경우에** 'name' 값은 **'1'로 시작**해야 하며, 그 뒤에 **1~3글자 이내**의 판매 단위만 포함해야 합니다. (예: "1개", "1팩", "1곽")
      - **절대로** 제품명("하늘보리")이나 괄호로 묶인 부가 설명("(30구)")을 포함해서는 안 됩니다.

7) Pickup Date Rule (매우 중요): Today is ${today}. Resolve all pickup dates to be in the future. If a year is missing (e.g., 8/15), find the next future occurrence. If a date is in the past, add years until it is in the future.

8) Nulls: Use null for genuinely missing values, but be aggressive in parsing what's there. The 'hashtags' field is an exception and must not be null.

9) Stock Deduction Unit (차감 단위) Rules (CRITICAL):
    - This determines how many base units are removed from stock when an item is purchased.
    - **If multiple options are different quantities of the SAME product** (e.g., "1병" and "1박스(20병)"), find the smallest unit ("1병").
      - For "1병", 'stockDeductionAmount' MUST be 1.
      - For "1박스(20병)", 'stockDeductionAmount' MUST be 20.
    - **If there is only ONE option, or options are for different products** (e.g., different flavors), the 'stockDeductionAmount' for each item is ALWAYS 1.
      - Example: The only option is "구운 계란 1판 (30구)". The unit being sold is "1판". Therefore, 'stockDeductionAmount' MUST be 1. The "(30구)" is just a description.

원문:
${text}
`.trim();

  const res = await model.generateContent(prompt);
  const out = await res.response.text();

  const jsonLike = extractJson(out);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonLike);
  } catch (e) {
    throw new Error(
      `Gemini JSON parse failed: ${String(e)} | raw: ${jsonLike.slice(0, 300)}...`
    );
  }

  return parsed;
}