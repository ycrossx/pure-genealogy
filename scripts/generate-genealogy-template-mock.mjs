import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const ROOT = process.cwd();
const TEMPLATE_PATH = path.join(ROOT, "data/china-divisions/族谱成员导入模板.xlsx");
const DIVISIONS_PATH = path.join(ROOT, "data/china-divisions/divisions.csv");
const OUTPUT_PATH = path.join(ROOT, "data/china-divisions/族谱成员导入模板-1000模拟数据.xlsx");
const BATCH_OUTPUT_DIR = path.join(ROOT, "data/china-divisions/族谱成员导入模板-分代批次");

const HEADERS = [
  "人员编号",
  "姓名",
  "世代",
  "排行",
  "父亲编号",
  "母亲编号",
  "父亲姓名",
  "母亲姓名",
  "父亲关系类型",
  "母亲关系类型",
  "性别",
  "官职",
  "是否在世",
  "配偶",
  "生平事迹",
  "生日",
  "国家",
  "省份",
  "城市",
  "区县",
  "乡镇",
  "详细地址",
];

const SURNAMES = ["刘", "王", "张", "李", "陈"];
const SURNAME_TARGETS = new Map([
  ["刘", 260],
  ["王", 220],
  ["张", 200],
  ["李", 170],
  ["陈", 150],
]);
const GENERATION_COUNTS = [50, 80, 120, 160, 190, 200, 200];
const PROVINCE_CODES = new Map([
  ["湖南省", "43"],
  ["四川省", "51"],
  ["贵州省", "52"],
]);
const DUPLICATE_GIVEN_NAMES = [
  "志强",
  "建华",
  "国庆",
  "明辉",
  "永刚",
  "文杰",
  "秀英",
  "丽华",
  "桂芳",
  "玉兰",
  "小梅",
  "春艳",
];
const UNIQUE_GIVEN_NAMES = [
  "承泽",
  "景明",
  "修远",
  "启航",
  "安邦",
  "怀瑾",
  "润生",
  "知新",
  "守成",
  "克勤",
  "嘉树",
  "若谷",
  "思齐",
  "庭轩",
  "云程",
  "清和",
  "映雪",
  "婉仪",
  "静姝",
  "雅琴",
  "秋月",
  "佩兰",
  "慧敏",
  "梦洁",
  "紫薇",
  "晓晴",
  "瑞雪",
  "佳宁",
  "书瑶",
  "语桐",
];

