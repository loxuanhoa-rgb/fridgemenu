// prisma/seed.ts — nạp dữ liệu mẫu từ prisma/data/*.csv
//   foods_vn.csv            tên,nhóm,kcal,đạm,béo,bột đường,xơ  (trên 100 g; "-" = không có số liệu)
//   recipes.csv             ten_mon,mo_ta,khau_phan,phut,vung_mien,anh,cac_buoc (các bước cách nhau bằng "|")
//   recipe_ingredients.csv  ten_mon,thuc_pham,gam,ghi_chu (thuc_pham trùng tên trong foods_vn.csv)
// Chạy: npx prisma db seed  — chạy lại nhiều lần được, không tạo trùng
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../lib/db";

// Thứ tự trùng với các cột số trong CSV
const NUTRIENTS = [
  { code: "ENERC_KCAL", nameVi: "Năng lượng", unit: "kcal" },
  { code: "PROCNT", nameVi: "Chất đạm (Protein)", unit: "g" },
  { code: "FAT", nameVi: "Chất béo (Lipid)", unit: "g" },
  { code: "CHOCDF", nameVi: "Bột đường (Glucid)", unit: "g" },
  { code: "FIBTG", nameVi: "Chất xơ", unit: "g" },
];

// Mã nhóm theo Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng, 2007)
const GROUPS: Record<string, string> = {
  "1": "Ngũ cốc",
  "2": "Khoai củ",
  "3": "Hạt, quả giàu đạm, béo",
  "4": "Rau, củ, quả dùng làm rau",
  "5": "Quả chín",
  "6": "Dầu, mỡ, bơ",
  "7": "Thịt",
  "8": "Thủy sản",
  "9": "Trứng",
  "10": "Sữa",
  "11": "Đồ hộp",
  "12": "Đồ ngọt",
  "13": "Gia vị, nước chấm",
  "14": "Nước giải khát, bia, rượu",
};

const REGIONS = ["Bắc", "Trung", "Nam"];

