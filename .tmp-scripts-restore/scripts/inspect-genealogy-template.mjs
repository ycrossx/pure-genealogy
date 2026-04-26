import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/ELSE/Downloads/族谱成员导入模板.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  tableMaxRows: 12,
  tableMaxCols: 20,
  tableMaxCellChars: 80,
  maxChars: 12000,
});

console.log(summary.ndjson);
