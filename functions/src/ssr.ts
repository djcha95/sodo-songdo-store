import { onRequest } from "firebase-functions/v2/https";
import * as fs from "fs";
import * as path from "path";

// 임시 상품 데이터 예시 (실제로는 DB나 API 호출)
const getProductData = (productId: string) => {
  return {
    title: `상품 ${productId}`,
    description: `${productId}번 상품 설명입니다.`,
    image: `https://your-domain.com/images/${productId}.jpg`
  };
};

export const ssr = onRequest({ region: "asia-northeast3" }, (req, res) => {
  const distPath = path.resolve(__dirname, "../dist");
  let html = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");

  const productId = req.path.split("/").pop() || "";
  const product = getProductData(productId);

  // OG 태그 삽입
  html = html.replace(
    "</head>",
    `
    <meta property="og:title" content="${product.title}" />
    <meta property="og:description" content="${product.description}" />
    <meta property="og:image" content="${product.image}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${req.protocol}://${req.get("host")}${req.originalUrl}" />
    </head>`
  );

  res.set("Cache-Control", "public, max-age=600, s-maxage=1200");
  res.send(html);
});
