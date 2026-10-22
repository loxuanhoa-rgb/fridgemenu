"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { markCooked, removeSlot } from "./actions";

export function SlotItem(props: {
  id: string;
  recipeId: string;
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  servings: number;
  cooked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function cook() {
    if (
      !confirm(
        `Đánh dấu đã nấu "${props.name}" (${props.servings} suất)?\nNguyên liệu sẽ được trừ khỏi tủ lạnh và không hoàn lại được.`
      )
    )
      return;
    startTransition(async () => {
      const r = await markCooked(props.id);
      if (r.error) setMessage(r.error);
      else if (r.shortages?.length)
        setMessage("Tủ thiếu: " + r.shortages.map((s) => `${s.name} ${s.missingG} g`).join(", "));
    });
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-3 ${pending ? "opacity-50" : ""}`}
      aria-busy={pending}
    >
      <div className="min-w-48 flex-1">
        <Link href={`/recipes/${props.recipeId}`} className="font-medium hover:underline">
          {props.name}
        </Link>
        <p className="text-xs text-muted-foreground tabular-nums">
          1 suất: {props.kcal} kcal · đạm {Math.round(props.proteinG)} g · béo {Math.round(props.fatG)} g · bột
          đường {Math.round(props.carbG)} g
        </p>
        {message && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{message}</p>}
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">{props.servings} suất</span>
      <div className="flex items-center gap-3 text-sm">
        {props.cooked ? (
          <span className="text-green-700 dark:text-green-400">✓ Đã nấu</span>
        ) : (
          <>
            <button type="button" onClick={cook} disabled={pending} className="font-medium text-primary hover:underline">
              Đã nấu
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => removeSlot(props.id))}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Xóa ${props.name}`}
            >
              Xóa
            </button>
          </>
        )}
      </div>
    </li>
  );
}
