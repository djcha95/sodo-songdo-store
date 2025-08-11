// functions/src/utils/gemini.ts
import { HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { StorageType } from "../types";

interface AIParsedData {
  productType: 'single' | 'group';
  storageType: StorageType;
  categoryName: string | null;
  groupName:string | null;
  cleanedDescription: string | null;
  variantGroups: {
    groupName: string | null;
    totalPhysicalStock: number | null;
    expirationDate: string | null; // YYYY-MM-DD
    pickupDate: string | null;     // YYYY-MM-DD
    items: { name: string; price: number; }[];
  }[];
}

// --- Helpers added for formatting & validation ---

/**
 * Date 객체를 'YYYY-MM-DD' 형식의 문자열로 변환합니다.
 */
const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * 날짜 문자열(YYYY-MM-DD)을 받아, 만약 과거 날짜라면 현재보다 미래가 될 때까지 연도를 +1하여 보정합니다.
 * '08-15'와 같이 연도가 없는 형식도 처리합니다.
 * @param ymd - 'YYYY-MM-DD' 형식의 날짜 문자열 또는 null
 * @returns 보정된 미래의 'YYYY-MM-DD' 형식의 날짜 문자열 또는 null
 */
const ensureFutureYMD = (ymd: string | null): string | null => {
  if (!ymd) return null;
  let d = new Date(ymd);
  if (isNaN(d.getTime())) return null; // 유효하지 않은 날짜 형식은 null 반환

  const today = new Date();
  today.setHours(0, 0, 0, 0); // 비교를 위해 오늘 날짜의 시작 시간으로 설정

  // 날짜가 오늘이거나 과거일 경우, 미래가 될 때까지 연도를 1씩 증가시킵니다.
  while (d <= today) {
    d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  }
  return toYMD(d);
};

/**
 * 주어진 텍스트 내용과 카테고리 목록을 기반으로 가장 적합한 카테고리를 지능적으로 선택합니다.
 * @param categories - 선택 가능한 카테고리 이름 배열
 * @param text - 상품명, 설명 등 판단의 근거가 될 텍스트
 * @returns 목록에서 선택된 최적의 카테고리 이름 또는 null
 */
const pickCategorySmart = (categories: string[], text: string): string | null => {
  if (!categories || categories.length === 0) return null;
  const lowerText = text.toLowerCase();
  const rules: Array<[RegExp, string[]]> = [
    [/초콜릿|과자|스낵|나쵸|캔디|디저트|케이크|빵|쿠키/, ['디저트', '간식', '과자', '베이커리', '식품']],
    [/고기|소고기|돼지|순대|햄|소시지|육류/, ['정육', '식품', '가공식품']],
    [/김치|젓갈|반찬|밑반찬/, ['반찬', '식품']],
    [/세제|세정|세척|청소|제거제|탈취|방향/, ['생활용품', '청소용품']],
    [/뷰티|화장품|스킨|크림|미스트/, ['뷰티', '헬스/뷰티']],
    [/비타민|영양제|건강|루테인|징코|바나바|프로바이오틱스|오메가/, ['건강식품', '헬스/뷰티']],
    [/아동|키즈|완구|장난감/, ['키즈', '생활잡화']],
    [/주방|냄비|프라이팬|칼|보관|밀폐|조리/, ['주방용품', '생활용품']],
    [/음료|주스|차|커피|티백|탄산/, ['음료', '식품']],
    [/냉동|만두|치즈|아이스크림/, ['냉동식품', '식품']],
  ];

  for (const [regex, preferred] of rules) {
    if (regex.test(lowerText)) {
      for (const pref of preferred) {
        const found = categories.find(c => c.includes(pref));
        if (found) return found;
      }
    }
  }

  const genericOrder = ['식품', '생활용품', '주방', '디저트', '건강', '뷰티'];
  for (const g of genericOrder) {
    const found = categories.find(c => c.includes(g));
    if (found) return found;
  }

  return categories[0]; // 모든 규칙에 맞지 않으면 첫 번째 카테고리 반환
};

/**
 * AI가 생성한 설명 텍스트를 다듬습니다. 불필요한 백틱을 제거하고, CTA 문구가 없으면 추가합니다.
 * @param desc - AI가 생성한 cleanedDescription
 * @param groupName - 상품명 (참고용)
 * @returns 다듬어진 설명 문자열 또는 null
 */
const beautifyDescriptionIfNeeded = (desc: string | null, groupName: string | null): string | null => {
  if (!desc || !desc.trim()) return null;
  let d = desc.replace(/```/g, '').trim();
  if (!/예약/.test(d)) {
    d += '\n\n지금 예약주세요!';
  }
  return d;
};


export async function analyzeProductTextWithAI(
  text: string,
  categories: string[]
): Promise<AIParsedData> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("Gemini API key is not available in environment variables.");
    throw new HttpsError(
      "failed-precondition",
      "AI 서비스 설정이 서버에 올바르게 구성되지 않았습니다. 관리자에게 문의해주세요."
    );
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  const now = new Date();
  const today = toYMD(now);

  const prompt = `
You are an assistant for a Korean group-buying e-commerce admin tool.
Extract structured product data AND also rewrite the marketing copy.

OUTPUT: one raw JSON object ONLY (no code fences, no prose). It must conform exactly to the schema below.

Schema:
{
  "productType": "'single' or 'group'",
  "storageType": "'ROOM' | 'FROZEN' | 'COLD'",
  "categoryName": "string (MUST be chosen from this list: [${categories.join(", ")}])",
  "groupName": "string | null",
  "cleanedDescription": "string | null",
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
1) cleanedDescription (카카오톡용 포맷)
   - Write a SHORT, lively KakaoTalk-friendly sales blurb (5~8 lines).
   - Use **bold** for core benefits or key phrases and add 2~4 relevant emojis.
   - Keep sentences brief on separate lines. Avoid headers, lists, tables, links, or code fences.
   - Finish with a clear CTA like: "지금 예약주세요!" (last line).
2) Category selection
   - Choose ONE best category from this list: [${categories.join(", ")}].
   - If ambiguous, pick the most plausible. NEVER return null unless the list is empty.
3) Storage type
   - Infer from words like '냉장', '냉동', '실온'. Default to 'ROOM' if unsure.
4) Product type
   - If multiple distinct options (flavors/sizes) exist, use 'group', else 'single'.
