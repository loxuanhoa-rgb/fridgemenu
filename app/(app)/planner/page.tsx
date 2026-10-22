import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fridgeStock } from "@/lib/fridge";
import { getRecipe, getRecipeSummaries, type RecipeSummary } from "@/lib/recipes";
import { getUserHousehold, getWeekSlots } from "@/lib/planner";
import { ageFromBirthYear, checkWho, dailyEnergy, energyForGoal, macroTargets } from "@/lib/nutrition";
import {
  addDays,
  dayLabel,
  fromDbDate,
  fullDayLabel,
  isDateString,
  MEALS,
  mondayOf,
  todayVN,
  weekDays,
} from "@/lib/week";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aiConfigured } from "@/lib/ai";
import { aiCallsToday, DAILY_AI_LIMIT } from "@/lib/suggest";
import { AddSlotDialog } from "./add-slot-dialog";
import { AiPanel } from "./ai-panel";
import { SlotItem } from "./slot-item";

type Totals = { kcal: number; p: number; f: number; c: number; fiber: number };
type Targets = { kcal: number; proteinG: number; fatG: number; carbG: number };

// Tổng dinh dưỡng 1 người trong ngày (mỗi người ăn 1 suất mỗi món)
function sumNutrition(recipeIds: string[], byId: Map<string, RecipeSummary>): Totals {
  return recipeIds.reduce<Totals>(
    (t, id) => {
      const r = byId.get(id);
      if (!r) return t;
      return { kcal: t.kcal + r.kcal, p: t.p + r.proteinG, f: t.f + r.fatG, c: t.c + r.carbG, fiber: t.fiber + r.fiberG };
    },
    { kcal: 0, p: 0, f: 0, c: 0, fiber: 0 }
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const pct = target ? Math.round((value / target) * 100) : null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-medium">{Math.round(value)}</span>
          {target ? ` / ${target}` : ""} {unit}
          {pct !== null && <span className="ml-1 text-muted-foreground">({pct}%)</span>}
        </span>
      </div>
      {target ? (
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div
            className={`h-full rounded-full ${pct! > 110 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.min(pct!, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// Tỷ lệ năng lượng từ đạm / béo / bột đường, so với khuyến nghị mẫu 15/25/60
function EnergySplit({ t }: { t: Totals }) {
  const parts = [
    { label: "Đạm", kcal: t.p * 4, rec: 15, color: "bg-sky-500" },
    { label: "Béo", kcal: t.f * 9, rec: 25, color: "bg-amber-500" },
    { label: "Bột đường", kcal: t.c * 4, rec: 60, color: "bg-emerald-500" },
  ];
  const sum = parts.reduce((s, p) => s + p.kcal, 0);
  if (sum === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">Năng lượng đến từ</p>
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Tỷ lệ năng lượng từ đạm, béo, bột đường">
        {parts.map((p) => (
          <div key={p.label} className={p.color} style={{ width: `${(p.kcal / sum) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-2 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex flex-col">
            <span className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${p.color}`} aria-hidden />
              {p.label}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{Math.round((p.kcal / sum) * 100)}%</span>
              <span className="text-muted-foreground"> · nên {p.rec}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Planner({ searchParams }: { searchParams: Promise<{ day?: string; week?: string }> }) {
  const sp = await searchParams;
  const today = todayVN();
  // ?day=... chọn ngày; ?week=... (link cũ) mở Thứ Hai của tuần đó
  const day = isDateString(sp.day) ? sp.day : isDateString(sp.week) ? sp.week : today;
  const monday = mondayOf(day);
  const days = weekDays(monday);

  const user = await requireUser();
  const [household, profile, recipes] = await Promise.all([
    getUserHousehold(user.id),
    db.healthProfile.findUnique({ where: { userId: user.id } }),
    getRecipeSummaries(),
  ]);
  if (!household) return <p className="text-muted-foreground">Bạn chưa thuộc hộ gia đình nào.</p>;

  const fridge = household.fridges[0];
  const [slots, stock, aiUsed] = await Promise.all([
    getWeekSlots(household.id, monday),
    fridge ? fridgeStock(fridge.id) : Promise.resolve(new Map<number, number>()),
    aiCallsToday(user.id),
  ]);
  const byId = new Map(recipes.map((r) => [r.id, r]));

  let targets: Targets | null = null;
  if (profile) {
    const kcal = energyForGoal(dailyEnergy({ ...profile, age: ageFromBirthYear(profile.birthYear) }), profile.goal);
    targets = { kcal, ...macroTargets(kcal) };
  }

  const daySlots = slots.filter((s) => fromDbDate(s.date) === day);
  const dayTotal = sumNutrition(daySlots.map((s) => s.recipeId), byId);
  const warnings = dayTotal.kcal > 0 ? checkWho({ kcal: dayTotal.kcal, fatG: dayTotal.f }) : [];

  // Nguyên liệu cần cho các bữa chưa nấu trong ngày, gộp theo thực phẩm
  const need = new Map<number, { name: string; grams: number }>();
  for (const s of daySlots.filter((s) => !s.cooked)) {
    const r = await getRecipe(s.recipeId);
    if (!r) continue;
    for (const ing of r.ingredients) {
      const cur = need.get(ing.foodId) ?? { name: ing.name, grams: 0 };
      cur.grams += (ing.grams * s.servings) / r.servings;
      need.set(ing.foodId, cur);
    }
  }
  const needList = [...need.entries()]
    .map(([foodId, n]) => ({ foodId, ...n, have: stock.get(foodId) ?? 0 }))
    .sort((a, b) => Number(a.have >= a.grams) - Number(b.have >= b.grams) || b.grams - a.grams);
  const missingCount = needList.filter((n) => n.have < n.grams).length;

  const options = recipes.map((r) => ({ id: r.id, name: r.name, kcal: r.kcal }));
  const dayHref = (d: string) => `/planner?day=${d}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Thực đơn</h1>
          <p className="text-sm text-muted-foreground">
            Tuần {dayLabel(days[0])} – {dayLabel(days[6])}
          </p>
        </div>
        <nav className="flex gap-2 text-sm" aria-label="Chọn tuần">
          <Link href={dayHref(addDays(day, -7))} scroll={false} className="rounded-lg border px-2.5 py-1 hover:bg-muted">
            ← Tuần trước
          </Link>
          <Link href={dayHref(today)} scroll={false} className="rounded-lg border px-2.5 py-1 hover:bg-muted">
            Hôm nay
          </Link>
          <Link href={dayHref(addDays(day, 7))} scroll={false} className="rounded-lg border px-2.5 py-1 hover:bg-muted">
            Tuần sau →
          </Link>
        </nav>
      </div>

      {/* Dải 7 ngày: bấm để xem chi tiết ngày */}
      <nav aria-label="Chọn ngày" className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const ds = slots.filter((s) => fromDbDate(s.date) === d);
          const t = sumNutrition(ds.map((s) => s.recipeId), byId);
          const pct = targets ? Math.min(100, Math.round((t.kcal / targets.kcal) * 100)) : 0;
          const selected = d === day;
          const [name, date] = dayLabel(d).split(" ");
          return (
            <Link
              key={d}
              href={dayHref(d)}
              scroll={false}
              aria-current={selected ? "date" : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors ${
                selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="text-xs font-medium">{d === today ? "Hôm nay" : name}</span>
              <span className="text-lg font-semibold leading-none tabular-nums">{date.split("/")[0]}</span>
              <span className={`hidden text-[11px] tabular-nums sm:block ${selected ? "" : "text-muted-foreground"}`}>
                {ds.length ? `${t.kcal} kcal` : "Trống"}
              </span>
              <span
                className={`h-1 w-4/5 overflow-hidden rounded-full ${selected ? "bg-primary-foreground/30" : "bg-muted"}`}
                role="presentation"
              >
                <span
                  className={`block h-full rounded-full ${selected ? "bg-primary-foreground" : "bg-primary"}`}
                  style={{ width: `${targets ? pct : ds.length ? 100 : 0}%` }}
                />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Các bữa trong ngày */}
        <section aria-labelledby="day-title" className="flex flex-col gap-4">
          <div>
            <h2 id="day-title" className="text-xl font-semibold">
              {fullDayLabel(day)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {daySlots.length === 0
                ? "Chưa có món nào. Thêm món cho từng bữa bên dưới."
                : `${daySlots.length} món · ${daySlots.filter((s) => s.cooked).length} đã nấu`}
            </p>
          </div>

          <AiPanel
            key={day}
            day={day}
            dayLabel={dayLabel(day)}
            configured={aiConfigured()}
            remaining={Math.max(0, DAILY_AI_LIMIT - aiUsed)}
            canWeek={days[6] >= today}
          />

          {MEALS.map((meal) => {
            const mealSlots = daySlots.filter((s) => s.mealType === meal.type);
            const mealKcal = sumNutrition(mealSlots.map((s) => s.recipeId), byId).kcal;
            return (
              <Card key={meal.type} size="sm">
                <CardHeader>
                  <CardTitle>Bữa {meal.label.toLowerCase()}</CardTitle>
                  <CardDescription className="tabular-nums">
                    {mealSlots.length ? `${mealKcal} kcal/người` : "Chưa có món"}
                  </CardDescription>
                  <CardAction>
                    <AddSlotDialog
                      date={day}
                      dateLabel={dayLabel(day)}
                      mealType={meal.type}
                      mealLabel={meal.label}
                      defaultServings={household.servings}
                      recipes={options}
                    />
                  </CardAction>
                </CardHeader>
                {mealSlots.length > 0 && (
                  <CardContent>
                    <ul className="divide-y">
                      {mealSlots.map((s) => {
                        const r = byId.get(s.recipeId);
                        return (
                          <SlotItem
                            key={s.id}
                            id={s.id}
                            recipeId={s.recipeId}
                            name={r?.name ?? "(món đã ẩn)"}
                            kcal={r?.kcal ?? 0}
                            proteinG={r?.proteinG ?? 0}
                            fatG={r?.fatG ?? 0}
                            carbG={r?.carbG ?? 0}
                            servings={s.servings}
                            cooked={s.cooked}
                          />
                        );
                      })}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </section>

        {/* Tổng kết ngày */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle>Dinh dưỡng trong ngày</CardTitle>
              <CardDescription>
                {targets ? "Cho 1 người, so với nhu cầu của bạn" : "Điền hồ sơ sức khỏe để so với nhu cầu của bạn"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Bar label="Năng lượng" value={dayTotal.kcal} target={targets?.kcal} unit="kcal" />
              <Bar label="Chất đạm" value={dayTotal.p} target={targets?.proteinG} unit="g" />
              <Bar label="Chất béo" value={dayTotal.f} target={targets?.fatG} unit="g" />
              <Bar label="Bột đường" value={dayTotal.c} target={targets?.carbG} unit="g" />
              <Bar label="Chất xơ" value={dayTotal.fiber} unit="g" />
              <EnergySplit t={dayTotal} />
              {warnings.length > 0 && (
                <ul className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  {warnings.map((w) => (
                    <li key={w.rule}>⚠ {w.message} (khuyến nghị WHO)</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nguyên liệu cần</CardTitle>
              <CardDescription>
                {needList.length === 0
                  ? "Không có bữa nào chưa nấu."
                  : missingCount === 0
                    ? "Tủ lạnh có đủ cho các bữa chưa nấu."
                    : `Thiếu ${missingCount}/${needList.length} nguyên liệu cho các bữa chưa nấu.`}
              </CardDescription>
            </CardHeader>
            {needList.length > 0 && (
              <CardContent>
                <ul className="divide-y text-sm">
                  {needList.map((n) => (
                    <li key={n.foodId} className="flex justify-between gap-3 py-1.5">
                      <span>
                        {n.name} <span className="tabular-nums text-muted-foreground">· {Math.round(n.grams)} g</span>
                      </span>
                      <span className="shrink-0 text-xs">
                        {n.have >= n.grams ? (
                          <span className="text-green-700 dark:text-green-400">✓ Đủ</span>
                        ) : n.have > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">Thiếu {Math.round(n.grams - n.have)} g</span>
                        ) : (
                          <span className="text-muted-foreground">Chưa có</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function PlannerPage({ searchParams }: PageProps<"/planner">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Đang tải thực đơn...</p>}>
      <Planner searchParams={searchParams as Promise<{ day?: string; week?: string }>} />
    </Suspense>
  );
}
