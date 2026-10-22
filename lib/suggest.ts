// lib/suggest.ts — ghép quy trình gợi ý 5 bước (mục 8.1 tài liệu)
import "server-only";
import { db } from "@/lib/db";
import { getRecipe, getRecipeSummaries, findAllergens } from "@/lib/recipes";
import { scoreRecipe, type Stock } from "@/lib/scoring";
import { suggestPlan, type Candidate } from "@/lib/ai";
import { ageFromBirthYear, dailyEnergy, energyForGoal, macroTargets } from "@/lib/nutrition";
import { addDays, fromDbDate, todayVN, toDbDate } from "@/lib/week";

export const DAILY_AI_LIMIT = 10; // giới hạn số lần gọi AI mỗi người/ngày
const MAX_CANDIDATES = 40;

// Bắt đầu ngày hôm nay theo giờ Việt Nam (UTC+7), dùng để đếm số lần gọi trong ngày
function startOfTodayVN() {
  return new Date(toDbDate(todayVN()).getTime() - 7 * 3600 * 1000);
}

export async function aiCallsToday(userId: string) {
  return db.aiSuggestion.count({ where: { userId, createdAt: { gte: startOfTodayVN() } } });
}

// Tồn kho còn hạn: foodId -> tổng gam + số ngày tới hạn gần nhất
async function loadStock(fridgeId: string, today: string): Promise<Stock> {
  const items = await db.fridgeItem.findMany({
    where: { fridgeId, OR: [{ expiresAt: null }, { expiresAt: { gte: toDbDate(today) } }] },
  });
  const stock: Stock = new Map();
  for (const it of items) {
    const days = it.expiresAt
      ? Math.round((toDbDate(fromDbDate(it.expiresAt)).getTime() - toDbDate(today).getTime()) / 864e5)
      : null;
    const cur = stock.get(it.foodId);
    stock.set(it.foodId, {
      grams: (cur?.grams ?? 0) + it.quantityG,
      expiresInDays:
        cur?.expiresInDays == null ? days : days == null ? cur.expiresInDays : Math.min(cur.expiresInDays, days),
    });
  }
  return stock;
}

export type SuggestionContext = Awaited<ReturnType<typeof buildContext>>;

// Bước 1–2: lấy dữ liệu, lọc và chấm điểm món
export async function buildContext(userId: string, householdId: string, fridgeId: string | null) {
  const today = todayVN();
  const [profile, summaries, stock, recent] = await Promise.all([
    db.healthProfile.findUnique({ where: { userId } }),
    getRecipeSummaries(),
    fridgeId ? loadStock(fridgeId, today) : Promise.resolve<Stock>(new Map()),
    db.mealSlot.findMany({
      where: {
        plan: { householdId },
        date: { gte: toDbDate(addDays(today, -7)), lt: toDbDate(today) },
      },
      select: { recipeId: true },
    }),
  ]);
  const recentIds = new Set(recent.map((r) => r.recipeId));
  const allergies = profile?.allergies ?? [];

  const scored = await Promise.all(
    summaries.map(async (s) => {
      const r = (await getRecipe(s.id))!;
      // Lượng nguyên liệu của cả công thức (1 lần nấu), so với đồ đang có trong tủ
      const ingredients = r.ingredients.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams }));
      const allergens = findAllergens(
        ingredients.map((i) => i.name),
        allergies
      ).map((a) => a.allergy);
      return { s, result: scoreRecipe({ ingredients, allergens }, stock, recentIds.has(s.id)) };
    })
  );

  const candidates: Candidate[] = scored
    .filter((x) => x.result.score >= 0)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, MAX_CANDIDATES)
    .map(({ s, result }) => ({
      id: s.id,
      name: s.name,
      kcal: s.kcal,
      proteinG: Math.round(s.proteinG),
      fatG: Math.round(s.fatG),
      carbG: Math.round(s.carbG),
      coveragePct: Math.round(result.coverage * 100),
      missing: result.missing.slice(0, 6),
      usesExpiring: result.usesExpiring,
      recentlyEaten: recentIds.has(s.id),
    }));

  let targets = { kcal: 2000, proteinG: 75, fatG: 56, carbG: 300 }; // mặc định khi chưa có hồ sơ
  if (profile) {
    const kcal = energyForGoal(dailyEnergy({ ...profile, age: ageFromBirthYear(profile.birthYear) }), profile.goal);
    targets = { kcal, ...macroTargets(kcal) };
  }

  const expiring = [...new Set(candidates.flatMap((c) => c.usesExpiring))];
  return { today, profile, targets, candidates, expiring, excluded: scored.filter((x) => x.result.score < 0).length };
}

// Bước 3–5: gọi AI, kiểm tra, lưu lại để đánh giá trong báo cáo
export async function createSuggestion(opts: {
  userId: string;
  householdId: string;
  fridgeId: string | null;
  days: string[];
}) {
  const ctx = await buildContext(opts.userId, opts.householdId, opts.fridgeId);
  const slots = await db.mealSlot.findMany({
    where: { plan: { householdId: opts.householdId }, date: { in: opts.days.map(toDbDate) } },
    select: { date: true, mealType: true, recipeId: true },
  });
  const existingMap = new Map<string, { date: string; mealType: string; recipeIds: string[] }>();
  for (const s of slots) {
    const key = `${fromDbDate(s.date)}|${s.mealType}`;
    const e = existingMap.get(key) ?? { date: fromDbDate(s.date), mealType: s.mealType, recipeIds: [] };
    e.recipeIds.push(s.recipeId);
    existingMap.set(key, e);
  }
  const input = {
    days: opts.days,
    targets: ctx.targets,
    candidates: ctx.candidates,
    expiring: ctx.expiring,
    existing: [...existingMap.values()],
  };

  const started = Date.now();
  const result = await suggestPlan(input);
  const saved = await db.aiSuggestion.create({
    data: {
      userId: opts.userId,
      input,
      result: { ...result, ms: Date.now() - started },
    },
  });
  return { id: saved.id, input, ...result };
}
