import { Suspense } from "react";
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

  return (
    <>
      {expiring.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Có {expiring.length} món sắp hết hạn trong 3 ngày — nên nấu trước:</p>
          <p className="text-muted-foreground">{expiring.map((i) => i.name).join(", ")}</p>
        </div>
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
