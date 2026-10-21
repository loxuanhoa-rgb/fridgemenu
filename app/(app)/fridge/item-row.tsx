"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteItem, updateItem, type ItemState } from "./actions";

export type Item = {
  id: string;
  name: string;
  group: string;
  quantityG: number;
  unitLabel: string | null;
  expiresAt: string | null; // "YYYY-MM-DD"
  daysLeft: number | null;
};

function ExpiryBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <span className="text-muted-foreground">Không ghi hạn</span>;
  if (daysLeft < 0) return <span className="font-medium text-destructive">Quá hạn {-daysLeft} ngày</span>;
  if (daysLeft === 0) return <span className="font-medium text-destructive">Hết hạn hôm nay</span>;
  if (daysLeft <= 3) return <span className="font-medium text-amber-600 dark:text-amber-400">Còn {daysLeft} ngày</span>;
  return <span className="text-muted-foreground">Còn {daysLeft} ngày</span>;
}

export function ItemRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ItemState, FormData>(async (prev, form) => {
    const result = await updateItem(prev, form);
    if (result.ok) setEditing(false); // lưu xong thì thoát chế độ sửa
    return result;
  }, {});

  if (editing) {
    return (
      <li className="py-3">
        <form action={action} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-center">
          <input type="hidden" name="id" value={item.id} />
          <span className="font-medium">{item.name}</span>
          <Input name="quantityG" type="number" min="1" step="any" defaultValue={item.quantityG} aria-label="Số gam" required />
          <Input name="unitLabel" defaultValue={item.unitLabel ?? ""} placeholder="Ghi chú" aria-label="Ghi chú" />
          <Input name="expiresAt" type="date" defaultValue={item.expiresAt ?? ""} aria-label="Hạn dùng" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Lưu
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Hủy
            </Button>
          </div>
          {state.error && <p className="text-sm text-destructive sm:col-span-5">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <div className="min-w-40 flex-1">
        <p className="font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.group}</p>
      </div>
      <p className="w-28 tabular-nums">
        {item.quantityG} g
        {item.unitLabel && <span className="text-muted-foreground"> · {item.unitLabel}</span>}
      </p>
      <p className="w-32 text-sm">
        <ExpiryBadge daysLeft={item.daysLeft} />
      </p>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Sửa
        </Button>
        <form action={deleteItem.bind(null, item.id)}>
          <Button type="submit" size="sm" variant="destructive">
            Xóa
          </Button>
        </form>
      </div>
    </li>
  );
}
