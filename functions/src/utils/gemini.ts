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

const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const ensureFutureYMD = (ymd: string | null): string | null => {
  if (!ymd) return null;
  let d = new Date(ymd);
  if (isNaN(d.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0); 

  while (d <= today) {
    d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  }
  return toYMD(d);
};

const pickCategorySmart = (categories: string[], text: string): string | null => {
  if (!categories || categories.length === 0) return null;
  const lowerText = text.toLowerCase();
  
  const rules: Array<[RegExp, string[]]> = [
    [/사료|강아지|고양이|펫푸드|캣타워|배변패드/, ['반려동물']],
    [/스낵|과자|초콜릿|쿠키|젤리|사탕|파이|디저트/, ['간식/과자']],
    [/라면|즉석밥|컵반|죽|스프|카레|짜장|냉동|만두|밀키트|간편식/, ['간편식/밀키트']],
    [/비타민|영양제|홍삼|프로틴|콜라겐|건강즙|건강식품/, ['건강식품']],
    [/크림|세럼|에센스|토너|로션|마스크팩|선크림|클렌징|화장품/, ['뷰티/스킨케어']],
    [/샴푸|린스|트리트먼트|바디워시|로션|치약|칫솔|구강/, ['헤어/바디/구강']],
    [/세제|섬유유연제|방향제|탈취제|휴지|물티슈|청소용품|생활용품/, ['생활용품/리빙']],
    [/생선|고등어|갈치|오징어|새우|해산물|소고기|돼지고기|닭고기|정육/, ['수산/정육']],
    [/쌀|현미|잡곡|보리|콩|견과|아몬드|호두/, ['잡곡/견과/쌀']],
    [/냄비|프라이팬|칼|도마|식기|그릇|컵|조리도구|주방용품/, ['주방용품']],
    [/음료|주스|차|커피|탄산수|우유|두유/, ['음료']],
    [/소금|설탕|간장|된장|고추장|식초|식용유|오일|소스|양념/, ['양념/오일']],
    [/의류|옷|신발|가방|모자|양말|패션/, ['패션']],
    [/에어프라이어|청소기|드라이기|선풍기|가습기|가전/, ['가전제품']],
  ];

  for (const [regex, preferred] of rules) {
    if (regex.test(lowerText)) {
      const found = categories.find(c => c === preferred[0]);
      if (found) return found;
    }
  }

  if (lowerText.includes('식품') || lowerText.includes('먹는')) return categories.find(c => c === '간편식/밀키트') || categories[0];
  if (lowerText.includes('생활')) return categories.find(c => c === '생활용품/리빙') || categories[0];

  return categories[0];
};

// ✅ 이 함수가 인자 2개를 받는 것이 올바른 형태입니다.
const beautifyDescriptionIfNeeded = (desc: string | null, groupName: string | null): string | null => {
  if (!desc || !desc.trim()) return null;
  let d = desc.replace(/```/g, '').trim();
  if (!/예약/.test(d) && !/주문/.test(d) && !/구매/.test(d)) {
    d += '\n\n망설이면 품절! 지금 바로 주문하세요! 🚀';
  }
  return d;
};


export async function analyzeProductTextWithAI(
  text: string,
  categories: string[]
): Promise<AIParsedData> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new HttpsError("failed-precondition", "AI 서비스 설정이 서버에 올바르게 구성되지 않았습니다.");
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  const today = toYMD(new Date());

  const prompt = `
You are a super cheerful and witty marketing copywriter for a Korean group-buying e-commerce platform.
Your task is to extract structured product data and write an irresistible sales description.

OUTPUT: ONE raw JSON object ONLY (no markdown fences, no prose). It must conform exactly to the schema below.

Schema:
{
  "productType": "'single' or 'group'",
  "storageType": "'ROOM' | 'FROZEN' | 'COLD'",
  "categoryName": "string (MUST be one of these: [${categories.join(", ")}])",
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

1) cleanedDescription (Sales Copy with a Vibe ✨)
   - Style: Write in a **very lively, fresh, and delightful** tone! Make it pop!
   - Formatting: Use **short sentences**. Each sentence or phrase **MUST** be on a new line.
   - Emphasis: Be generous with markdown bolding. Use **bold** on all keywords, benefits, and appealing phrases. Make it feel dynamic and exciting!
   - Emojis: Sprinkle in 3-5 relevant and cute emojis (e.g., ✨, 💖, 🎉, 🚀, 👍,😋) to amplify the cheerful vibe.
   - CTA: End with a clear and compelling call to action like "망설이면 품절! 지금 바로 주문하세요! 🚀".

2) Category selection
   - You MUST choose ONE category from this exact list: [${categories.join(", ")}].
   - Analyze the text carefully. Never return null or a category not on the list.

3.  Storage type: Infer from '냉장', '냉동', '실온'. Default to 'ROOM'.
4.  Product type: If multiple distinct options (flavors/sizes) exist, use 'group', else 'single'.
5.  variantGroups / items: Extract prices as pure numbers. Parse expirationDate and pickupDate.
6.  Pickup Date Rule (매우 중요): Today is ${today}. Resolve all pickup dates to be in the future. If a year is missing (e.g., 8/15), find the next future occurrence. If a date is in the past, add years until it is in the future.
7.  Nulls: Use null for genuinely missing values, but be aggressive in parsing what's there.

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
      throw new HttpsError("internal", "AI 응답에서 유효한 JSON 객체를 찾을 수 없습니다.");
    }

    const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString) as AIParsedData;

    // Data normalization and post-processing
    if (!parsed.variantGroups || !Array.isArray(parsed.variantGroups)) {
      parsed.variantGroups = [];
    }
    parsed.variantGroups.forEach(vg => {
      if (!vg.items || !Array.isArray(vg.items)) {
        vg.items = [];
      } else {
        vg.items = vg.items.map(it => ({
          ...it,
          price: typeof it.price === 'string' ? Number(String(it.price).replace(/[^0-9]/g, '')) : (it.price ?? 0)
        }));
      }
    });

    try {
      const textBlob = (parsed.groupName || '') + ' ' + (parsed.cleanedDescription || '') + ' ' + (text || '');
      
      if (parsed.variantGroups) {
        parsed.variantGroups = parsed.variantGroups.map(vg => ({
          ...vg,
          pickupDate: ensureFutureYMD(vg.pickupDate)
        }));
      }
      
      if ((!parsed.categoryName || !categories.includes(parsed.categoryName)) && categories?.length > 0) {
        parsed.categoryName = pickCategorySmart(categories, textBlob);
      }
      
      // ✅ 이 함수는 여기서 인자 2개로 호출하는 것이 맞습니다.
      parsed.cleanedDescription = beautifyDescriptionIfNeeded(parsed.cleanedDescription, parsed.groupName);

    } catch (e) {
      console.warn('Post-processing of AI data failed:', (e as Error).message);
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