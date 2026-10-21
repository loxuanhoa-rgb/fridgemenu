// scripts/usda.ts — tìm thực phẩm trên USDA FoodData Central và in dinh dưỡng (trên 100 g)
// Chạy: npx tsx scripts/usda.ts broccoli
import "dotenv/config";

const key = process.env.USDA_API_KEY ?? "DEMO_KEY";
const query = process.argv[2] ?? "broccoli";

async function main() {
  // Chỉ lấy Foundation / SR Legacy: số liệu chuẩn trên 100 g, không phải hàng đóng gói
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA trả lỗi ${res.status}`);
  const data = await res.json();
  const food = data.foods?.[0];
  if (!food) return console.log(`Không tìm thấy "${query}"`);

  console.log(food.fdcId, food.description); // fdcId lưu vào Food.sourceCode
  for (const n of food.foodNutrients) {
    console.log(n.nutrientName, n.value, n.unitName); // giá trị trên 100 g
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