5) variantGroups / items
   - If 'single', return ONE group and set its groupName same as the main groupName.
   - Extract prices as pure numbers (e.g., "6,900원" -> 6900). If missing, set 0.
   - Parse expirationDate (유통기한) to YYYY-MM-DD if present, else null.
   - Parse pickupDate from 입고일/픽업일.
6) 픽업일(입고일) 규칙 — MUST be in the FUTURE (Asia/Seoul)
   - Today is ${today}.
   - If the source gives a date without year (e.g., 8/15, 08-15), resolve it to the next future occurrence relative to today.
   - If a full date is in the past, roll it forward by adding years until the date is in the future.
7) Null policy
   - If you truly cannot infer a value, use null (or [] for arrays).

--- Original Text Start ---
${text}
--- Original Text End ---
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text()?.trim() ?? "";

    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      console.error("AI response does not contain a valid JSON object. Response:", responseText);
      throw new HttpsError(
          "internal",
          "AI 응답에서 유효한 JSON 객체를 찾을 수 없습니다."
      );
    }

    const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString) as AIParsedData;

    // Normalize arrays
    if (!parsed.variantGroups || !Array.isArray(parsed.variantGroups)) {
      parsed.variantGroups = [];
    }
    parsed.variantGroups.forEach(vg => {
      if (!vg.items || !Array.isArray(vg.items)) {
        vg.items = [];
      } else {
        // Coerce price to number if it came as string
        vg.items = vg.items.map(it => ({
          ...it,
          price: typeof it.price === 'string' ? Number(String(it.price).replace(/[^0-9]/g, '')) : (it.price ?? 0)
        }));
      }
    });

    // --- Post-processing and data validation ---
    try {
      const textBlob = text || '';
      
      // Enforce future pickup dates
      if (parsed.variantGroups && Array.isArray(parsed.variantGroups)) {
        parsed.variantGroups = parsed.variantGroups.map(vg => ({
          ...vg,
          pickupDate: ensureFutureYMD(vg.pickupDate)
        }));
      }
      
      // Fallback for category if AI fails or returns an invalid one
      const contextForCategory = (parsed.groupName || '') + ' ' + (parsed.cleanedDescription || '') + ' ' + textBlob;
      if ((!parsed.categoryName || !categories.includes(parsed.categoryName)) && categories && categories.length > 0) {
        parsed.categoryName = pickCategorySmart(categories, contextForCategory);
      }
      
      // Beautify description
      parsed.cleanedDescription = beautifyDescriptionIfNeeded(parsed.cleanedDescription, parsed.groupName);

    } catch (e) {
      console.warn('Post-processing of AI data failed:', (e as Error).message);
      // Continue with potentially un-polished data
    }

    return parsed;

  } catch (error) {
    console.error("Error analyzing text with Gemini AI:", error);
    if (error instanceof SyntaxError) {
      throw new HttpsError("internal", "AI가 반환한 JSON의 형식이 잘못되었습니다.");
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      { originalError: (error as Error).message }
    );
  }
}