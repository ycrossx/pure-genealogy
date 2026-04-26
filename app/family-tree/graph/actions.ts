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

export interface FamilyGraphDataset {
  members: FamilyMemberNode[];
  relationships: FamilyRelationship[];
}

export interface FetchGraphResult {
  data: FamilyGraphDataset;
  error: string | null;
}

export async function fetchAllFamilyMembers(): Promise<FetchGraphResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("id, name, generation, sibling_order, father_id, mom_id, gender, official_position, is_alive, spouse, remarks, birthday, death_date, residence_place, residence_country, residence_country_code, residence_province, residence_province_code, residence_city, residence_city_code, residence_district, residence_district_code, residence_town, residence_town_code, residence_address")
    .order("generation", { ascending: true })
    .order("sibling_order", { ascending: true });

  if (error) {
    return { data: { members: [], relationships: [] }, error: error.message };
  }

  const members = (data || []) as FamilyMemberNode[];
  const fallbackRelationships = buildFallbackRelationships(members);

  const { data: relationshipData, error: relationshipError } = await supabase
    .from("family_member_relationships")
    .select("id, child_id, parent_id, parent_role, relation_kind, is_primary, notes");

  if (relationshipError) {
    return {
      data: { members, relationships: fallbackRelationships },
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
    },
    error: null,
  };
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
