// lib/scoring.ts — bước 2 của quy trình gợi ý: code lọc và chấm điểm món TRƯỚC khi gọi AI
// Hàm thuần (không đọc CSDL) để dễ viết kiểm thử đơn vị.

// foodId -> tổng gam còn hạn trong tủ và số ngày tới hạn gần nhất (null = không ghi hạn)
export type Stock = Map<number, { grams: number; expiresInDays: number | null }>;

export type ScoredRecipe = {
  score: number; // < 0 nghĩa là bị loại
  coverage: number; // 0..1: tỷ lệ gam nguyên liệu đã có trong tủ
  missing: string[]; // nguyên liệu còn thiếu
  usesExpiring: string[]; // nguyên liệu sắp hết hạn (≤ 3 ngày) mà món dùng tới
};

export function scoreRecipe(
  r: { ingredients: { foodId: number; name: string; grams: number }[]; allergens: string[] },
  stock: Stock,
  recentlyEaten: boolean
): ScoredRecipe {
  if (r.allergens.length) return { score: -1, coverage: 0, missing: [], usesExpiring: [] }; // loại

  let have = 0;
  let need = 0;
  let expiringBonus = 0;
  const missing: string[] = [];
  const usesExpiring: string[] = [];
  for (const ing of r.ingredients) {
    need += ing.grams;
    const s = stock.get(ing.foodId);
    if (s) {
      have += Math.min(s.grams, ing.grams);
      if (s.expiresInDays !== null && s.expiresInDays <= 3) {
        expiringBonus += 0.15;
        usesExpiring.push(ing.name);
      }
    }
    if (!s || s.grams < ing.grams) missing.push(ing.name);
  }
  const coverage = need ? have / need : 0;
  return {
    score: coverage + expiringBonus - (recentlyEaten ? 0.3 : 0),
    coverage,
    missing,
    usesExpiring,
  };
}
