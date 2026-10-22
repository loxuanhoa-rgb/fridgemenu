// lib/planner.ts — lịch thực đơn tuần của hộ gia đình
import { db } from "@/lib/db";
import { toDbDate } from "@/lib/week";

// Hộ gia đình đầu tiên của người dùng (được tạo sẵn khi đăng nhập lần đầu)
export function getUserHousehold(userId: string) {
  return db.household.findFirst({
    where: { members: { some: { userId } } },
    include: { fridges: { orderBy: { name: "asc" }, take: 1 } },
  });
}

export function getWeekSlots(householdId: string, monday: string) {
  return db.mealSlot.findMany({
    where: { plan: { householdId, weekStart: toDbDate(monday) } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

// Bữa ăn có thuộc hộ gia đình của người dùng không
export function userOwnsSlot(userId: string, slotId: string) {
  return db.mealSlot
    .count({ where: { id: slotId, plan: { household: { members: { some: { userId } } } } } })
    .then((n) => n > 0);
}

// "Đã nấu": trừ nguyên liệu trong tủ lạnh, đồ gần hết hạn dùng trước.
// Lượng cần = gam trong công thức × số suất nấu / số khẩu phần của công thức.
// Trả về các nguyên liệu tủ không đủ (đã trừ hết phần có).
export async function cookSlot(slotId: string, fridgeId: string) {
  return db.$transaction(async (tx) => {
    const slot = await tx.mealSlot.findUniqueOrThrow({
      where: { id: slotId },
      include: { recipe: { include: { ingredients: { include: { food: true } } } } },
    });
    if (slot.cooked) return { alreadyCooked: true, shortages: [] };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const shortages: { name: string; missingG: number }[] = [];

    for (const ing of slot.recipe.ingredients) {
      let need = (ing.grams * slot.servings) / slot.recipe.servings;
      const items = await tx.fridgeItem.findMany({
        where: {
          fridgeId,
          foodId: ing.foodId,
          OR: [{ expiresAt: null }, { expiresAt: { gte: today } }],
        },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { addedAt: "asc" }],
      });
      for (const item of items) {
        if (need <= 0) break;
        const used = Math.min(item.quantityG, need);
        need -= used;
        // Còn dưới 1 g coi như hết, xóa khỏi tủ
        if (item.quantityG - used < 1) await tx.fridgeItem.delete({ where: { id: item.id } });
        else await tx.fridgeItem.update({ where: { id: item.id }, data: { quantityG: item.quantityG - used } });
      }
      if (need >= 1) shortages.push({ name: ing.food.nameVi, missingG: Math.round(need) });
    }

    await tx.mealSlot.update({ where: { id: slotId }, data: { cooked: true } });
    return { alreadyCooked: false, shortages };
  });
}
