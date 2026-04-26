"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  formatResidencePlace,
  hasStructuredResidence,
  normalizeResidenceAddress,
  validateRequiredResidence,
  type ResidenceAddressFields,
} from "./address-utils";

// Domain model used by family member list, dialogs, and related pages.
export interface FamilyMember {
  id: number;
  name: string;
  generation: number | null;
  sibling_order: number | null;
  father_id: number | null;
  father_name: string | null;
  mom_id: number | null;
  mom_name: string | null;
  gender: "男" | "女" | null;
  official_position: string | null;
  is_alive: boolean;
  spouse: string | null;
  remarks: string | null;
  birthday: string | null;
  death_date: string | null;
  residence_place: string | null;
  residence_country: string | null;
  residence_country_code: string | null;
  residence_province: string | null;
  residence_province_code: string | null;
  residence_city: string | null;
  residence_city_code: string | null;
  residence_district: string | null;
  residence_district_code: string | null;
  residence_town: string | null;
  residence_town_code: string | null;
  residence_address: string | null;
  updated_at: string;
}

export interface FetchMembersResult {
  data: FamilyMember[];
  count: number;
  error: string | null;
}

// Read family members with pagination + optional fuzzy search by name.
export async function fetchFamilyMembers(
  page: number = 1,
  pageSize: number = 50,
  searchQuery: string = ""
): Promise<FetchMembersResult> {
  const supabase = await createClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("family_members")
    .select("*", { count: "exact" });

  if (searchQuery.trim()) {
    query = query.ilike("name", `%${searchQuery.trim()}%`);
  }

  const { data, count, error } = await query
    .order("generation", { ascending: true })
    .order("sibling_order", { ascending: true })
    .range(from, to);

  if (error) {
    return { data: [], count: 0, error: error.message };
  }

  // 获取所有父亲/母亲 ID
  const parentIds = Array.from(
    new Set(
      (data || [])
        .flatMap((item) => [item.father_id, item.mom_id])
        .filter((id): id is number => id !== null)
    )
  );

  // 批量查询父亲/母亲姓名
  let parentMap: Record<number, string> = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("family_members")
      .select("id, name")
      .in("id", parentIds);

    if (parents) {
      parentMap = Object.fromEntries(parents.map((p) => [p.id, p.name]));
    }
  }

  // 转换数据格式，添加 father_name/mom_name
  const transformedData: FamilyMember[] = (data || []).map((item) => ({
    ...item,
    father_name: item.father_id ? parentMap[item.father_id] || null : null,
    mom_name: item.mom_id ? parentMap[item.mom_id] || null : null,
  }));

  return { data: transformedData, count: count || 0, error: null };
}

export interface CreateMemberInput extends ResidenceAddressFields {
  name: string;
  generation?: number | null;
  sibling_order?: number | null;
  father_id?: number | null;
  mom_id?: number | null;
  gender?: "男" | "女" | null;
  official_position?: string | null;
  is_alive?: boolean;
  spouse?: string | null;
  remarks?: string | null;
  birthday?: string | null;
  death_date?: string | null;
}

