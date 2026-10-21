import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fridgeStock, getUserFridge } from "@/lib/fridge";
import { findAllergens, getRecipe } from "@/lib/recipes";
import { ageFromBirthYear, dailyEnergy, energyForGoal, macroTargets } from "@/lib/nutrition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const NUTRIENT_ROWS = [
  { code: "ENERC_KCAL", label: "Năng lượng", unit: "kcal", target: "kcal" },
  { code: "PROCNT", label: "Chất đạm", unit: "g", target: "proteinG" },
  { code: "FAT", label: "Chất béo", unit: "g", target: "fatG" },
  { code: "CHOCDF", label: "Bột đường", unit: "g", target: "carbG" },
  { code: "FIBTG", label: "Chất xơ", unit: "g", target: null },
] as const;

async function RecipeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [recipe, user] = await Promise.all([getRecipe(id), requireUser()]);
  if (!recipe || (!recipe.isPublic && recipe.createdById !== user.id)) notFound();

  // Phần riêng của người dùng: đồ trong tủ, dị ứng, nhu cầu mỗi ngày
  const [fridge, profile] = await Promise.all([
    getUserFridge(user.id),
    db.healthProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const stock = fridge ? await fridgeStock(fridge.id) : new Map<number, number>();
  const allergens = findAllergens(
    recipe.ingredients.map((i) => i.name),
    profile?.allergies ?? []
  );

  let targets: Record<string, number> | null = null;
  if (profile) {
    const kcal = energyForGoal(
      dailyEnergy({ ...profile, age: ageFromBirthYear(profile.birthYear) }),
      profile.goal
    );
    targets = { kcal, ...macroTargets(kcal) };
  }

  const enough = recipe.ingredients.filter((i) => (stock.get(i.foodId) ?? 0) >= i.grams).length;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{recipe.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[recipe.region && `Miền ${recipe.region}`, `${recipe.servings} khẩu phần`, recipe.minutes && `${recipe.minutes} phút`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {recipe.description && <p className="text-muted-foreground">{recipe.description}</p>}
      </div>

      {allergens.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Món này có thể chứa chất bạn bị dị ứng</p>
          <ul className="mt-1 text-muted-foreground">
            {allergens.map((a) => (
              <li key={a.allergy}>
                {a.allergy}: {a.foods.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dinh dưỡng 1 khẩu phần</CardTitle>
            <CardDescription>
              {targets ? "% so với nhu cầu mỗi ngày của bạn" : "Điền hồ sơ sức khỏe để so với nhu cầu của bạn"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {NUTRIENT_ROWS.map((n) => {
                  const value = recipe.nutrition[n.code] ?? 0;
                  const target = n.target && targets ? targets[n.target] : null;
                  return (
                    <tr key={n.code}>
                      <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
                        {n.label}
                      </th>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {n.code === "ENERC_KCAL" ? Math.round(value) : value} {n.unit}
                      </td>
                      <td className="w-16 py-2 text-right tabular-nums text-muted-foreground">
                        {target ? `${Math.round((value / target) * 100)}%` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nguyên liệu</CardTitle>
            <CardDescription>
              Tủ lạnh có đủ {enough}/{recipe.ingredients.length} nguyên liệu (cho {recipe.servings} khẩu phần)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {recipe.ingredients.map((i) => {
                const have = stock.get(i.foodId) ?? 0;
                return (
                  <li key={i.foodId} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p>
                        {i.name} <span className="tabular-nums text-muted-foreground">· {i.grams} g</span>
                      </p>
                      {i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}
                    </div>
                    <span className="shrink-0 text-xs">
                      {have >= i.grams ? (
                        <span className="text-green-700 dark:text-green-400">✓ Đủ</span>
                      ) : have > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          Thiếu {Math.round(i.grams - have)} g
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Chưa có</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cách làm</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}

export default function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  return (
    <>
      <Link href="/recipes" className="text-sm text-muted-foreground hover:text-foreground">
        ← Tất cả công thức
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Đang tải công thức...</p>}>
        <RecipeDetail params={params} />
      </Suspense>
    </>
  );
}
