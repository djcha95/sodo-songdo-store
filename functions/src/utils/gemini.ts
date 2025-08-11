// functions/src/utils/gemini.ts
import { HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { StorageType } from "../types"; 

interface AIParsedData {
  productType: 'single' | 'group';
  storageType: StorageType;
  categoryName: string | null;
  groupName: string | null;
  cleanedDescription: string | null;
  variantGroups: {
    groupName: string | null;
    totalPhysicalStock: number | null;
    expirationDate: string | null; // YYYY-MM-DD
    pickupDate: string | null;     // YYYY-MM-DD
    items: { name: string; price: number; }[];
  }[];
}

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

  const prompt = `
You are an intelligent assistant for a Korean group-buying e-commerce platform.
Your task is to extract key product information from the provided Korean text and return ONLY a single, valid JSON object that matches the specified TypeScript interface.
Do not include any explanations, markdown syntax like \`\`\`json, or any other text outside of the JSON object itself.

The JSON object MUST have the following structure (use English keys):
{
  "productType": "'single' or 'group'",
  "storageType": "'ROOM', 'FROZEN', or 'COLD'",
  "categoryName": "string | null (must be one of [${categories.join(", ")}])",
  "groupName": "string | null (the main product name)",
  "cleanedDescription": "string | null (A fun, engaging marketing intro for the product in a friendly tone. Use 1-2 relevant emojis to make it lively.)",
  "variantGroups": [
    {
      "groupName": "string | null (e.g., '매운맛', '순한맛', or the main product name if single type)",
      "totalPhysicalStock": "number | null",
      "expirationDate": "string | null ('YYYY-MM-DD' format)",
      "pickupDate": "string | null ('YYYY-MM-DD' format, also known as 입고일)",
      "items": [
        {
          "name": "string (the option name, e.g., '1개', '1박스')",
          "price": "number (numeric value only, e.g., 6900)"
        }
      ]
    }
  ]
}

Key Rules:
1.  **JSON Output Only**: Your entire response must be a single, raw JSON object.
2.  **Keys**: Use the specified English keys precisely.
3.  **productType**: If there are multiple distinct options (like different flavors or sizes that aren't simple bundles), classify as 'group'. Otherwise, 'single'.
4.  **storageType**: Infer from words like '냉장', '냉동', '실온'. Default to 'ROOM' if unsure.
5.  **categoryName**: If the product seems to fit one of the provided categories, assign it. Otherwise, return null.
6.  **groupName**: Determine the primary, overarching name for the product.
7.  **cleanedDescription**: Based on the original text, create a short, appealing marketing message. Make it sound friendly and exciting.
8.  **variantGroups**: This is an array.
    - If productType is 'single', this array will contain one object. Its 'groupName' should be the same as the main 'groupName'.
    - If productType is 'group', this array can contain multiple objects, one for each sub-group (e.g., one for '매운맛', one for '순한맛').
    - **expirationDate**: Extract the '유통기한'. Convert to 'YYYY-MM-DD'.
    - **pickupDate**: Extract the '입고일' or '픽업일'. Convert to 'YYYY-MM-DD'.
    - **items**: This is an array of purchasing options within a variant group.
    - **price**: Must be a number. Extract digits only from prices like "6,900원".
9.  **Null Values**: If information for a field cannot be found, use \`null\` for non-array fields and \`[]\` for array fields.
10. **Item Naming**: For the \`name\` field in \`items\`, if it is a single unit, always name it '1개'. For a bundle like a box or a pack, name it '1박스' or '1팩'. Avoid technical units like '200g' if a simpler name is available. No parentheses are needed.

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

    if (!parsed.variantGroups || !Array.isArray(parsed.variantGroups)) {
        parsed.variantGroups = [];
    }
    parsed.variantGroups.forEach(vg => {
        if (!vg.items || !Array.isArray(vg.items)) {
            vg.items = [];
        }
    });

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
