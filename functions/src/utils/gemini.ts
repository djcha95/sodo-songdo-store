// functions/src/utils/gemini.ts
import { HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 주어진 한국어 상품 텍스트에서 핵심 정보를 추출해 구조화 JSON으로 반환합니다.
 * @param text 원문 텍스트(카톡 공구글 등)
 * @param categories 카테고리 힌트 목록(예: ["식품","생활","주방"])
 */
export async function analyzeProductTextWithAI(
  text: string,
  categories: string[]
): Promise<object> {
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

  // 프롬프트(요약): 한국어 판매글에서 핵심 필드만 JSON으로 추출
  const prompt = `
You are an assistant for a Korean group-buying platform.
Extract key product info from the Korean text and return ONLY a JSON object.
No explanations, no markdown.

Required JSON shape (all fields in Korean keys):
{
  "상품명": string,                // 없으면 가능한 추정명
  "옵션": string[] | [],           // 없으면 []
  "가격": number | null,           // 숫자만, 원 단위
  "용량/구성": string | null,
  "입고일": string | null,         // "YYYY-MM-DD" 또는 "M/D (요일)" 원문 보존
  "유통기한": string | null,       // 가능한 원문 보존
  "한정수량": string | null,       // "15개", "32세트" 등 원문 보존
  "카테고리": string | null,       // ${categories.join(", ")} 중 하나로 추정 가능하면 지정
  "핵심효용": string[],            // 2~5개 핵심 포인트
  "주의사항": string[]             // 있으면 수집, 없으면 []
}

Rules:
- 가격은 숫자만(예: "6,900원" -> 6900)
- 날짜·수량 등은 원문 형식 최대 보존
- 정보가 없으면 null 또는 빈 배열
- 반드시 유효한 JSON만 출력

--- 원문 시작 ---
${text}
--- 원문 끝 ---
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text() ?? "";

    // JSON 블록 추출(```json ... ``` 또는 첫 번째 {...})
    const jsonMatch =
      responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
      responseText.match(/({[\s\S]*})/);

    if (!jsonMatch) {
      console.error("AI 응답에 유효한 JSON이 포함되어 있지 않습니다. 응답:", responseText);
      throw new HttpsError(
        "internal",
        "AI 응답에서 JSON 데이터를 찾지 못했습니다. 잠시 후 다시 시도해주세요."
      );
    }

    // 캡처 그룹 선택
    const raw = (jsonMatch[1] ?? jsonMatch[0]).trim();

    // 가끔 들어오는 BOM/제어문자 제거
    const jsonString = raw
      .replace(/^\uFEFF/, "")
      .replace(/^[^\{\[]+/, "") // JSON 앞의 노이즈 제거
      .replace(/[^}\]]+$/, ""); // JSON 뒤의 노이즈 제거

    if (!jsonString) {
      console.error("AI 응답에서 JSON 문자열을 추출할 수 없습니다. 응답:", responseText);
      throw new HttpsError(
        "internal",
        "AI 응답에서 JSON 데이터를 추출하지 못했습니다."
      );
    }

    // 파싱 및 최소 유효성 체크
    const parsed = JSON.parse(jsonString);

    // 가격 숫자형 보정(문자 들어오면 숫자만 추출)
    if (parsed && typeof parsed["가격"] !== "number" && parsed["가격"] != null) {
      const n = String(parsed["가격"]).replace(/[^\d]/g, "");
      parsed["가격"] = n ? Number(n) : null;
    }

    // 배열 필드 보정
    if (!Array.isArray(parsed["옵션"])) parsed["옵션"] = parsed["옵션"] ? [String(parsed["옵션"])] : [];
    if (!Array.isArray(parsed["핵심효용"])) parsed["핵심효용"] = parsed["핵심효용"] ? [String(parsed["핵심효용"])] : [];
    if (!Array.isArray(parsed["주의사항"])) parsed["주의사항"] = parsed["주의사항"] ? [String(parsed["주의사항"])] : [];

    return parsed;
  } catch (error) {
    console.error("Error analyzing text with Gemini AI:", error);
    throw new HttpsError(
      "internal",
      "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      error as Error
    );
  }
}