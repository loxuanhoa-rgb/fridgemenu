"use server";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getUserHousehold } from "@/lib/planner";
import { AI_MODEL, aiConfigured, type AiPlan, type PlanInput } from "@/lib/ai";
import { aiCallsToday, createSuggestion, DAILY_AI_LIMIT } from "@/lib/suggest";
import { addDays, dayLabel, isDateString, MEALS, mondayOf, todayVN, toDbDate } from "@/lib/week";

export type SuggestionView = {
  id: string;
  summary: string;
  warnings: string[];
  attempts: number;
  target: number;
  days: {
    date: string;
    label: string;
    kcal: number;
    meals: { key: string; mealLabel: string; reason: string; recipes: { id: string; name: string; kcal: number }[] }[];
  }[];
};

export type GenerateResult = { error?: string; suggestion?: SuggestionView };

function toView(id: string, input: PlanInput, plan: AiPlan, errors: string[], dayKcal: Record<string, number>, attempts: number): SuggestionView {
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const order = (t: string) => MEALS.findIndex((m) => m.type === t);
  return {
    id,
    summary: plan.summary,
    warnings: errors,
    attempts,
    target: input.targets.kcal,
    days: input.days.map((date) => ({
      date,
      label: dayLabel(date),
      kcal: dayKcal[date] ?? 0,
      meals: (plan.days.find((d) => d.date === date)?.meals ?? [])
        .filter((m) => m.recipeIds.some((rid) => byId.has(rid)))
        .sort((a, b) => order(a.mealType) - order(b.mealType))
        .map((m) => ({
          key: `${date}|${m.mealType}`,
          mealLabel: MEALS.find((x) => x.type === m.mealType)?.label ?? m.mealType,
          reason: m.reason,
          recipes: m.recipeIds
            .filter((rid) => byId.has(rid))
            .map((rid) => ({ id: rid, name: byId.get(rid)!.name, kcal: byId.get(rid)!.kcal })),
        })),
    })),
  };
}

export async function generateSuggestion(mode: "day" | "week", day: string): Promise<GenerateResult> {
  const user = await requireUser();
  if (!aiConfigured()) return { error: "Chưa cấu hình AI: hãy thêm OPENAI_API_KEY vào file .env rồi khởi động lại server." };
  if (!isDateString(day)) return { error: "Ngày không hợp lệ" };
  if ((await aiCallsToday(user.id)) >= DAILY_AI_LIMIT)
    return { error: `Bạn đã dùng hết ${DAILY_AI_LIMIT} lượt gợi ý AI hôm nay. Hãy thử lại vào ngày mai.` };

  const household = await getUserHousehold(user.id);
  if (!household) return { error: "Bạn chưa thuộc hộ gia đình nào" };

  // "week": các ngày còn lại của tuần, tính từ hôm nay
  const today = todayVN();
  const monday = mondayOf(day);
  const days =
    mode === "day"
      ? [day]
      : Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d >= today);
  if (days.length === 0) return { error: "Tuần này đã qua, hãy chọn tuần hiện tại hoặc tuần sau." };

  try {
    const s = await createSuggestion({
      userId: user.id,
      householdId: household.id,
      fridgeId: household.fridges[0]?.id ?? null,
      days,
    });
    if (s.input.candidates.length === 0) return { error: "Không có món nào phù hợp (có thể do dị ứng loại hết món)." };
    return { suggestion: toView(s.id, s.input, s.plan, s.errors, s.dayKcal, s.attempts) };
  } catch (e) {
    if (e instanceof OpenAI.AuthenticationError) return { error: "OPENAI_API_KEY không hợp lệ." };
    if (e instanceof OpenAI.RateLimitError) {
      if (e.code === "insufficient_quota")
        return { error: "Tài khoản OpenAI hết hạn mức/tiền. Hãy nạp thêm ở platform.openai.com → Billing." };
      return { error: "AI đang quá tải, hãy thử lại sau ít phút." };
    }
    if (e instanceof OpenAI.NotFoundError) return { error: `Không tìm thấy model "${AI_MODEL}". Kiểm tra AI_MODEL trong .env.` };
    if (e instanceof OpenAI.BadRequestError) return { error: `AI báo lỗi yêu cầu: ${e.message}` };
    if (e instanceof OpenAI.APIError) return { error: `Lỗi khi gọi AI (${e.status}). Hãy thử lại.` };
    return { error: e instanceof Error ? e.message : "Không tạo được gợi ý." };
  }
}

// Lưu các bữa người dùng giữ lại vào thực đơn. Đọc gợi ý từ CSDL, không tin dữ liệu trình duyệt gửi lên.
export async function applySuggestion(id: string, keys: string[]): Promise<{ error?: string; added?: number }> {
  const user = await requireUser();
  const s = await db.aiSuggestion.findFirst({ where: { id, userId: user.id } });
  if (!s) return { error: "Không tìm thấy gợi ý" };
  const household = await getUserHousehold(user.id);
  if (!household) return { error: "Bạn chưa thuộc hộ gia đình nào" };

  const { plan } = s.result as unknown as { plan: AiPlan };
  const { candidates } = s.input as unknown as PlanInput;
  const valid = new Set(candidates.map((c) => c.id));
  const keep = new Set(z.array(z.string()).parse(keys));

  let added = 0;
  for (const d of plan.days) {
    if (!isDateString(d.date)) continue;
    const weekStart = toDbDate(mondayOf(d.date));
    const mp = await db.mealPlan.upsert({
      where: { householdId_weekStart: { householdId: household.id, weekStart } },
      update: {},
      create: { householdId: household.id, weekStart },
    });
    const rows = d.meals
      .filter((m) => keep.has(`${d.date}|${m.mealType}`))
      .flatMap((m) =>
        m.recipeIds
          .filter((rid) => valid.has(rid))
          .map((recipeId) => ({
            planId: mp.id,
            date: toDbDate(d.date),
            mealType: m.mealType,
            recipeId,
            servings: household.servings,
          }))
      );
    if (rows.length) added += (await db.mealSlot.createMany({ data: rows })).count;
  }
  await db.aiSuggestion.update({ where: { id }, data: { accepted: added > 0 } });
  revalidatePath("/planner");
  return { added };
}

export async function rateSuggestion(id: string, rating: number) {
  const user = await requireUser();
  const r = z.number().int().min(1).max(5).parse(rating);
  await db.aiSuggestion.updateMany({ where: { id, userId: user.id }, data: { rating: r } });
}
