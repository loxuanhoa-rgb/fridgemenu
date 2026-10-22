// lib/ai.ts — bước 3–4: gọi ChatGPT (OpenAI) chọn món trong danh sách đã lọc, rồi code kiểm tra lại.
// CHỈ chạy trên server (khóa API nằm trong biến môi trường).
import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"] as const;

// Mẫu JSON AI phải trả về (structured outputs: API đảm bảo đúng cấu trúc)
export const PlanSchema = z.object({
  days: z.array(
    z.object({
      date: z.string().describe("Ngày dạng YYYY-MM-DD, đúng một trong các ngày được yêu cầu"),
      meals: z.array(
        z.object({
          mealType: z.enum(MEAL_TYPES),
          recipeIds: z.array(z.string()).describe("id món trong CANDIDATES; 1 bữa có thể gồm nhiều món"),
          reason: z.string().describe("Lý do chọn, 1 câu tiếng Việt"),
        })
      ),
    })
  ),
  summary: z.string().describe("Nhận xét ngắn về thực đơn, 1–2 câu tiếng Việt"),
});

export type AiPlan = z.infer<typeof PlanSchema>;

export type Candidate = {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  coveragePct: number;
  missing: string[];
  usesExpiring: string[];
  recentlyEaten: boolean;
};

export type PlanInput = {
  days: string[];
  targets: { kcal: number; proteinG: number; fatG: number; carbG: number };
  candidates: Candidate[];
  expiring: string[];
  // Món đã có sẵn trong lịch: AI chỉ điền các bữa còn trống
  existing: { date: string; mealType: string; recipeIds: string[] }[];
};

export const AI_MODEL = process.env.AI_MODEL || "gpt-5.4-mini";
const MAX_RETRIES = 2; // sai thì gửi lại AI kèm lỗi, tối đa 2 lần
const KCAL_TOLERANCE = 0.1; // ±10% mục tiêu mỗi ngày

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM = `Bạn là chuyên gia dinh dưỡng Việt Nam, lập thực đơn gia đình từ danh sách món có sẵn.
Quy tắc bắt buộc:
- CHỈ dùng món trong CANDIDATES, ghi đúng id. Không tự nghĩ ra món.
- Mỗi người ăn 1 suất mỗi món; kcal/đạm/béo/bột đường trong CANDIDATES là của 1 suất.
- Một bữa có thể gồm nhiều món (ví dụ cơm trắng + món mặn + rau). Bữa SNACK có thể bỏ trống.
- Chỉ điền các bữa còn trống; KHÔNG trả về bữa đã có trong EXISTING.
- Tổng kcal mỗi ngày (gồm cả món đã có) nằm trong ±10% mục tiêu; cân đối đạm, béo, bột đường.
- Ưu tiên món dùng nguyên liệu sắp hết hạn và món có coveragePct cao (nguyên liệu đã có trong tủ).
- Tránh món recentlyEaten; mỗi món tối đa 2 lần trong các ngày được yêu cầu (trừ cơm trắng và rau).
- Viết reason và summary bằng tiếng Việt, ngắn gọn.`;

// Kiểm tra bằng code: ngày, bữa, id món, số lần lặp, kcal mỗi ngày
export function validatePlan(plan: AiPlan, input: PlanInput) {
  const errors: string[] = [];
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const filled = new Set(input.existing.map((e) => `${e.date}|${e.mealType}`));
  const uses = new Map<string, number>();

  for (const day of plan.days) {
    if (!input.days.includes(day.date)) errors.push(`Ngày ${day.date} không nằm trong các ngày được yêu cầu.`);
    for (const m of day.meals) {
      if (filled.has(`${day.date}|${m.mealType}`))
        errors.push(`${day.date} bữa ${m.mealType} đã có món, không được điền thêm.`);
      if (m.recipeIds.length === 0) errors.push(`${day.date} bữa ${m.mealType} không có món nào.`);
      for (const id of m.recipeIds) {
        if (!byId.has(id)) errors.push(`id món không có trong CANDIDATES: ${id}`);
        else uses.set(id, (uses.get(id) ?? 0) + 1);
      }
    }
  }
  for (const d of input.days)
    if (!plan.days.some((p) => p.date === d)) errors.push(`Thiếu ngày ${d}.`);
  for (const [id, n] of uses) {
    const name = byId.get(id)!.name;
    if (n > 2 && !/^(Cơm trắng|Rau )/.test(name)) errors.push(`Món "${name}" lặp ${n} lần (tối đa 2).`);
  }

  // kcal mỗi ngày = món đã có + món AI thêm
  const kcalOf = (ids: string[]) => ids.reduce((s, id) => s + (byId.get(id)?.kcal ?? 0), 0);
  const dayKcal: Record<string, number> = {};
  for (const d of input.days) {
    const existingKcal = kcalOf(input.existing.filter((e) => e.date === d).flatMap((e) => e.recipeIds));
    const added = kcalOf(plan.days.filter((p) => p.date === d).flatMap((p) => p.meals.flatMap((m) => m.recipeIds)));
    dayKcal[d] = Math.round(existingKcal + added);
    const diff = (dayKcal[d] - input.targets.kcal) / input.targets.kcal;
    if (Math.abs(diff) > KCAL_TOLERANCE)
      errors.push(
        `Ngày ${d}: ${dayKcal[d]} kcal, lệch ${Math.round(diff * 100)}% so với mục tiêu ${input.targets.kcal} kcal (cho phép ±10%).`
      );
  }
  return { errors, dayKcal };
}

export async function suggestPlan(input: PlanInput) {
  const client = new OpenAI(); // đọc OPENAI_API_KEY từ biến môi trường

  const userContent = JSON.stringify({
    DAYS: input.days,
    TARGETS_PER_DAY: input.targets,
    EXPIRING_SOON: input.expiring,
    EXISTING: input.existing,
    CANDIDATES: input.candidates,
  });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Lập thực đơn cho các ngày trong DAYS.\n${userContent}` },
  ];

  let best: { plan: AiPlan; errors: string[]; dayKcal: Record<string, number> } | null = null;
  let attempts = 0;
  for (; attempts <= MAX_RETRIES; attempts++) {
    // Structured outputs: API buộc câu trả lời đúng mẫu PlanSchema, SDK tự parse bằng Zod
    const completion = await client.chat.completions.parse({
      model: AI_MODEL,
      messages,
      response_format: zodResponseFormat(PlanSchema, "meal_plan"),
      reasoning_effort: "medium",
      max_completion_tokens: 16000,
    });
    const message = completion.choices[0]?.message;
    if (message?.refusal) throw new Error(`AI từ chối yêu cầu: ${message.refusal}`);
    const plan = message?.parsed;
    if (!plan)
      throw new Error(`AI không trả về JSON hợp lệ (finish_reason: ${completion.choices[0]?.finish_reason}).`);

    const { errors, dayKcal } = validatePlan(plan, input);
    if (!best || errors.length < best.errors.length) best = { plan, errors, dayKcal };
    if (errors.length === 0) break;

    // Gửi lại AI kèm lỗi (giữ nguyên lịch sử, chỉ nối thêm)
    messages.push({ role: "assistant", content: message.content ?? JSON.stringify(plan) });
    messages.push({
      role: "user",
      content: `Thực đơn chưa đạt, hãy sửa và trả lại toàn bộ:\n- ${errors.join("\n- ")}`,
    });
  }
  return { ...best!, attempts: Math.min(attempts + 1, MAX_RETRIES + 1) };
}
