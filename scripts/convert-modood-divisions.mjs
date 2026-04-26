import fs from "node:fs/promises";
import path from "node:path";

const inputDir = process.argv[2] || "data/china-divisions";
const outputPath = process.argv[3] || path.join(inputDir, "divisions.json");

const readJson = async (filename) =>
  JSON.parse(await fs.readFile(path.join(inputDir, filename), "utf8"));

const provinces = await readJson("provinces.json");
const cities = await readJson("cities.json");
const areas = await readJson("areas.json");
const streets = await readJson("streets.json");

const provinceMap = new Map(provinces.map((item) => [String(item.code), item]));
const cityMap = new Map(cities.map((item) => [String(item.code), item]));
const areaMap = new Map(areas.map((item) => [String(item.code), item]));

const rows = [
  {
    code: "CN",
    name: "中国",
    level: "country",
    parent_code: null,
    full_name: "中国",
    sort_order: 1,
  },
];

for (const province of provinces) {
  const code = String(province.code);
  rows.push({
    code,
    name: province.name,
    level: "province",
    parent_code: "CN",
    full_name: `中国${province.name}`,
    sort_order: Number(code) || 0,
  });
}

for (const city of cities) {
  const code = String(city.code);
  const provinceCode = String(city.provinceCode || city.province || code.slice(0, 2));
  const province = provinceMap.get(provinceCode) || provinceMap.get(`${provinceCode}0000`);

  rows.push({
    code,
    name: city.name,
    level: "city",
    parent_code: province?.code ? String(province.code) : provinceCode,
    full_name: `中国${province?.name || ""}${city.name}`,
    sort_order: Number(code) || 0,
  });
}

for (const area of areas) {
  const code = String(area.code);
  const cityCode = String(area.cityCode || area.city || code.slice(0, 4));
  const city = cityMap.get(cityCode) || cityMap.get(`${cityCode}00`);
  const provinceCode = String(area.provinceCode || area.province || code.slice(0, 2));
  const province = provinceMap.get(provinceCode) || provinceMap.get(`${provinceCode}0000`);

  rows.push({
    code,
    name: area.name,
    level: "district",
    parent_code: city?.code ? String(city.code) : cityCode,
    full_name: `中国${province?.name || ""}${city?.name || ""}${area.name}`,
    sort_order: Number(code) || 0,
  });
}

for (const street of streets) {
  const code = String(street.code);
  const areaCode = String(street.areaCode || street.area || code.slice(0, 6));
  const area = areaMap.get(areaCode);
  const cityCode = String(street.cityCode || street.city || code.slice(0, 4));
  const city = cityMap.get(cityCode) || cityMap.get(`${cityCode}00`);
  const provinceCode = String(street.provinceCode || street.province || code.slice(0, 2));
  const province = provinceMap.get(provinceCode) || provinceMap.get(`${provinceCode}0000`);

  rows.push({
    code,
    name: street.name,
    level: "town",
    parent_code: area?.code ? String(area.code) : areaCode,
    full_name: `中国${province?.name || ""}${city?.name || ""}${area?.name || ""}${street.name}`,
    sort_order: Number(code) || 0,
  });
}

await fs.writeFile(outputPath, JSON.stringify(rows, null, 2), "utf8");

console.log(`Wrote ${rows.length} rows to ${outputPath}`);
