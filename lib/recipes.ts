// lib/recipes.ts — đọc công thức và tính dinh dưỡng từ bảng thực phẩm (không để AI tự bịa số)
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { recipeNutrition } from "@/lib/nutrition";
import { normalizeVi } from "@/lib/text";

const withNutrients = {
  ingredients: {
    include: {
      food: {
        select: {
          id: true,
          nameVi: true,
          group: true,
          nutrients: { select: { per100g: true, nutrient: { select: { code: true } } } },
        },
      },
    },
  },
} as const;

type RecipeRow = {
  servings: number;
  ingredients: {
    grams: number;
    food: { nutrients: { per100g: number; nutrient: { code: string } }[] };
  }[];
};

// Dinh dưỡng 1 khẩu phần, theo mã chất: { ENERC_KCAL, PROCNT, FAT, CHOCDF, FIBTG }
function nutritionOf(r: RecipeRow) {
  return recipeNutrition(
    r.ingredients.map((i) => ({
      grams: i.grams,
      per100g: Object.fromEntries(i.food.nutrients.map((n) => [n.nutrient.code, n.per100g])),
    })),
    r.servings
  );
}

// Danh sách món cho trang /recipes — dữ liệu chung cho mọi người nên cache lại
export async function getRecipeSummaries() {
  "use cache";
  cacheLife("hours");
  cacheTag("recipes");
  const rows = await db.recipe.findMany({
    where: { isPublic: true },
    include: withNutrients,
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    minutes: r.minutes,
    servings: r.servings,
    kcal: Math.round(nutritionOf(r).ENERC_KCAL ?? 0),
    ingredientNames: r.ingredients.map((i) => i.food.nameVi),
  }));
}

export type RecipeSummary = Awaited<ReturnType<typeof getRecipeSummaries>>[number];

// Chi tiết 1 món
export async function getRecipe(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("recipes");
  const r = await db.recipe.findUnique({ where: { id }, include: withNutrients });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    region: r.region,
    minutes: r.minutes,
    servings: r.servings,
    isPublic: r.isPublic,
    createdById: r.createdById,
    steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
    nutrition: nutritionOf(r),
    ingredients: r.ingredients
      .map((i) => ({ foodId: i.food.id, name: i.food.nameVi, group: i.food.group, grams: i.grams, note: i.note }))
      .sort((a, b) => b.grams - a.grams),
  };
}

// Từ người dùng hay gõ -> tên trong Bảng thành phần thực phẩm Việt Nam
const ALLERGY_ALIASES: Record<string, string[]> = {
  "dau phong": ["lac"],
  heo: ["lon"],
  "dau nanh": ["dau tuong", "dau phu", "xi dau"],
  "hai san": ["tom", "cua", "muc", "oc", "so", "hen", "ngheu"],
  gluten: ["bot mi", "banh my", "mi"],
};

// Bỏ dấu, thay dấu câu bằng khoảng trắng: "thịt lợn nửa nạc, nửa mỡ" -> " thit lon nua nac nua mo "
const words = (s: string) => ` ${normalizeVi(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

// Nguyên liệu nào trong món chứa chất người dùng khai là dị ứng
// So khớp nguyên từ: "heo" -> "lon" khớp "thịt lợn" nhưng không khớp nhầm "lòng gà"
export function findAllergens(ingredientNames: string[], allergies: string[]) {
  const hits: { allergy: string; foods: string[] }[] = [];
  for (const allergy of allergies) {
    const key = words(allergy).trim();
    if (!key) continue;
    const terms = [key, ...(ALLERGY_ALIASES[key] ?? [])].map((t) => ` ${t} `);
    const foods = ingredientNames.filter((name) => {
      const n = words(name);
      return terms.some((t) => n.includes(t));
    });
    if (foods.length) hits.push({ allergy, foods });
  }
  return hits;
}