let seed = 20260426;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function padCode(value) {
  return `P${String(value).padStart(6, "0")}`;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function loadRegionPool() {
  const text = await fs.readFile(DIVISIONS_PATH, "utf8");
  const rows = text.trim().split(/\r?\n/).slice(1).map(parseCsvLine);
  const byParent = new Map();
  rows.forEach(([code, name, level, parentCode]) => {
    const values = byParent.get(parentCode) || [];
    values.push({ code, name, level, parentCode });
    byParent.set(parentCode, values);
  });

  const pool = [];
  for (const [province, provinceCode] of PROVINCE_CODES.entries()) {
    const cities = (byParent.get(provinceCode) || []).filter((item) => item.level === "city");
    cities.forEach((city) => {
      const districts = (byParent.get(city.code) || []).filter((item) => item.level === "district");
      districts.forEach((district) => {
        const towns = (byParent.get(district.code) || []).filter((item) => item.level === "town");
        towns.slice(0, 8).forEach((town) => {
          pool.push({ province, city: city.name, district: district.name, town: town.name });
        });
      });
    });
  }
  return pool;
}

function createSurnamePlan() {
  const plan = [];
  for (const [surname, count] of SURNAME_TARGETS.entries()) {
    for (let i = 0; i < count; i += 1) plan.push(surname);
  }
  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

function createNameQueues() {
  const queues = new Map();
  SURNAMES.forEach((surname) => {
    const duplicateNames = DUPLICATE_GIVEN_NAMES.map((given) => `${surname}${given}`);
    const queue = [];
    duplicateNames.forEach((name) => {
      for (let i = 0; i < 5; i += 1) queue.push(name);
    });
    queues.set(surname, queue);
  });
  return queues;
}

function buildMemberName(surname, index, nameQueues) {
  const queue = nameQueues.get(surname) || [];
  if (queue.length > 0) return queue.shift();
  return `${surname}${pick(UNIQUE_GIVEN_NAMES)}${String(index).padStart(3, "0")}`;
}

function chooseParentPair(males, females, generation, previousPairs) {
  const father = pick(males);
  let mother = pick(females);
  let guard = 0;
  while (mother && father && mother.name[0] === father.name[0] && random() < 0.75 && guard < 10) {
    mother = pick(females);
    guard += 1;
  }

  if (generation >= 3 && previousPairs.length > 0 && random() < 0.12) {
    const base = pick(previousPairs);
    return { father: base.father, mother: pick(females), scenario: "同父异母" };
  }

  if (generation >= 3 && previousPairs.length > 0 && random() < 0.12) {
    const base = pick(previousPairs);
    return { father: pick(males), mother: base.mother, scenario: "同母异父" };
  }

  return { father, mother, scenario: father?.name[0] !== mother?.name[0] ? "跨姓婚配" : "同姓婚配" };
}

function getBirthday(generation) {
  const year = 1888 + generation * 22 + Math.floor(random() * 9);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getAlive(generation) {
  if (generation <= 3) return "否";
  if (generation === 4) return random() < 0.35 ? "是" : "否";
  return "是";
}

function getOfficial(generation) {
  if (random() > 0.18) return "";
  return pick(["贡生", "乡绅", "教师", "医师", "商号掌柜", "村社理事", "工程师", "会计"]);
}

function buildMembers(regionPool) {
  const surnamePlan = createSurnamePlan();
  const nameQueues = createNameQueues();
  const members = [];
  const byGeneration = new Map();
  const spouseMap = new Map();
  let codeIndex = 1;
  let surnameIndex = 0;
  const scenarioCounts = { crossSurname: 0, sameFatherDiffMother: 0, sameMotherDiffFather: 0, adoptive: 0 };

  for (let generation = 1; generation <= GENERATION_COUNTS.length; generation += 1) {
    const count = GENERATION_COUNTS[generation - 1];
    const current = [];
    const previous = byGeneration.get(generation - 1) || [];
    const males = previous.filter((member) => member.gender === "男");
    const females = previous.filter((member) => member.gender === "女");
    const previousPairs = [];

    for (let order = 1; order <= count; order += 1) {
      const surname = surnamePlan[surnameIndex];
      surnameIndex += 1;
      const gender = order % 2 === 0 ? "女" : "男";
      const name = buildMemberName(surname, codeIndex, nameQueues);
      const code = padCode(codeIndex);
      const region = pick(regionPool);

      let father = null;
      let mother = null;
      let fatherRelation = "";
      let motherRelation = "";
      let scenario = "根分支";

      if (generation > 1) {
        const pair = chooseParentPair(males, females, generation, previousPairs);
        father = pair.father;
        mother = pair.mother;
        scenario = pair.scenario;
        previousPairs.push({ father, mother });
        if (father && mother && father.name[0] !== mother.name[0]) scenarioCounts.crossSurname += 1;
        if (scenario === "同父异母") scenarioCounts.sameFatherDiffMother += 1;
        if (scenario === "同母异父") scenarioCounts.sameMotherDiffFather += 1;
        fatherRelation = "亲生";
        motherRelation = "亲生";

        if (random() < 0.035) {
          fatherRelation = "领养";
          motherRelation = "领养";
          scenario = `${scenario}；领养`;
          scenarioCounts.adoptive += 1;
        }

        if (father && mother) {
          const fatherSpouses = spouseMap.get(father.code) || new Set();
          fatherSpouses.add(mother.name);
          spouseMap.set(father.code, fatherSpouses);
          const motherSpouses = spouseMap.get(mother.code) || new Set();
          motherSpouses.add(father.name);
          spouseMap.set(mother.code, motherSpouses);
        }
      }

      const member = {
        code,
        name,
        generation,
        order,
        fatherCode: father?.code || "",
        motherCode: mother?.code || "",
        fatherName: father?.name || "",
        motherName: mother?.name || "",
        fatherRelation,
        motherRelation,
        gender,
        official: getOfficial(generation),
        alive: getAlive(generation),
        spouse: "",
        remarks: `模拟测试数据；${scenario}；姓氏=${surname}；用于编号导入和重名筛选验证。`,
        birthday: getBirthday(generation),
        country: "中国",
        province: region.province,
        city: region.city,
        district: region.district,
        town: region.town,
        address: `${pick(["青石", "桂花", "长乐", "新桥", "双河", "团结"])}村${1 + Math.floor(random() * 18)}组${1 + Math.floor(random() * 99)}号`,
      };
      members.push(member);
      current.push(member);
      codeIndex += 1;
    }
    byGeneration.set(generation, current);
  }

  members.forEach((member) => {
    const spouses = spouseMap.get(member.code);
    if (spouses) member.spouse = Array.from(spouses).slice(0, 3).join("、");
  });

  return { members, scenarioCounts };
}

function toRows(members) {
  return members.map((member) => [
    member.code,
    member.name,
    member.generation,
    member.order,
    member.fatherCode,
    member.motherCode,
    member.fatherName,
    member.motherName,
    member.fatherRelation,
    member.motherRelation,
    member.gender,
    member.official,
    member.alive,
    member.spouse,
    member.remarks,
    member.birthday,
    member.country,
    member.province,
    member.city,
    member.district,
    member.town,
    member.address,
  ]);
}

function countBy(items, getKey) {
  const counts = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]), "zh-CN"));
}