// Insert one member record.
export async function createFamilyMember(
  input: CreateMemberInput
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const validationError = validateRequiredResidence(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const residence = normalizeResidenceAddress(input);

  const { error } = await supabase.from("family_members").insert({
    name: input.name,
    generation: input.generation,
    sibling_order: input.sibling_order,
    father_id: input.father_id,
    mom_id: input.mom_id,
    gender: input.gender,
    official_position: input.official_position,
    is_alive: input.is_alive ?? true,
    spouse: input.spouse,
    remarks: input.remarks,
    birthday: input.birthday,
    death_date: input.death_date,
    residence_place: residence.residence_place,
    residence_country: residence.residence_country,
    residence_country_code: residence.residence_country_code,
    residence_province: residence.residence_province,
    residence_province_code: residence.residence_province_code,
    residence_city: residence.residence_city,
    residence_city_code: residence.residence_city_code,
    residence_district: residence.residence_district,
    residence_district_code: residence.residence_district_code,
    residence_town: residence.residence_town,
    residence_town_code: residence.residence_town_code,
    residence_address: residence.residence_address,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/family-tree", "layout");
  return { success: true, error: null };
}

export async function deleteFamilyMembers(
  ids: number[]
): Promise<{ success: boolean; error: string | null }> {
  if (ids.length === 0) {
    return { success: false, error: "没有选择要删除的成员" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("family_members")
    .delete()
    .in("id", ids);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/family-tree", "layout");
  return { success: true, error: null };
}

// 获取所有成员用于父亲选择下拉框
// Lightweight dataset used by parent selection comboboxes.
export async function fetchAllMembersForSelect(): Promise<
  { id: number; name: string; generation: number | null }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("id, name, generation")
    .order("generation", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching members for select:", error);
    return [];
  }

  return data || [];
}

// 获取所有女性成员用于母亲选择下拉框
export async function fetchFemaleMembersForSelect(): Promise<
  { id: number; name: string; generation: number | null }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("id, name, generation")
    .eq("gender", "女")
    .order("generation", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching female members for select:", error);
    return [];
  }

  return data || [];
}

export interface UpdateMemberInput extends CreateMemberInput {
  id: number;
}

// 根据 ID 获取单个成员
// Fetch one record for edit dialog and detail linking.
export async function fetchMemberById(
  id: number
): Promise<FamilyMember | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("Error fetching member by id:", error);
    return null;
  }

  // 如果有父亲/母亲 ID，查询姓名
  let father_name: string | null = null;
  let mom_name: string | null = null;
  const parentIds = [data.father_id, data.mom_id].filter(
    (parentId): parentId is number => parentId !== null
  );

  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("family_members")
      .select("id, name")
      .in("id", parentIds);

    const parentMap = Object.fromEntries(
      (parents || []).map((parent) => [parent.id, parent.name])
    );
    father_name = data.father_id ? parentMap[data.father_id] || null : null;
    mom_name = data.mom_id ? parentMap[data.mom_id] || null : null;
  }

  return {
    ...data,
    father_name,
    mom_name,
  } as FamilyMember;
}

