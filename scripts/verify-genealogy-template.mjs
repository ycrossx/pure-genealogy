import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "e:/workspace/pure-genealogy/scripts/族谱成员导入模板 (1).xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("成员导入模板");

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  tableMaxRows: 4,
  tableMaxCols: 12,
  maxChars: 5000,
});
console.log(summary.ndjson);

const lastRows = await workbook.inspect({
  kind: "table",
  range: "成员导入模板!A998:L1001",
  tableMaxRows: 4,
  tableMaxCols: 12,
  maxChars: 5000,
});
console.log(lastRows.ndjson);

const data = sheet.getRange("A2:L1001").values;
const counts = new Map();
for (const row of data) {
  counts.set(row[1], (counts.get(row[1]) ?? 0) + 1);
}

const rowsWithFather = data.filter((row) => row[3]).length;
const rowsWithMother = data.filter((row) => row[4]).length;
const rowsWithSpouse = data.filter((row) => row[8]).length;

console.log(JSON.stringify({
  rows: data.length,
  generationCounts: Object.fromEntries(counts),
  rowsWithFather,
  rowsWithMother,
  rowsWithSpouse,
  firstName: data[0][0],
  lastName: data.at(-1)[0],
}));