async function main() {
  await fs.access(TEMPLATE_PATH);
  await fs.mkdir(BATCH_OUTPUT_DIR, { recursive: true });
  const regionPool = await loadRegionPool();
  const { members, scenarioCounts } = buildMembers(regionPool);
  const duplicateNameRows = members.filter((member) => members.some((other) => other !== member && other.name === member.name)).length;
  const rootRows = members.filter((member) => !member.fatherCode && !member.motherCode).length;

  const workbook = Workbook.create();
  const dataSheet = workbook.worksheets.add("成员导入模板");
  const data = [HEADERS, ...toRows(members)];
  dataSheet.getRangeByIndexes(0, 0, data.length, HEADERS.length).values = data;
  dataSheet.freezePanes.freezeRows(1);
  dataSheet.getRange("A1:V1").format = {
    fill: "#166534",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  dataSheet.getRange("A:V").format.columnWidth = 15;
  dataSheet.getRange("O:O").format.columnWidth = 42;
  dataSheet.getRange("V:V").format.columnWidth = 22;

  const statsSheet = workbook.worksheets.add("统计校验");
  const stats = [
    ["指标", "值", "说明"],
    ["总行数", members.length, "目标 1000"],
    ["世代数", new Set(members.map((member) => member.generation)).size, "目标 7 代"],
    ["无父母编号人数", rootRows, "目标 5%，即 50 人"],
    ["无父母编号占比", `${((rootRows / members.length) * 100).toFixed(1)}%`, "用于多根分支测试"],
    ["同名同姓参与人数", duplicateNameRows, "目标 30%，即 300 人"],
    ["同名同姓占比", `${((duplicateNameRows / members.length) * 100).toFixed(1)}%`, "用于搜索重名消歧测试"],
    ["跨姓婚配子女数", scenarioCounts.crossSurname, "父母姓氏不同"],
    ["同父异母样本数", scenarioCounts.sameFatherDiffMother, "共享父亲、母亲不同"],
    ["同母异父样本数", scenarioCounts.sameMotherDiffFather, "共享母亲、父亲不同"],
    ["领养样本数", scenarioCounts.adoptive, "父母关系类型为领养"],
    [],
    ["姓氏", "人数", ""],
    ...countBy(members, (member) => member.name[0]).map(([name, count]) => [name, count, ""]),
    [],
    ["省份", "人数", ""],
    ...countBy(members, (member) => member.province).map(([name, count]) => [name, count, ""]),
    [],
    ["世代", "人数", ""],
    ...countBy(members, (member) => `第${member.generation}代`).map(([name, count]) => [name, count, ""]),
  ];
  statsSheet.getRangeByIndexes(0, 0, stats.length, 3).values = stats;
  statsSheet.freezePanes.freezeRows(1);
  statsSheet.getRange("A1:C1").format = {
    fill: "#1D4ED8",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  statsSheet.getRange("A:C").format.columnWidth = 24;
  statsSheet.getRange("C:C").format.columnWidth = 38;

  const errors = [];
  if (members.length !== 1000) errors.push("总行数不是 1000");
  if (rootRows !== 50) errors.push(`无父母编号人数应为 50，实际 ${rootRows}`);
  if (duplicateNameRows !== 300) errors.push(`同名同姓参与人数应为 300，实际 ${duplicateNameRows}`);
  if (scenarioCounts.adoptive === 0) errors.push("缺少领养样本");
  if (scenarioCounts.sameFatherDiffMother === 0) errors.push("缺少同父异母样本");
  if (scenarioCounts.sameMotherDiffFather === 0) errors.push("缺少同母异父样本");
  if (errors.length > 0) throw new Error(errors.join("; "));

  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(OUTPUT_PATH);

  for (let generation = 1; generation <= GENERATION_COUNTS.length; generation += 1) {
    const generationMembers = members.filter((member) => member.generation === generation);
    const batchWorkbook = Workbook.create();
    const batchSheet = batchWorkbook.worksheets.add("成员导入模板");
    const batchData = [HEADERS, ...toRows(generationMembers)];
    batchSheet.getRangeByIndexes(0, 0, batchData.length, HEADERS.length).values = batchData;
    batchSheet.freezePanes.freezeRows(1);
    batchSheet.getRange("A1:V1").format = {
      fill: "#166534",
      font: { bold: true, color: "#FFFFFF" },
      horizontalAlignment: "center",
    };
    batchSheet.getRange("A:V").format.columnWidth = 15;
    batchSheet.getRange("O:O").format.columnWidth = 42;
    batchSheet.getRange("V:V").format.columnWidth = 22;
    const batchExported = await SpreadsheetFile.exportXlsx(batchWorkbook);
    await batchExported.save(path.join(BATCH_OUTPUT_DIR, `第${generation}代-导入批次.xlsx`));
  }

  const inspect = await workbook.inspect({
    kind: "table",
    range: "统计校验!A1:C24",
    include: "values",
    tableMaxRows: 24,
    tableMaxCols: 3,
  });
  console.log(inspect.ndjson);
  console.log(`saved=${OUTPUT_PATH}`);
  console.log(`batches=${BATCH_OUTPUT_DIR}`);
}

await main();
