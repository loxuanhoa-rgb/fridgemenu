"use client";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addItem, type ItemState } from "./actions";

export function AddItemForm({ fridgeId, foods }: { fridgeId: string; foods: { id: number; nameVi: string }[] }) {
  const [state, action, pending] = useActionState<ItemState, FormData>(addItem, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Thêm xong thì xóa trắng form để nhập món tiếp theo
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="fridgeId" value={fridgeId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="foodName">Thực phẩm</Label>
        <Input id="foodName" name="foodName" list="food-options" placeholder="Gõ để tìm: rau muống..." required />
        <datalist id="food-options">
          {foods.map((f) => (
            <option key={f.id} value={f.nameVi} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="quantityG">Số gam</Label>
        <Input id="quantityG" name="quantityG" type="number" min="1" step="any" placeholder="500" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="unitLabel">Ghi chú</Label>
        <Input id="unitLabel" name="unitLabel" placeholder="1 bó" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="expiresAt">Hạn dùng</Label>
        <Input id="expiresAt" name="expiresAt" type="date" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Đang thêm..." : "Thêm"}
      </Button>
      {state.error && <p className="text-sm text-destructive sm:col-span-5">{state.error}</p>}
    </form>
  );
}
