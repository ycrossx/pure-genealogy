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
  name: string;
  generation?: number | null;
  sibling_order?: number | null;
  father_name?: string | null; // 导入时使用姓名匹配
  mother_name?: string | null; // 导入时使用姓名匹配
  gender?: "男" | "女" | null;
  official_position?: string | null;
  is_alive?: boolean;
  spouse?: string | null;
  remarks?: string | null;
  birthday?: string | null;
}

// Batch import rows and resolve parent names to parent ids.
export async function batchCreateFamilyMembers(
  members: ImportMemberInput[]
): Promise<{ success: boolean; count: number; error: string | null }> {
  const supabase = await createClient();
  const invalidMember = members.find((member) => hasStructuredResidence(member) && validateRequiredResidence(member));
  if (invalidMember) {
    return {
      success: false,
      count: 0,
      error: `${invalidMember.name || "成员"} 缺少国家、省份、城市或区县`,
    };
  }

  // 1. 提取所有不为空的父亲/母亲姓名
  const fatherNames = Array.from(
    new Set(
      members
        .map((m) => m.father_name?.trim())
        .filter((n): n is string => !!n)
    )
  );
  const motherNames = Array.from(
    new Set(
      members
        .map((m) => m.mother_name?.trim())
        .filter((n): n is string => !!n)
    )
  );

  // 2. 批量查找父亲/母亲 ID
  const fatherMap: Record<string, number> = {};
  if (fatherNames.length > 0) {
    const { data: foundFathers } = await supabase
      .from("family_members")
      .select("id, name")
      .in("name", fatherNames);

    if (foundFathers) {
      foundFathers.forEach((f) => {
        // 注意：如果有重名，这里会覆盖，简单起见取最后一个。
        // 实际场景可能需要更复杂的匹配逻辑（如结合世代）
        fatherMap[f.name] = f.id;
      });
    }
  }

  const motherMap: Record<string, number> = {};
  if (motherNames.length > 0) {
    const { data: foundMothers } = await supabase
      .from("family_members")
      .select("id, name")
      .in("name", motherNames)
      .eq("gender", "女");

    if (foundMothers) {
      foundMothers.forEach((m) => {
        motherMap[m.name] = m.id;
      });
    }
  }

  // 3. 构建插入数据
  const insertPayload = members.map((m) => {
    let father_id: number | null = null;
    if (m.father_name && fatherMap[m.father_name.trim()]) {
      father_id = fatherMap[m.father_name.trim()];
    }
    let mom_id: number | null = null;
    if (m.mother_name && motherMap[m.mother_name.trim()]) {
      mom_id = motherMap[m.mother_name.trim()];
    }

    const residence = normalizeResidenceAddress({
      ...m,
      residence_place: hasStructuredResidence(m) ? formatResidencePlace(m) : m.residence_place,
    });

    return {
      name: m.name,
      generation: m.generation,
      sibling_order: m.sibling_order,
      father_id: father_id,
      mom_id: mom_id,
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

  // 4. 批量插入
  const { error } = await supabase.from("family_members").insert(insertPayload);

  if (error) {
    return { success: false, count: 0, error: error.message };
  }

  revalidatePath("/family-tree", "layout");
  return { success: true, count: members.length, error: null };
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
