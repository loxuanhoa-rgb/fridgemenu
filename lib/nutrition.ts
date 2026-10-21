// lib/nutrition.ts — tính nhu cầu và dinh dưỡng bằng code (không để AI tự bịa số)

export type Sex = "MALE" | "FEMALE";

// Tuổi tính từ năm sinh (HealthProfile chỉ lưu birthYear)
export function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

// BMR theo Mifflin–St Jeor × hệ số vận động = TDEE (kcal/ngày)
export function dailyEnergy(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: number; // 1.2 ít vận động; 1.375 nhẹ; 1.55 vừa; 1.725 nặng
}) {
  const s = p.sex === "MALE" ? 5 : -161;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + s;
  return Math.round(bmr * p.activityLevel);
}

// Điều chỉnh theo mục tiêu: giảm cân trừ ~400 kcal, tăng cân cộng ~400 kcal
export function energyForGoal(tdee: number, goal: string) {
  if (goal === "giam_can") return tdee - 400;
  if (goal === "tang_can") return tdee + 400;
  return tdee;
}

// Chia năng lượng thành đạm / béo / bột đường (tỷ lệ mẫu, thay bằng số trong tài liệu khuyến nghị)
export function macroTargets(kcal: number, ratio = { protein: 0.15, fat: 0.25, carb: 0.6 }) {
  return {
    proteinG: Math.round((kcal * ratio.protein) / 4), // 1 g đạm = 4 kcal
    fatG: Math.round((kcal * ratio.fat) / 9), // 1 g béo = 9 kcal
    carbG: Math.round((kcal * ratio.carb) / 4), // 1 g bột đường = 4 kcal
  };
}

// Dinh dưỡng 1 khẩu phần = tổng (gam nguyên liệu / 100 × giá trị trên 100 g) / số khẩu phần
export function recipeNutrition(
  ingredients: { grams: number; per100g: Record<string, number> }[],
  servings: number
) {
  const total: Record<string, number> = {};
  for (const ing of ingredients)
    for (const [code, v] of Object.entries(ing.per100g))
      total[code] = (total[code] ?? 0) + (ing.grams / 100) * v;
  for (const k in total) total[k] = +(total[k] / servings).toFixed(1);
  return total;
}

// Quy tắc WHO – Healthy diet, áp cho tổng dinh dưỡng của 1 ngày
export type WhoWarning = { rule: string; message: string };

export function checkWho(day: {
  kcal: number;
  fatG: number;
  sugarG?: number; // đường tự do
  sodiumMg?: number; // natri; muối (g) = natri (mg) × 2.5 / 1000
  fruitVegG?: number; // tổng gam rau + quả
}): WhoWarning[] {
  const warnings: WhoWarning[] = [];
  if (day.kcal > 0 && (day.fatG * 9) / day.kcal > 0.3)
    warnings.push({ rule: "fat", message: "Chất béo vượt 30% năng lượng" });
  if (day.sugarG !== undefined && day.kcal > 0 && (day.sugarG * 4) / day.kcal > 0.1)
    warnings.push({ rule: "sugar", message: "Đường tự do vượt 10% năng lượng" });
  if (day.sodiumMg !== undefined && (day.sodiumMg * 2.5) / 1000 > 5)
    warnings.push({ rule: "salt", message: "Muối vượt 5 g/ngày" });
  if (day.fruitVegG !== undefined && day.fruitVegG < 400)
    warnings.push({ rule: "fruitVeg", message: "Rau quả chưa đủ 400 g/ngày" });
  return warnings;
}
