import { Suspense } from "react";
import Link from "next/link";
import { buildContext } from "@/lib/suggest";
import { requireUser } from "@/lib/auth";
import { daysLeft, getFoodOptions, getFridgeItems, getUserFridge } from "@/lib/fridge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddItemForm } from "./add-item-form";
import { ItemRow, type Item } from "./item-row";

async function FridgeSection() {
  const user = await requireUser();
  const fridge = await getUserFridge(user.id);
  if (!fridge) return <p className="text-muted-foreground">Bạn chưa có tủ lạnh nào.</p>;

  const [rows, foods] = await Promise.all([getFridgeItems(fridge.id), getFoodOptions()]);
  const now = new Date();
  const items: Item[] = rows.map((r) => ({
    id: r.id,
    name: r.food.nameVi,
    group: r.food.group,
    quantityG: r.quantityG,
    unitLabel: r.unitLabel,
    expiresAt: r.expiresAt?.toISOString().slice(0, 10) ?? null,
    daysLeft: r.expiresAt ? daysLeft(r.expiresAt, now) : null,
  }));
  const expiring = items.filter((i) => i.daysLeft !== null && i.daysLeft <= 3);

  // Gợi ý không cần AI: món có nhiều nguyên liệu trong tủ / dùng đồ sắp hết hạn (cùng hàm chấm điểm với AI)
  const ctx = items.length ? await buildContext(user.id, fridge.householdId, fridge.id) : null;
  const cookable = (ctx?.candidates ?? []).filter((c) => c.coveragePct >= 30 || c.usesExpiring.length).slice(0, 4);

  return (
    <>
      {expiring.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Có {expiring.length} món sắp hết hạn trong 3 ngày — nên nấu trước:</p>
          <p className="text-muted-foreground">{expiring.map((i) => i.name).join(", ")}</p>
        </div>
      )}

      {cookable.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Có thể nấu từ tủ lạnh</CardTitle>
            <CardDescription>Món có nhiều nguyên liệu sẵn trong tủ hoặc dùng đồ sắp hết hạn</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {cookable.map((c) => (
                <li key={c.id}>
                  <Link href={`/recipes/${c.id}`} className="flex flex-col rounded-lg border p-3 text-sm hover:bg-muted">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Có sẵn {c.coveragePct}% nguyên liệu
                      {c.usesExpiring.length > 0 && ` · dùng ${c.usesExpiring.join(", ")} sắp hết hạn`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{fridge.name}</CardTitle>
          <CardDescription>Ghi số lượng theo gam để app tính dinh dưỡng chính xác.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AddItemForm fridgeId={fridge.id} foods={foods} />
          {items.length === 0 ? (
            <p className="text-muted-foreground">Tủ lạnh đang trống. Thêm món đầu tiên ở trên.</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function FridgePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Đang tải tủ lạnh...</p>}>
      <FridgeSection />
    </Suspense>
  );
}