// Update one member and refresh family-tree pages.
export async function updateFamilyMember(
  input: UpdateMemberInput
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  if (hasStructuredResidence(input)) {
    const validationError = validateRequiredResidence(input);
    if (validationError) {
      return { success: false, error: validationError };
    }
  }

  const residence = normalizeResidenceAddress({
    ...input,
    residence_place: hasStructuredResidence(input)
      ? formatResidencePlace(input)
      : input.residence_place,
  });

  const { error } = await supabase
    .from("family_members")
    .update({
      name: input.name,
      generation: input.generation,
      sibling_order: input.sibling_order,
      father_id: input.father_id,
      mom_id: input.mom_id,
      gender: input.gender,
      official_position: input.official_position,
      is_alive: input.is_alive ?? true,
      spouse: input.spouse,
      remarks: input.remarks,
      birthday: input.birthday,
      death_date: input.death_date,
      residence_place: residence.residence_place,
      residence_country: residence.residence_country,
      residence_country_code: residence.residence_country_code,
      residence_province: residence.residence_province,
      residence_province_code: residence.residence_province_code,
      residence_city: residence.residence_city,
      residence_city_code: residence.residence_city_code,
      residence_district: residence.residence_district,
      residence_district_code: residence.residence_district_code,
      residence_town: residence.residence_town,
      residence_town_code: residence.residence_town_code,
      residence_address: residence.residence_address,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/family-tree", "layout");
  return { success: true, error: null };
}

export interface ImportMemberInput extends ResidenceAddressFields {
  import_code: string;
  name: string;
  generation?: number | null;
  sibling_order?: number | null;
  father_code?: string | null;
  mother_code?: string | null;
  father_name?: string | null; // 仅用于预览/报告核对，不参与匹配
  mother_name?: string | null; // 仅用于预览/报告核对，不参与匹配
  father_relation_kind?: ImportRelationKind | null;
  mother_relation_kind?: ImportRelationKind | null;
  gender?: "男" | "女" | null;
  official_position?: string | null;
  is_alive?: boolean;
  spouse?: string | null;
  remarks?: string | null;
  birthday?: string | null;
}

export type ImportRelationKind = "biological" | "adoptive" | "step" | "guardian" | "unknown";

export interface ImportRelationReport {
  childCode: string;
  childName: string;
  childId: number;
  fatherCode: string | null;
  fatherName: string | null;
  fatherId: number | null;
  fatherRelationKind: ImportRelationKind | null;
  motherCode: string | null;
  motherName: string | null;
  motherId: number | null;
  motherRelationKind: ImportRelationKind | null;
  status: "success" | "warning" | "error";
  message?: string;
}

export interface BatchCreateResult {
  success: boolean;
  count: number;
  error: string | null;
  codeToId: Record<string, number>;
  resolvedRelations: ImportRelationReport[];
  unresolvedRelations: ImportRelationReport[];
  warnings: string[];
}

interface ImportCodeRecord {
  id: number;
  name: string;
  import_code: string;
}

interface RelationshipInsertRow {
  child_id: number;
  parent_id: number;
  parent_role: "father" | "mother";
  relation_kind: ImportRelationKind;
  is_primary: boolean;
  notes: string | null;
}

const RELATIONSHIP_UPSERT_BATCH_SIZE = 200;

function createImportFailure(
  error: string,
  extras: Partial<BatchCreateResult> = {}
): BatchCreateResult {
  return {
    success: false,
    count: 0,
    error,
    codeToId: {},
    resolvedRelations: [],
    unresolvedRelations: [],
    warnings: [],
    ...extras,
  };
}

function normalizeRelationKind(value?: string | null): ImportRelationKind {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "亲生" || normalized === "生物" || normalized === "biological") {
    return "biological";
  }
  if (normalized === "领养" || normalized === "收养" || normalized === "adoptive") {
    return "adoptive";
  }
  if (normalized === "继亲" || normalized === "继父" || normalized === "继母" || normalized === "step") {
    return "step";
  }
  if (normalized === "监护" || normalized === "guardian") {
    return "guardian";
  }
  return "unknown";
}

function getImportCodeMigrationMessage(errorMessage: string): string {
  if (errorMessage.toLowerCase().includes("import_code")) {
    return "数据库缺少 family_members.import_code 字段，请先执行 docs/family-member-import-code.sql";
  }
  return errorMessage;
}

function getRelationshipWriteErrorMessage(errorMessage: string): string {
  if (errorMessage.toLowerCase().includes("row-level security")) {
    return "关系表被 RLS 策略拦截，请在 Supabase SQL Editor 重新执行 docs/family-member-relationships.sql 中的 RLS policy 后再导入";
  }
  return errorMessage;
}

// Batch import rows by stable import_code. Parent codes must already exist in the database.
export async function batchCreateFamilyMembers(
  members: ImportMemberInput[]
): Promise<BatchCreateResult> {
  const supabase = await createClient();
  if (members.length === 0) {
    return createImportFailure("没有可导入的成员数据");
  }

  const normalizedMembers = members.map((member) => ({
    ...member,
    import_code: member.import_code?.trim() || "",
    father_code: member.father_code?.trim() || null,
    mother_code: member.mother_code?.trim() || null,
    father_name: member.father_name?.trim() || null,
    mother_name: member.mother_name?.trim() || null,
    father_relation_kind: normalizeRelationKind(member.father_relation_kind),
    mother_relation_kind: normalizeRelationKind(member.mother_relation_kind),
  }));

  const missingRequired = normalizedMembers.find(
    (member) => !member.import_code || !member.name?.trim() || !member.generation || !member.gender
  );
  if (missingRequired) {
    return createImportFailure(
      `${missingRequired.name || missingRequired.import_code || "成员"} 缺少人员编号、姓名、世代或性别`
    );
  }

  const invalidMember = members.find((member) => hasStructuredResidence(member) && validateRequiredResidence(member));
  if (invalidMember) {
    return createImportFailure(`${invalidMember.name || "成员"} 缺少国家、省份、城市或区县`);
  }

  const importCodes = normalizedMembers.map((member) => member.import_code);
  const duplicateCodes = importCodes.filter((code, index) => importCodes.indexOf(code) !== index);
  if (duplicateCodes.length > 0) {
    return createImportFailure(`人员编号重复：${Array.from(new Set(duplicateCodes)).join("、")}`);
  }

  const parentCodes = Array.from(
    new Set(
      normalizedMembers
        .flatMap((member) => [member.father_code, member.mother_code])
        .filter((code): code is string => Boolean(code))
    )
  );
  const selfParent = normalizedMembers.find(
    (member) => member.import_code === member.father_code || member.import_code === member.mother_code
  );
  if (selfParent) {
    return createImportFailure(`${selfParent.import_code} 的父母编号不能指向自己`);
  }

  const { data: existingDuplicates, error: duplicateError } = await supabase
    .from("family_members")
    .select("id, name, import_code")
    .in("import_code", importCodes);

  if (duplicateError) {
    return createImportFailure(getImportCodeMigrationMessage(duplicateError.message));
  }

  if (existingDuplicates && existingDuplicates.length > 0) {
    return createImportFailure(
      `以下人员编号已存在，当前导入仅支持新增：${existingDuplicates
        .map((member) => member.import_code)
        .join("、")}`
    );
  }

  const existingParentMap = new Map<string, ImportCodeRecord>();
  if (parentCodes.length > 0) {
    const { data: existingParents, error: parentError } = await supabase
      .from("family_members")
      .select("id, name, import_code")
      .in("import_code", parentCodes);

    if (parentError) {
      return createImportFailure(getImportCodeMigrationMessage(parentError.message));
    }

    (existingParents || []).forEach((member) => {
      existingParentMap.set(member.import_code, member as ImportCodeRecord);
    });
  }

  const preflightUnresolved = normalizedMembers
    .map((member): ImportRelationReport | null => {
      const missing = [member.father_code, member.mother_code].filter(
        (code): code is string => Boolean(code && !existingParentMap.has(code))
      );
      if (missing.length === 0) return null;
      return {
        childCode: member.import_code,
        childName: member.name,
        childId: 0,
        fatherCode: member.father_code,
        fatherName: member.father_name,
        fatherId: null,
        fatherRelationKind: member.father_code ? member.father_relation_kind : null,
        motherCode: member.mother_code,
        motherName: member.mother_name,
        motherId: null,
        motherRelationKind: member.mother_code ? member.mother_relation_kind : null,
        status: "error" as const,
        message: `父母编号尚未存在于数据库：${missing.join("、")}。请先导入父母批次，再导入本批次`,
      };
    })
    .filter((report): report is ImportRelationReport => report !== null);

  if (preflightUnresolved.length > 0) {
    return createImportFailure("存在尚未导入的父母编号，导入已取消。请按世代分批导入，先父母后子女", {
      unresolvedRelations: preflightUnresolved,
    });
  }

  if (parentCodes.length > 0) {
    const { error: relationshipPreflightError } = await supabase
      .from("family_member_relationships")
      .select("id")
      .limit(1);

    if (relationshipPreflightError) {
      return createImportFailure(
        `关系表不可用，请先执行 docs/family-member-relationships.sql：${relationshipPreflightError.message}`
      );
    }
  }

  const insertPayload = normalizedMembers.map((m) => {
    const father = m.father_code ? existingParentMap.get(m.father_code) || null : null;
    const mother = m.mother_code ? existingParentMap.get(m.mother_code) || null : null;
    const residence = normalizeResidenceAddress({
      ...m,
      residence_place: hasStructuredResidence(m) ? formatResidencePlace(m) : m.residence_place,
    });

    return {
      import_code: m.import_code,
      name: m.name,
      generation: m.generation,
      sibling_order: m.sibling_order,
      father_id: father?.id || null,
      mom_id: mother?.id || null,
      gender: m.gender,
      official_position: m.official_position,
      is_alive: m.is_alive ?? true,
      spouse: m.spouse,
      remarks: m.remarks,
      birthday: m.birthday,
      residence_place: residence.residence_place,
      residence_country: residence.residence_country,
      residence_country_code: residence.residence_country_code,
      residence_province: residence.residence_province,
      residence_province_code: residence.residence_province_code,
      residence_city: residence.residence_city,
      residence_city_code: residence.residence_city_code,
      residence_district: residence.residence_district,
      residence_district_code: residence.residence_district_code,
      residence_town: residence.residence_town,
      residence_town_code: residence.residence_town_code,
      residence_address: residence.residence_address,
    };
  });

  const { data: insertedMembers, error: insertError } = await supabase
    .from("family_members")
    .insert(insertPayload)
    .select("id, name, import_code");

  if (insertError) {
    return createImportFailure(getImportCodeMigrationMessage(insertError.message));
  }

  const insertedMap = new Map<string, ImportCodeRecord>();
  (insertedMembers || []).forEach((member) => {
    insertedMap.set(member.import_code, member as ImportCodeRecord);
  });

  const allCodeRecords = new Map<string, ImportCodeRecord>([
    ...Array.from(existingParentMap.entries()),
    ...Array.from(insertedMap.entries()),
  ]);
  const codeToId = Object.fromEntries(
    Array.from(allCodeRecords.entries()).map(([code, member]) => [code, member.id])
  );

  const relationshipRows: RelationshipInsertRow[] = [];
  const resolvedRelations: ImportRelationReport[] = [];
  const warnings: string[] = [];

  normalizedMembers.forEach((member) => {
    const child = insertedMap.get(member.import_code);
    if (!child) return;

    const father = member.father_code ? existingParentMap.get(member.father_code) || null : null;
    const mother = member.mother_code ? existingParentMap.get(member.mother_code) || null : null;

    if (father) {
      relationshipRows.push({
        child_id: child.id,
        parent_id: father.id,
        parent_role: "father",
        relation_kind: member.father_relation_kind || "biological",
        is_primary: true,
        notes: member.father_name ? `导入核对姓名：${member.father_name}` : null,
      });
    }

    if (mother) {
      relationshipRows.push({
        child_id: child.id,
        parent_id: mother.id,
        parent_role: "mother",
        relation_kind: member.mother_relation_kind || "biological",
        is_primary: true,
        notes: member.mother_name ? `导入核对姓名：${member.mother_name}` : null,
      });
    }

    if (!father && !mother) {
      warnings.push(`${member.import_code} ${member.name} 未填写父母编号，将作为根分支导入`);
    }

    resolvedRelations.push({
      childCode: member.import_code,
      childName: member.name,
      childId: child.id,
      fatherCode: member.father_code,
      fatherName: father?.name || member.father_name || null,
      fatherId: father?.id || null,
      fatherRelationKind: father ? member.father_relation_kind || "biological" : null,
      motherCode: member.mother_code,
      motherName: mother?.name || member.mother_name || null,
      motherId: mother?.id || null,
      motherRelationKind: mother ? member.mother_relation_kind || "biological" : null,
      status: !father && !mother ? "warning" : "success",
      message: !father && !mother ? "未填写父母编号，作为根分支导入" : undefined,
    });
  });

  if (relationshipRows.length > 0) {
    for (let index = 0; index < relationshipRows.length; index += RELATIONSHIP_UPSERT_BATCH_SIZE) {
      const batch = relationshipRows.slice(index, index + RELATIONSHIP_UPSERT_BATCH_SIZE);
      try {
        const { error: relationshipError } = await supabase
          .from("family_member_relationships")
          .upsert(batch, { onConflict: "child_id,parent_id,parent_role" });

        if (relationshipError) {
          return createImportFailure(`成员已创建，但关系表写入失败：${getRelationshipWriteErrorMessage(relationshipError.message)}`, {
            codeToId,
            resolvedRelations,
            warnings,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createImportFailure(`成员已创建，但关系表写入失败：${message}`, {
          codeToId,
          resolvedRelations,
          warnings,
        });
      }
    }
  }

  revalidatePath("/family-tree", "layout");
  return {
    success: true,
    count: normalizedMembers.length,
    error: null,
    codeToId,
    resolvedRelations,
    unresolvedRelations: [],
    warnings,
  };
}

// Query only timeline-required fields to reduce payload.
export async function fetchMembersForTimeline(): Promise<
  { id: number; name: string; birthday: string | null; death_date: string | null; generation: number | null }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("id, name, birthday, death_date, generation")
    .order("birthday", { ascending: true });

  if (error) {
    console.error("Error fetching timeline data:", error);
    return [];
  }

  return data || [];
}
