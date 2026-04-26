import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "e:/workspace/pure-genealogy/scripts/族谱成员导入模板 (1).xlsx";
const outputDir = "e:/workspace/pure-genealogy/outputs/family-members-mock";
const outputPath = path.join(outputDir, "族谱成员导入模板-1000条mock数据.xlsx");

const headers = [
  "姓名",
  "世代",
  "排行",
  "父亲姓名",
  "母亲姓名",
  "性别",
  "官职",
  "是否在世",
  "配偶",
  "生平事迹",
  "生日",
  "居住地",
];

const generationCounts = [2, 4, 8, 16, 32, 64, 128, 180, 220, 346];
const generationChars = ["承", "启", "世", "德", "维", "仁", "崇", "礼", "广", "泽"];
const givenChars = "文华志远明达俊彦子安修齐景和嘉树怀瑾思源正清怀仁成业守信立诚";
const spouseSurnames = ["王", "李", "张", "陈", "杨", "赵", "周", "吴", "黄", "徐", "孙", "朱", "胡", "郭", "何", "林"];
const femaleGivenNames = ["淑兰", "慧芳", "静仪", "婉清", "雅琴", "素珍", "美华", "秀英", "丽君", "佩珊", "若琳", "怡宁"];
const maleOffices = ["", "族务理事", "塾师", "商号掌柜", "农事主管", "医师", "工匠", "会计", "村务委员", "工程师", "教师", "企业职员"];
const femaleOffices = ["", "家务主持", "女学教师", "医护", "会计", "手工艺人", "社区委员", "企业职员"];
const residences = ["湖南长沙", "湖南岳阳", "湖南衡阳", "湖南湘潭", "广东广州", "广东深圳", "广西桂林", "四川成都", "重庆渝中", "江苏苏州", "浙江杭州", "陕西西安"];

function pad(num, width = 3) {
  return String(num).padStart(width, "0");
}

function dateString(year, seed) {
  const month = (seed % 12) + 1;
  const day = (seed % 27) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function maleName(generationIndex, index) {
  const genChar = generationChars[generationIndex];
  const given = givenChars[(generationIndex * 11 + index) % givenChars.length];
  return `刘${genChar}${given}${pad(index + 1)}`;
}

function spouseName(generationIndex, index) {
  const surname = spouseSurnames[(generationIndex * 5 + index) % spouseSurnames.length];
  const given = femaleGivenNames[(generationIndex * 7 + index) % femaleGivenNames.length];
  return `${surname}${given}${pad(generationIndex + 1, 2)}${pad(index + 1, 3)}`;
}

function isAlive(generationIndex, index) {
  if (generationIndex >= 7) return "是";
  if (generationIndex === 6) return index % 3 === 0 ? "是" : "否";
  return "否";
}

const rows = [];
const generations = [];

for (let g = 0; g < generationCounts.length; g += 1) {
  const pairCount = generationCounts[g] / 2;
  const previousPairs = generations[g - 1] ?? [];
  const siblingOrderByFather = new Map();
  const currentPairs = [];

  for (let i = 0; i < pairCount; i += 1) {
    const fatherPair = g === 0 ? null : previousPairs[Math.floor((i * previousPairs.length) / pairCount)];
    const fatherName = fatherPair?.maleName ?? "";
    const motherName = fatherPair?.femaleName ?? "";
    const siblingOrder = fatherName ? (siblingOrderByFather.get(fatherName) ?? 0) + 1 : i + 1;
    if (fatherName) {
      siblingOrderByFather.set(fatherName, siblingOrder);
    }

    const birthYear = 1750 + g * 28 + (i % 7);
    const husbandName = maleName(g, i);
    const wifeName = spouseName(g, i);
    const residence = residences[(g * 3 + i) % residences.length];
    const husbandOffice = maleOffices[(g + i) % maleOffices.length];
    const wifeOffice = femaleOffices[(g + i * 2) % femaleOffices.length];
    const alive = isAlive(g, i);

    rows.push([
      husbandName,
      g + 1,
      siblingOrder,
      fatherName,
      motherName,
      "男",
      husbandOffice,
      alive,
      wifeName,
      `第${g + 1}代男丁，排行${siblingOrder}。${fatherName ? `父${fatherName}，母${motherName}。` : "始迁祖。"}配偶${wifeName}，用于测试父亲、母亲、配偶与世代关系。`,
      dateString(birthYear, i),
      residence,
    ]);

    rows.push([
      wifeName,
      g + 1,
      "",
      "",
      "",
      "女",
      wifeOffice,
      alive,
      husbandName,
      `第${g + 1}代配偶，配偶${husbandName}。作为下一代母亲记录，用于测试 mom_id 解析和母系显示。`,
      dateString(birthYear + 2, i + 5),
      residence,
    ]);

    currentPairs.push({ maleName: husbandName, femaleName: wifeName });
  }

  generations.push(currentPairs);
}

if (rows.length !== 1000) {
  throw new Error(`Expected 1000 rows, generated ${rows.length}`);
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "sheet,table",
  tableMaxRows: 4,
  tableMaxCols: 12,
  maxChars: 4000,
});
console.log(summary.ndjson);

let sheet;
try {
  sheet = workbook.worksheets.getItem("成员导入模板");
} catch {
  sheet = workbook.worksheets.getItemAt(0);
}

const used = sheet.getUsedRange();
used.clear({ applyTo: "contents" });

sheet.getRange("A1:L1").values = [headers];
sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;

for (const table of [...sheet.tables.items]) {
  table.delete();
}

const lastRow = rows.length + 1;
const table = sheet.tables.add(`A1:L${lastRow}`, true, "FamilyMembersImportTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

sheet.freezePanes.freezeRows(1);
sheet.getRange("A1:L1").format = {
  fill: "#256D5B",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
sheet.getRange(`A2:L${lastRow}`).format.wrapText = false;
sheet.getRange("A:A").format.columnWidth = 18;
sheet.getRange("B:B").format.columnWidth = 8;
sheet.getRange("C:C").format.columnWidth = 8;
sheet.getRange("D:E").format.columnWidth = 18;
sheet.getRange("F:F").format.columnWidth = 8;
sheet.getRange("G:G").format.columnWidth = 14;
sheet.getRange("H:H").format.columnWidth = 10;
sheet.getRange("I:I").format.columnWidth = 18;
sheet.getRange("J:J").format.columnWidth = 64;
sheet.getRange("K:L").format.columnWidth = 14;

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(inputPath);
await fs.mkdir(outputDir, { recursive: true });
await output.save(outputPath);

const check = await workbook.inspect({
  kind: "table",
  range: `${sheet.name}!A1:L${lastRow}`,
  tableMaxRows: 8,
  tableMaxCols: 12,
  tableMaxCellChars: 80,
  maxChars: 8000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: sheet.name,
  range: "A1:L25",
  scale: 1,
  format: "png",
});
const previewBytes = new Uint8Array(await preview.arrayBuffer());
await fs.writeFile(path.join(outputDir, "preview.png"), previewBytes);

console.log(JSON.stringify({
  rows: rows.length,
  generations: Object.fromEntries(generationCounts.map((count, index) => [String(index + 1), count])),
  inputPath,
  outputPath,
}, null, 2));
