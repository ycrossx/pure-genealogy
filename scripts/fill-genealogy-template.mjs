import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

// Auto-fill genealogy import workbook with deterministic mock data.
// Useful for import stress test and UI validation.

const inputPath = "C:/Users/ELSE/Downloads/族谱成员导入模板.xlsx";
const backupPath = "C:/Users/ELSE/Downloads/族谱成员导入模板.backup.xlsx";
const headers = ["姓名", "世代", "排行", "父亲姓名", "性别", "职务", "是否在世", "配偶", "备注", "生日", "居住地"];
const generationLabels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const generationCounts = [2, 4, 8, 16, 32, 64, 128, 180, 250, 316];
const generationNameChars = ["家", "永", "祖", "光", "耀", "寰", "锡", "汝", "治", "材"];
const givenChars = "岳秀璇达章旦祎悍绀兼祑祎祌璋粊妫祽稕锝囩ゥ鑰€娉藉紭杩滃織娓呭拰姝ｈ壇淇婅嫳鍗庣憺閿︽簮";
const spouseSurnames = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴", "徐", "孙", "马", "朱", "胡", "郭"];
const offices = ["", "族务理事", "族长", "祭祀", "禄生", "人", "寤生", "阅屾正", "商号铺长", "农事主管", "工匠", "教师", "医师", "工程", "会计", "村务委员"];
const residences = ["湖南长沙", "湖南岳阳", "湖南郴州", "湖南衡阳", "湖南湘西", "广东广州", "广东深圳", "广西桂林", "广东梅州", "四川成都", "重庆渝中", "江苏苏州", "浙江杭州", "安徽合肥", "河北石家庄", "陕西西安"];

function pad(num, width = 3) {
  return String(num).padStart(width, "0");
}

// Generate deterministic birthday by generation and row index.
function dateForGeneration(generationIndex, idx) {
  const year = 1760 + generationIndex * 25 + (idx % 9);
  const month = (idx % 12) + 1;
  const day = (idx % 27) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

// Build deterministic display name so repeated runs are reproducible.
function makeName(generationIndex, idx) {
  const genChar = generationNameChars[generationIndex];
  const second = givenChars[(idx + generationIndex * 7) % givenChars.length];
  return `第${genChar}${second}${pad(idx + 1)}`;
}

const rows = [];
const generations = [];

// Build generations in order, linking each member to a parent from previous generation.
for (let g = 0; g < generationCounts.length; g += 1) {
  const count = generationCounts[g];
  const previousGeneration = generations[g - 1] ?? [];
  const childRankByFather = new Map();
  const currentGeneration = [];

  for (let i = 0; i < count; i += 1) {
    const father = g === 0 ? "" : previousGeneration[Math.floor((i * previousGeneration.length) / count)].name;
    const rank = father ? (childRankByFather.get(father) ?? 0) + 1 : i + 1;
    if (father) {
      childRankByFather.set(father, rank);
    }

    const gender = (i + g) % 5 === 0 ? "女" : "男";
    const name = makeName(g, i);
    const spouseSurname = spouseSurnames[(i + g * 3) % spouseSurnames.length];
    const adultGeneration = g <= 8;
    const spouse = adultGeneration ? `${spouseSurname}${gender === "男" ? "妻" : "夫"}` : "";
    const isAlive = g >= 7 ? "是" : (g === 6 && i % 4 === 0 ? "是" : "否");
    const office = offices[(i + g * 2) % offices.length];
    const residence = residences[(i + g) % residences.length];
    const bio = `第${generationLabels[g]}代，排行${rank}，${father ? `父${father}。` : "始迁祖。" }测试导入数据，用于验证多子女排行与十代家族关系。`;
    const birthday = dateForGeneration(g, i);

    const row = [
      name,
      generationLabels[g],
      rank,
      father,
      gender,
      office,
      isAlive,
      spouse,
      bio,
      birthday,
      residence,
    ];

    rows.push(row);
    currentGeneration.push({ name, father, rank });
  }

  generations.push(currentGeneration);
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("成员导入模板");

// Clear old content before writing new headers and rows.
const used = sheet.getUsedRange();
used.clear({ applyTo: "contents" });

sheet.getRange("A1:K1").values = [headers];
sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;

for (const table of [...sheet.tables.items]) {
  table.delete();
}

// Recreate an Excel table so filters/styles work for imported data.
const lastRow = rows.length + 1;
const table = sheet.tables.add(`A1:K${lastRow}`, true, "FamilyMembersImportTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

sheet.freezePanes.freezeRows(1);
sheet.getRange("A1:K1").format = {
  fill: "#256D5B",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
sheet.getRange(`A2:K${lastRow}`).format.wrapText = false;
sheet.getRange("A:A").format.columnWidth = 16;
sheet.getRange("B:B").format.columnWidth = 10;
sheet.getRange("C:C").format.columnWidth = 8;
sheet.getRange("D:D").format.columnWidth = 16;
sheet.getRange("E:E").format.columnWidth = 8;
sheet.getRange("F:F").format.columnWidth = 14;
sheet.getRange("G:G").format.columnWidth = 10;
sheet.getRange("H:H").format.columnWidth = 12;
sheet.getRange("I:I").format.columnWidth = 54;
sheet.getRange("J:J").format.columnWidth = 14;
sheet.getRange("K:K").format.columnWidth = 14;

try {
  await fs.copyFile(inputPath, backupPath);
} catch {
  // Keep going if a backup already exists or the environment blocks the copy.
}

// Export workbook and overwrite source template, then print validation snapshot.
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(inputPath);

const check = await workbook.inspect({
  kind: "table",
  range: `成员导入模板!A1:K${lastRow}`,
  tableMaxRows: 6,
  tableMaxCols: 11,
  maxChars: 5000,
});
console.log(check.ndjson);
console.log(JSON.stringify({
  rows: rows.length,
  generations: Object.fromEntries(generationLabels.map((label, index) => [label, generationCounts[index]])),
  path: inputPath,
  backupPath,
}));


