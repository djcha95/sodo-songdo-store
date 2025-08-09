// functions/src/utils/gemini.ts
import * as functions from "firebase-functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function analyzeProductTextWithAI(text: string, categories: string[]): Promise<object> {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.error("Gemini API key is not available in environment variables.");
    throw new functions.https.HttpsError(
      "failed-precondition",
      "AI 서비스 설정이 서버에 올바르게 구성되지 않았습니다. 관리자에게 문의해주세요."
    );
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  // ✅ [최종 개선] 상세 설명을 꾸며주는 기능을 추가하여 프롬프트를 최종 업그레이드합니다.
  const prompt = `
    You are an intelligent assistant and expert copywriter for a Korean group-buying platform.
    Your task is to extract key product information from a given Korean text and return it as a structured JSON object.

    ### ❗ SUPER IMPORTANT RULES:
    1.  **Date Context**: Today is August 9, 2025. If a date in the text does not specify a year (e.g., "8월 15일"), you MUST assume it refers to the closest future date, which would be in 2025.
    2.  **Date Formats**: You must be able to parse various date formats like "26.07.01" or "250815" (YYMMDD).
    3.  **Category Classification**: From the provided list of valid categories, you MUST choose the single most relevant category.
    4.  **groupName Simplification**: The 'groupName' field MUST be concise. Remove store prefixes like "소도몰X", "소도몰×", or "[소도몰]".
    5.  **items.name Simplification**: The 'name' field inside the 'items' array MUST contain ONLY the essential unit information (e.g., "1팩", "1개 (300g)", "1인분"). DO NOT repeat the main product name.
    6.  **✨ cleanedDescription Beautification (COPYWRITER MODE)**: The 'cleanedDescription' field is your masterpiece. Rewrite the promotional text to be more engaging and beautiful for customers.
        - Add relevant and appealing emojis (like ✨, 🔥, 🍜, 👍, 🎉).
        - Use concise and impactful language.
        - Improve line breaks (use \\n) for mobile readability.
        - Use Markdown for emphasis (e.g., "**강조할 텍스트**").
        - The output MUST be a single JSON-compatible string.
    7.  **Grouped Products**: If the text describes multiple distinct products (e.g., different flavors), create a separate object for each within the "variantGroups" array.
    8.  **JSON Output**: The final output must be ONLY a valid JSON object, without any surrounding text or markdown backticks.

    ### Fields to Extract:
    - "productType": "single" or "group".
    - "storageType": Must be one of "ROOM", "COLD", "FROZEN". Default is "ROOM".
    - "categoryName": The single most relevant category from the provided list.
    - "groupName": The concise main product name (Rule #4).
    - "cleanedDescription": The beautified, engaging promotional text created in your copywriter mode (Rule #6).
    - "variantGroups": An array of objects.
        - "groupName": Sub-group name (e.g., a specific flavor). For single products, this should be same as the main groupName.
        - "totalPhysicalStock": Numerical stock quantity. Null if not found.
        - "expirationDate": Expiration date in "YYYY-MM-DD" format.
        - "pickupDate": Pickup start date in "YYYY-MM-DD" format.
        - "items": An array of item objects.
            - "name": The simplified unit name (Rule #5).
            - "price": Numerical price.
    
    ### Example:
    - **Given Categories**: ["간식/과자", "수산/정육", "간편식/밀키트", "생활용품"]
    - **Input Text**: "<소도몰X교동면가 3종> 맛보신 분들은 또 다시 찾죠. 불맛나는 진한 짬뽕, 짜장면, 화룡점정으로 탕수육까지! 푸짐한 한 상으로 우리집을 중식당으로! 짬뽕은 1인분에 4,450원꼴! 짜장면 1인분에 3,950원꼴!"
    - **Correct JSON Output**:
      {
        "productType": "group",
        "storageType": "FROZEN",
        "categoryName": "간편식/밀키트",
        "groupName": "교동면가 3종",
        "cleanedDescription": "맛보신 분들은 또 다시 찾죠! 🔥\\n\\n불맛나는 진한 **짬뽕**, **짜장면**,\\n화룡점정으로 **탕수육**까지!\\n\\n푸짐한 한 상으로\\n우리집을 중식당으로 변신! ✨\\n\\n🍜 짬뽕 1인분 4,450원!\\n🍜 짜장면 1인분 3,950원!",
        "variantGroups": [{
          "groupName": "교동면가 3종",
          "totalPhysicalStock": null,
          "expirationDate": null,
          "pickupDate": null,
          "items": [
            { "name": "짬뽕 1인분", "price": 4450 },
            { "name": "짜장면 1인분", "price": 3950 }
          ]
        }]
      }
    
    ---

    ### TASK:
    - **Valid Categories**: [${categories.join(", ")}]
    - **Text to Analyze**:
    """
    ${text}
    """
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // AI 응답에서 JSON만 정확히 추출하는 정규식 강화
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})/);
    if (!jsonMatch) {
        console.error("AI 응답에 유효한 JSON이 포함되어 있지 않습니다. 응답:", responseText);
        throw new Error("AI가 유효한 JSON 형식을 반환하지 않았습니다.");
    }
    
    const jsonString = jsonMatch[1] || jsonMatch[2];
    if (!jsonString) {
        console.error("AI 응답에서 JSON 문자열을 추출할 수 없습니다. 응답:", responseText);
        throw new Error("AI 응답에서 JSON 데이터를 추출하지 못했습니다.");
    }
    
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Error analyzing text with Gemini AI:", error);
    throw new functions.https.HttpsError(
      "internal",
      "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      error
    );
  }
}