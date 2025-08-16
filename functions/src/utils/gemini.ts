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
  "storageType": "'ROOM' | 'FROZEN' | 'COLD'",
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
      "items": [{"name": "string", "price": "number"}]
    }
  ]
}

IMPORTANT INSTRUCTIONS:

1) cleanedDescription (Mobile-Optimized & Persuasive! ✍️)
  1. **첫 3줄**: 상품의 핵심 이미지와 매력을 간단명료하게 3줄로 묘사 (첫 줄은 강렬하게 시작)  
  2. **다음 3줄**: 사용 방법, 경험, 먹는 순간·사용 순간의 느낌을 묘사  
  3. **핵심 특징 3줄**: 📌 아이콘 + 짧은 문장 (한 줄 1특징)  
  4. **마지막 줄**: ✔️ + 제품명 (규격/용량) 형태로 표기  
  5. 전체 분량은 8~9줄, 줄 간격을 유지해 모바일 가독성 확보  
  6. **굵은 글씨**와 이모지를 적절히 사용  
  7. 불필요한 문장은 제거하고, 시각적으로 깔끔하게  

2) Hashtag Generation (MANDATORY REQUIREMENT!)
    - You MUST generate between 2 and 4 relevant hashtags based on the product description.
    - This is not an optional task. The 'hashtags' field must be populated.
    - Hashtags must be in Korean and start with '#'.
    - Make them short, catchy, and something a user would actually search for.

3) Category selection
    - You MUST choose ONE category from this exact list: [${safeCategories.join(", ")}].
    - Analyze the text carefully. Never return null or a category not on the list.

4) Storage type: Infer from '냉장', '냉동', '실온'. Default to 'ROOM'.

5) Product Type Rules (CRITICAL):
    - **'single'**: Use when there is ONLY ONE KIND of product, but it's sold in different quantities or packages. For example, "Narangd Cider 5-pack" and "Narangd Cider 30-pack" are quantity variations of the SAME product, so the type must be 'single'. In this case, the 'variantGroups' array should usually contain only one object.
    - **'group'**: Use when there are MULTIPLE KINDS of products, such as different flavors, colors, or types. For example, "Spicy Ramen" and "Mild Ramen" are different kinds, so the type must be 'group'. Each kind should be a separate object within the 'variantGroups' array.
    - **Clean Names**: When extracting 'groupName' and 'variantGroups.groupName', **ALWAYS remove** store names like "소도몰" and any special characters like "X" or "x". The name should be clean and represent only the product itself.

6) variantGroups / items:
    - Extract prices as pure numbers. Parse expirationDate and pickupDate.
    - **Item Name Rule (CRITICAL)**: The 'name' for each item MUST be a single unit. For example: "1개", "1팩", "1마리", "1곽". **NEVER** include weights or extra details in parentheses like "1개 (500g)". Just the single unit.

7) Pickup Date Rule (매우 중요): Today is ${today}. Resolve all pickup dates to be in the future. If a year is missing (e.g., 8/15), find the next future occurrence. If a date is in the past, add years until it is in the future.

8) Nulls: Use null for genuinely missing values, but be aggressive in parsing what's there. The 'hashtags' field is an exception and must not be null.

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