// Tách 1 dòng CSV, hỗ trợ ô trong ngoặc kép có dấu phẩy: "rượu vang (cồn 9,5 g)"
function parseLine(line: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// Đọc CSV (bỏ ký tự BOM, dòng tiêu đề và dòng trống)
function readCsv(path: string) {
  return readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map(parseLine);
}

async function seedFoods() {
  // 1. Danh mục chất dinh dưỡng
  const nutrientIds: number[] = [];
  for (const n of NUTRIENTS) {
    const row = await db.nutrient.upsert({ where: { code: n.code }, update: n, create: n });
    nutrientIds.push(row.id);
  }

  // 2. Đọc CSV thực phẩm
  const rows = readCsv("prisma/data/foods_vn.csv").map(([name, group, ...vals]) => ({
    name,
    group: GROUPS[group] ?? group,
    vals,
  }));

  // 3. Thêm thực phẩm mới; thực phẩm đã có (trùng tên) thì cập nhật nhóm
  const existing = await db.food.findMany({
    where: { source: "VN_FCT" },
    select: { id: true, nameVi: true, group: true },
  });
  const idByName = new Map(existing.map((f) => [f.nameVi, f.id]));
  for (const f of existing) {
    const row = rows.find((r) => r.name === f.nameVi);
    if (row && row.group !== f.group)
      await db.food.update({ where: { id: f.id }, data: { group: row.group } });
  }
  const created = await db.food.createManyAndReturn({
    data: rows
      .filter((r) => !idByName.has(r.name))
      .map((r) => ({ nameVi: r.name, group: r.group, source: "VN_FCT" as const })),
    select: { id: true, nameVi: true },
  });
  for (const f of created) idByName.set(f.nameVi, f.id);

  // 4. Ghi lại toàn bộ giá trị dinh dưỡng trên 100 g (bỏ qua ô "-")
  const values = rows.flatMap((r) =>
    r.vals.flatMap((v, i) => {
      const per100g = Number(v);
      if (v === "" || v === "-" || Number.isNaN(per100g)) return [];
      return [{ foodId: idByName.get(r.name)!, nutrientId: nutrientIds[i], per100g }];
    })
  );
  await db.$transaction([
    db.foodNutrient.deleteMany({ where: { foodId: { in: [...idByName.values()] } } }),
    db.foodNutrient.createMany({ data: values }),
  ]);

  console.log(
    `Thực phẩm: ${rows.length} (${created.length} mới), ${values.length} giá trị dinh dưỡng`
  );
  return idByName;
}

async function seedRecipes(foodIdByName: Map<string, number>) {
  const recipes = readCsv("prisma/data/recipes.csv").map(
    ([name, description, servings, minutes, region, imageUrl, steps]) => ({
      name,
      description: description || null,
      servings: Number(servings) || 1,
      minutes: minutes ? Number(minutes) : null,
      region: REGIONS.includes(region) ? region : null,
      imageUrl: imageUrl || null,
      steps: steps.split("|").map((s) => s.trim()).filter(Boolean),
    })
  );

  // Gom nguyên liệu theo tên món; ghi lại những dòng không khớp để báo lỗi
  const ingredientsByRecipe = new Map<string, { foodId: number; grams: number; note: string | null }[]>();
  const problems: string[] = [];
  for (const [recipeName, foodName, grams, note] of readCsv("prisma/data/recipe_ingredients.csv")) {
    const foodId = foodIdByName.get(foodName);
    if (!foodId) problems.push(`${recipeName}: không có thực phẩm "${foodName}" trong foods_vn.csv`);
    else if (!(Number(grams) > 0)) problems.push(`${recipeName}: "${foodName}" có số gam không hợp lệ (${grams})`);
    else {
      const list = ingredientsByRecipe.get(recipeName) ?? [];
      if (list.some((i) => i.foodId === foodId))
        problems.push(`${recipeName}: "${foodName}" bị lặp — hãy cộng gộp thành 1 dòng`);
      else list.push({ foodId, grams: Number(grams), note: note || null });
      ingredientsByRecipe.set(recipeName, list);
    }
  }
  for (const r of recipes)
    if (!ingredientsByRecipe.has(r.name)) problems.push(`${r.name}: chưa có nguyên liệu nào`);
  for (const name of ingredientsByRecipe.keys())
    if (!recipes.some((r) => r.name === name)) problems.push(`${name}: có nguyên liệu nhưng không có trong recipes.csv`);

  if (problems.length) {
    console.error(`Công thức: ${problems.length} lỗi, chưa nạp gì. Sửa CSV rồi chạy lại:`);
    problems.forEach((p) => console.error("  - " + p));
    process.exitCode = 1;
    return;
  }

  // Công thức hệ thống (createdById = null): trùng tên thì cập nhật, chưa có thì tạo mới
  const existing = await db.recipe.findMany({
    where: { createdById: null },
    select: { id: true, name: true },
  });
  const idByName = new Map(existing.map((r) => [r.name, r.id]));
  let createdCount = 0;

  for (const r of recipes) {
    const ingredients = ingredientsByRecipe.get(r.name)!;
    const id = idByName.get(r.name);
    if (id) {
      await db.$transaction([
        db.recipeIngredient.deleteMany({ where: { recipeId: id } }),
        db.recipe.update({
          where: { id },
          data: { ...r, ingredients: { create: ingredients } },
        }),
      ]);
    } else {
      await db.recipe.create({ data: { ...r, ingredients: { create: ingredients } } });
      createdCount++;
    }
  }

  const ingredientCount = [...ingredientsByRecipe.values()].reduce((n, l) => n + l.length, 0);
  console.log(`Công thức: ${recipes.length} (${createdCount} mới), ${ingredientCount} nguyên liệu`);
}

async function main() {
  const foodIdByName = await seedFoods();
  await seedRecipes(foodIdByName);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
