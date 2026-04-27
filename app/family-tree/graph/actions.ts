"use server";

import { createClient } from "@/lib/supabase/server";

export interface FamilyMemberNode {
  id: number;
  name: string;
  generation: number | null;
  sibling_order: number | null;
  father_id: number | null;
  mom_id: number | null;
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
}

export type ParentRole = "father" | "mother" | "parent";
export type RelationKind = "biological" | "adoptive" | "step" | "guardian" | "unknown";

export interface FamilyRelationship {
  id?: number;
  child_id: number;
  parent_id: number;
  parent_role: ParentRole;
  relation_kind: RelationKind;
  is_primary: boolean;
  notes: string | null;
}

export interface SpouseRelationship {
  id?: number;
  member_id: number;
  spouse_id: number;
  relation_kind: "spouse" | "former" | "unknown";
  is_primary: boolean;
  notes: string | null;
}

export interface FamilyGraphDataset {
  members: FamilyMemberNode[];
  relationships: FamilyRelationship[];
  spouseRelationships: SpouseRelationship[];
  seedIds: number[];
  contextIds: number[];
}

export interface FetchGraphResult {
  data: FamilyGraphDataset;
  error: string | null;
}

export type FamilyGraphFilterRequest =
  | { mode: "name"; name: string; address: GraphAddressFilter; upGenerations: number; downGenerations: number }
  | { mode: "criteria"; surname: string; address: GraphAddressFilter; upGenerations: number; downGenerations: number }
  | { mode: "surname"; surname: string; address: GraphAddressFilter; downGenerations: number };

export interface GraphAddressFilter {
  province: string;
  city: string;
  district: string;
  town: string;
}

const MEMBER_GRAPH_FIELDS =
  "id, name, generation, sibling_order, father_id, mom_id, gender, official_position, is_alive, spouse, remarks, birthday, death_date, residence_place, residence_country, residence_country_code, residence_province, residence_province_code, residence_city, residence_city_code, residence_district, residence_district_code, residence_town, residence_town_code, residence_address";

const RELATIONSHIP_GRAPH_FIELDS =
  "id, child_id, parent_id, parent_role, relation_kind, is_primary, notes";

const SPOUSE_GRAPH_FIELDS =
  "id, member_id, spouse_id, relation_kind, is_primary, notes";

const EMPTY_GRAPH_DATASET: FamilyGraphDataset = {
  members: [],
  relationships: [],
  spouseRelationships: [],
  seedIds: [],
  contextIds: [],
};

export async function fetchAllFamilyMembers(): Promise<FetchGraphResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select(MEMBER_GRAPH_FIELDS)
    .order("generation", { ascending: true })
    .order("sibling_order", { ascending: true });

  if (error) {
    return { data: EMPTY_GRAPH_DATASET, error: error.message };
  }

  const members = (data || []) as FamilyMemberNode[];
  const fallbackRelationships = buildFallbackRelationships(members);

  const { data: relationshipData, error: relationshipError } = await supabase
    .from("family_member_relationships")
    .select(RELATIONSHIP_GRAPH_FIELDS);

  if (relationshipError) {
    return {
      data: {
        members,
        relationships: fallbackRelationships,
        spouseRelationships: [],
        seedIds: members.map((member) => member.id),
        contextIds: [],
      },
      error: null,
    };
  }

  return {
    data: {
      members,
      relationships: mergeRelationships(
        (relationshipData || []) as FamilyRelationship[],
        fallbackRelationships
      ),
      spouseRelationships: [],
      seedIds: members.map((member) => member.id),
      contextIds: [],
    },
    error: null,
  };
}

export async function fetchFamilyGraphByFilter(
  filter: FamilyGraphFilterRequest
): Promise<FetchGraphResult> {
  const supabase = await createClient();
  const candidatesResult = await fetchCandidateMembers(supabase, filter);

  if (candidatesResult.error) {
    return { data: EMPTY_GRAPH_DATASET, error: candidatesResult.error };
  }

  const candidates = candidatesResult.members;
  if (candidates.length === 0) {
    return { data: EMPTY_GRAPH_DATASET, error: null };
  }

  const upGenerations = filter.mode === "surname" ? 0 : filter.upGenerations;
  const downGenerations = filter.mode === "surname" ? 3 : filter.downGenerations;
  const graph = await fetchRelatedSubgraph(
    supabase,
    candidates,
    upGenerations,
    downGenerations
  );

  return { data: graph, error: null };
}

