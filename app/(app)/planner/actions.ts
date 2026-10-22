"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cookSlot, getUserHousehold, userOwnsSlot } from "@/lib/planner";
import { isDateString, mondayOf, toDbDate } from "@/lib/week";

export type SlotState = { error?: string; ok?: boolean };

const NewSlot = z.object({
  date: z.string().refine(isDateString, "Ngày không hợp lệ"),
  mealType: z.enum(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]),
  recipeId: z.string().min(1, "Hãy chọn món"),
  servings: z.coerce.number().int("Số suất phải là số nguyên").min(1, "Ít nhất 1 suất").max(50),
});

export async function addSlot(_: SlotState, form: FormData): Promise<SlotState> {
  const user = await requireUser();
  const parsed = NewSlot.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { date, mealType, recipeId, servings } = parsed.data;

  const household = await getUserHousehold(user.id);
  if (!household) return { error: "Bạn chưa thuộc hộ gia đình nào" };
  const recipe = await db.recipe.findFirst({
    where: { id: recipeId, OR: [{ isPublic: true }, { createdById: user.id }] },
    select: { id: true },
  });
  if (!recipe) return { error: "Không tìm thấy món" };

  // Tuần tính từ ngày được chọn, không tin dữ liệu tuần gửi từ trình duyệt
  const weekStart = toDbDate(mondayOf(date));
  const plan = await db.mealPlan.upsert({
    where: { householdId_weekStart: { householdId: household.id, weekStart } },
    update: {},
    create: { householdId: household.id, weekStart },
  });
  await db.mealSlot.create({
    data: { planId: plan.id, date: toDbDate(date), mealType, recipeId, servings },
  });
  revalidatePath("/planner");
  return { ok: true };
}

export async function removeSlot(slotId: string) {
  const user = await requireUser();
  if (!(await userOwnsSlot(user.id, slotId))) return;
  await db.mealSlot.delete({ where: { id: slotId } });
  revalidatePath("/planner");
}

export type CookResult = { error?: string; shortages?: { name: string; missingG: number }[] };

export async function markCooked(slotId: string): Promise<CookResult> {
  const user = await requireUser();
  if (!(await userOwnsSlot(user.id, slotId))) return { error: "Không có quyền với bữa ăn này" };
  const household = await getUserHousehold(user.id);
  const fridge = household?.fridges[0];
  if (!fridge) return { error: "Bạn chưa có tủ lạnh" };

  const result = await cookSlot(slotId, fridge.id);
  revalidatePath("/planner");
  revalidatePath("/fridge");
  return { shortages: result.shortages };
}
