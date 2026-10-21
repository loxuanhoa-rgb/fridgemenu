import { getRecipeSummaries } from "@/lib/recipes";
import { RecipeBrowser } from "./recipe-browser";

// Dữ liệu công thức giống nhau cho mọi người dùng → trang được dựng sẵn (cache)
export default async function RecipesPage() {
  const recipes = await getRecipeSummaries();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Công thức</h1>
        <p className="text-muted-foreground">Dinh dưỡng được tính từ Bảng thành phần thực phẩm Việt Nam.</p>
      </div>
      <RecipeBrowser recipes={recipes} />
    </>
  );
}