async function fetchCandidateMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filter: FamilyGraphFilterRequest
): Promise<{ members: FamilyMemberNode[]; error: string | null }> {
  let query = supabase
    .from("family_members")
    .select(MEMBER_GRAPH_FIELDS)
    .order("generation", { ascending: true })
    .order("sibling_order", { ascending: true });

  if (filter.mode === "name") {
    query = query.ilike("name", `%${escapeLikePattern(filter.name)}%`);
    query = applyAddressFilter(query, filter.address);
  } else if (filter.mode === "criteria") {
    query = query.ilike("name", `${escapeLikePattern(filter.surname)}%`);
    query = applyAddressFilter(query, filter.address);
  } else {
    query = query.ilike("name", `${escapeLikePattern(filter.surname)}%`);
    query = applyAddressFilter(query, filter.address);
  }

  const { data, error } = await query;
  if (error) {
    return { members: [], error: error.message };
  }

  let members = (data || []) as FamilyMemberNode[];
  if (filter.mode === "surname") {
    members = await filterRootMembers(supabase, members);
  }

  return { members, error: null };
}

function applyAddressFilter(query: any, address: GraphAddressFilter) {
  let nextQuery = query;
  if (address.province) nextQuery = nextQuery.eq("residence_province", address.province);
  if (address.city) nextQuery = nextQuery.eq("residence_city", address.city);
  if (address.district) nextQuery = nextQuery.eq("residence_district", address.district);
  if (address.town) nextQuery = nextQuery.eq("residence_town", address.town);
  return nextQuery;
}

async function filterRootMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  members: FamilyMemberNode[]
): Promise<FamilyMemberNode[]> {
  const noLegacyParentMembers = members.filter((member) => !member.father_id && !member.mom_id);
  const ids = noLegacyParentMembers.map((member) => member.id);
  if (ids.length === 0) return [];

  const relationships = await fetchRelationshipsByChildIds(supabase, ids);
  const childIdsWithParent = new Set(relationships.map((relationship) => relationship.child_id));
  return noLegacyParentMembers.filter((member) => !childIdsWithParent.has(member.id));
}

async function fetchRelatedSubgraph(
  supabase: Awaited<ReturnType<typeof createClient>>,
  candidates: FamilyMemberNode[],
  upGenerations: number,
  downGenerations: number
): Promise<FamilyGraphDataset> {
  const membersById = new Map<number, FamilyMemberNode>();
  const relationshipsByKey = new Map<string, FamilyRelationship>();
  const spouseRelationshipsByKey = new Map<string, SpouseRelationship>();
  const seedIds = candidates.map((member) => member.id);

  addMembers(membersById, candidates);

  let ancestorFrontier = new Set(candidates.map((member) => member.id));
  for (let depth = 0; depth < upGenerations && ancestorFrontier.size > 0; depth += 1) {
    const currentIds = Array.from(ancestorFrontier);
    const currentMembers = await ensureMembers(supabase, membersById, currentIds);
    const relationships = await fetchRelationshipsByChildIds(supabase, currentIds);
    addRelationships(relationshipsByKey, relationships);

    const fallbackRelationships = buildFallbackRelationships(currentMembers);
    addRelationships(relationshipsByKey, fallbackRelationships);

    const parentIds = uniqueIds([
      ...relationships.map((relationship) => relationship.parent_id),
      ...fallbackRelationships.map((relationship) => relationship.parent_id),
    ]);
    await ensureMembers(supabase, membersById, parentIds);
    ancestorFrontier = new Set(parentIds);
  }

  let descendantFrontier = new Set(candidates.map((member) => member.id));
  for (let depth = 0; depth < downGenerations && descendantFrontier.size > 0; depth += 1) {
    const currentIds = Array.from(descendantFrontier);
    const [relationshipChildren, fatherChildren, motherChildren] = await Promise.all([
      fetchRelationshipsByParentIds(supabase, currentIds),
      fetchMembersByParentColumn(supabase, "father_id", currentIds),
      fetchMembersByParentColumn(supabase, "mom_id", currentIds),
    ]);

    addRelationships(relationshipsByKey, relationshipChildren);
    addMembers(membersById, fatherChildren);
    addMembers(membersById, motherChildren);

    const fallbackRelationships = [
      ...fatherChildren.map((member) => buildFallbackRelationship(member, "father")),
      ...motherChildren.map((member) => buildFallbackRelationship(member, "mother")),
    ].filter((relationship): relationship is FamilyRelationship => Boolean(relationship));
    addRelationships(relationshipsByKey, fallbackRelationships);

    const childIds = uniqueIds([
      ...relationshipChildren.map((relationship) => relationship.child_id),
      ...fatherChildren.map((member) => member.id),
      ...motherChildren.map((member) => member.id),
    ]);
    await ensureMembers(supabase, membersById, childIds);
    descendantFrontier = new Set(childIds);
  }

  await completeGraphContext(supabase, membersById, relationshipsByKey, spouseRelationshipsByKey);

  const members = Array.from(membersById.values()).sort(compareMembers);
  const memberIds = new Set(members.map((member) => member.id));
  const relationships = Array.from(relationshipsByKey.values()).filter(
    (relationship) => memberIds.has(relationship.child_id) && memberIds.has(relationship.parent_id)
  );
  const spouseRelationships = Array.from(spouseRelationshipsByKey.values()).filter(
    (relationship) => memberIds.has(relationship.member_id) && memberIds.has(relationship.spouse_id)
  );
  const contextIds = members
    .map((member) => member.id)
    .filter((id) => !seedIds.includes(id));

  applyStructuredSpouseNames(members, spouseRelationships);

  return { members, relationships, spouseRelationships, seedIds, contextIds };
}

