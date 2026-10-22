"use client";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeVi } from "@/lib/text";
import { addSlot, type SlotState } from "./actions";

export type RecipeOption = { id: string; name: string; kcal: number };

export function AddSlotDialog(props: {
  date: string;
  dateLabel: string;
  mealType: string;
  mealLabel: string;
  defaultServings: number;
  recipes: RecipeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [state, action, pending] = useActionState<SlotState, FormData>(async (prev, form) => {
    const result = await addSlot(prev, form);
    if (result.ok) {
      setOpen(false);
      setRecipeId("");
      setQuery("");
    }
    return result;
  }, {});

  const shown = useMemo(() => {
    const q = normalizeVi(query);
    return props.recipes.filter((r) => !q || normalizeVi(r.name).includes(q));
  }, [props.recipes, query]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`Thêm món bữa ${props.mealLabel.toLowerCase()} ${props.dateLabel}`}
      >
        + Thêm món
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Bữa {props.mealLabel.toLowerCase()} · {props.dateLabel}
            </DialogTitle>
            <DialogDescription>Chọn món và số suất nấu.</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="date" value={props.date} />
            <input type="hidden" name="mealType" value={props.mealType} />
            <input type="hidden" name="recipeId" value={recipeId} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm món..."
              aria-label="Tìm món"
            />
            <ul className="max-h-64 overflow-y-auto rounded-lg border" role="listbox" aria-label="Danh sách món">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={recipeId === r.id}
                    onClick={() => setRecipeId(r.id)}
                    className={`flex w-full justify-between gap-2 px-3 py-2 text-left hover:bg-muted ${
                      recipeId === r.id ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{r.kcal} kcal</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-2 text-muted-foreground">Không có món phù hợp</li>}
            </ul>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`servings-${props.date}-${props.mealType}`}>Số suất</Label>
                <Input
                  id={`servings-${props.date}-${props.mealType}`}
                  name="servings"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={props.defaultServings}
                  className="w-24"
                  required
                />
              </div>
              <Button type="submit" disabled={pending || !recipeId} className="ml-auto">
                {pending ? "Đang thêm..." : "Thêm vào thực đơn"}
              </Button>
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