async function completeGraphContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  membersById: Map<number, FamilyMemberNode>,
  relationshipsByKey: Map<string, FamilyRelationship>,
  spouseRelationshipsByKey: Map<string, SpouseRelationship>
) {
  let memberIds = Array.from(membersById.keys());
  const spouseRelationships = await fetchSpouseRelationshipsByMemberIds(supabase, memberIds);
  addSpouseRelationships(spouseRelationshipsByKey, spouseRelationships);
  await ensureMembers(
    supabase,
    membersById,
    spouseRelationships.flatMap((relationship) => [relationship.member_id, relationship.spouse_id])
  );

  memberIds = Array.from(membersById.keys());
  const parentRelationships = await fetchRelationshipsByChildIds(supabase, memberIds);
  addRelationships(relationshipsByKey, parentRelationships);
  await ensureMembers(supabase, membersById, parentRelationships.map((relationship) => relationship.parent_id));

  const childIds = Array.from(
    new Set(Array.from(relationshipsByKey.values()).map((relationship) => relationship.child_id))
  );
  const allChildParentRelationships = await fetchRelationshipsByChildIds(supabase, childIds);
  addRelationships(relationshipsByKey, allChildParentRelationships);
  await ensureMembers(supabase, membersById, allChildParentRelationships.map((relationship) => relationship.parent_id));
}

async function ensureMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  membersById: Map<number, FamilyMemberNode>,
  ids: number[]
): Promise<FamilyMemberNode[]> {
  const missingIds = uniqueIds(ids).filter((id) => !membersById.has(id));
  if (missingIds.length > 0) {
    addMembers(membersById, await fetchMembersByIds(supabase, missingIds));
  }

  return uniqueIds(ids)
    .map((id) => membersById.get(id))
    .filter((member): member is FamilyMemberNode => Boolean(member));
}

async function fetchMembersByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: number[]
): Promise<FamilyMemberNode[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("family_members")
    .select(MEMBER_GRAPH_FIELDS)
    .in("id", ids);
  return (data || []) as FamilyMemberNode[];
}

async function fetchMembersByParentColumn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  column: "father_id" | "mom_id",
  parentIds: number[]
): Promise<FamilyMemberNode[]> {
  if (parentIds.length === 0) return [];
  const { data } = await supabase
    .from("family_members")
    .select(MEMBER_GRAPH_FIELDS)
    .in(column, parentIds);
  return (data || []) as FamilyMemberNode[];
}

async function fetchRelationshipsByChildIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childIds: number[]
): Promise<FamilyRelationship[]> {
  if (childIds.length === 0) return [];
  const { data, error } = await supabase
    .from("family_member_relationships")
    .select(RELATIONSHIP_GRAPH_FIELDS)
    .in("child_id", childIds);
  if (error) return [];
  return (data || []) as FamilyRelationship[];
}

async function fetchRelationshipsByParentIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentIds: number[]
): Promise<FamilyRelationship[]> {
  if (parentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("family_member_relationships")
    .select(RELATIONSHIP_GRAPH_FIELDS)
    .in("parent_id", parentIds);
  if (error) return [];
  return (data || []) as FamilyRelationship[];
}

async function fetchSpouseRelationshipsByMemberIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberIds: number[]
): Promise<SpouseRelationship[]> {
  if (memberIds.length === 0) return [];
  const ids = uniqueIds(memberIds);
  const { data, error } = await supabase
    .from("family_member_spouses")
    .select(SPOUSE_GRAPH_FIELDS)
    .or(`member_id.in.(${ids.join(",")}),spouse_id.in.(${ids.join(",")})`);
  if (error) return [];
  return (data || []) as SpouseRelationship[];
}

function addMembers(map: Map<number, FamilyMemberNode>, members: FamilyMemberNode[]) {
  members.forEach((member) => map.set(member.id, member));
}

function addRelationships(map: Map<string, FamilyRelationship>, relationships: FamilyRelationship[]) {
  relationships.forEach((relationship) => map.set(getRelationshipKey(relationship), relationship));
}

function addSpouseRelationships(map: Map<string, SpouseRelationship>, relationships: SpouseRelationship[]) {
  relationships.forEach((relationship) => map.set(getSpouseRelationshipKey(relationship), relationship));
}

function applyStructuredSpouseNames(members: FamilyMemberNode[], relationships: SpouseRelationship[]) {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const spouseNames = new Map<number, string[]>();

  relationships.forEach((relationship) => {
    const member = memberMap.get(relationship.member_id);
    const spouse = memberMap.get(relationship.spouse_id);
    if (!member || !spouse) return;

    spouseNames.set(member.id, [...(spouseNames.get(member.id) || []), spouse.name]);
    spouseNames.set(spouse.id, [...(spouseNames.get(spouse.id) || []), member.name]);
  });

  members.forEach((member) => {
    const names = spouseNames.get(member.id);
    if (names?.length) {
      member.spouse = Array.from(new Set(names)).join("、");
    }
  });
}

function buildFallbackRelationship(
  member: FamilyMemberNode,
  role: "father" | "mother"
): FamilyRelationship | null {
  const parentId = role === "father" ? member.father_id : member.mom_id;
  if (!parentId) return null;

  return {
    child_id: member.id,
    parent_id: parentId,
    parent_role: role,
    relation_kind: "biological",
    is_primary: true,
    notes: null,
  };
}

function compareMembers(a: FamilyMemberNode, b: FamilyMemberNode): number {
  return (
    (a.generation ?? Number.MAX_SAFE_INTEGER) - (b.generation ?? Number.MAX_SAFE_INTEGER) ||
    (a.sibling_order ?? Number.MAX_SAFE_INTEGER) - (b.sibling_order ?? Number.MAX_SAFE_INTEGER) ||
    a.id - b.id
  );
}

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function buildFallbackRelationships(members: FamilyMemberNode[]): FamilyRelationship[] {
  return members.flatMap((member) => {
    const relationships: FamilyRelationship[] = [];

    if (member.father_id) {
      relationships.push({
        child_id: member.id,
        parent_id: member.father_id,
        parent_role: "father",
        relation_kind: "biological",
        is_primary: true,
        notes: null,
      });
    }

    if (member.mom_id) {
      relationships.push({
        child_id: member.id,
        parent_id: member.mom_id,
        parent_role: "mother",
        relation_kind: "biological",
        is_primary: true,
        notes: null,
      });
    }

    return relationships;
  });
}

function mergeRelationships(
  relationships: FamilyRelationship[],
  fallbackRelationships: FamilyRelationship[]
): FamilyRelationship[] {
  const merged = new Map<string, FamilyRelationship>();

  relationships.forEach((relationship) => {
    merged.set(getRelationshipKey(relationship), relationship);
  });

  fallbackRelationships.forEach((relationship) => {
    if (!merged.has(getRelationshipKey(relationship))) {
      merged.set(getRelationshipKey(relationship), relationship);
    }
  });

  return Array.from(merged.values());
}

function getRelationshipKey(relationship: FamilyRelationship): string {
  return `${relationship.child_id}-${relationship.parent_id}-${relationship.parent_role}`;
}

function getSpouseRelationshipKey(relationship: SpouseRelationship): string {
  const lowId = Math.min(relationship.member_id, relationship.spouse_id);
  const highId = Math.max(relationship.member_id, relationship.spouse_id);
  return `${lowId}-${highId}`;
}
