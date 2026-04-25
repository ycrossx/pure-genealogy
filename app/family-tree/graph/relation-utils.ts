import type {
  FamilyMemberNode,
  FamilyRelationship,
  ParentRole,
  RelationKind,
} from "./actions";

export type ParentRelationType = ParentRole;

export interface ParentRelation {
  parentId: number;
  childId: number;
  relationType: ParentRelationType;
  relationKind: RelationKind;
  isPrimary: boolean;
  notes: string | null;
}

export function getParentRelations(
  member: FamilyMemberNode,
  relationships?: FamilyRelationship[]
): ParentRelation[] {
  if (relationships) {
    return relationships
      .filter((relationship) => relationship.child_id === member.id)
      .map(toParentRelation);
  }

  const relations: ParentRelation[] = [];

  if (member.father_id) {
    relations.push({
      parentId: member.father_id,
      childId: member.id,
      relationType: "father",
      relationKind: "biological",
      isPrimary: true,
      notes: null,
    });
  }

  if (member.mom_id) {
    relations.push({
      parentId: member.mom_id,
      childId: member.id,
      relationType: "mother",
      relationKind: "biological",
      isPrimary: true,
      notes: null,
    });
  }

  return relations;
}

export function getParentIds(
  member: FamilyMemberNode,
  relationships?: FamilyRelationship[]
): number[] {
  return getParentRelations(member, relationships).map((relation) => relation.parentId);
}

export function buildChildrenMap(
  members: FamilyMemberNode[],
  relationships?: FamilyRelationship[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const memberIds = new Set(members.map((member) => member.id));
  const sourceRelationships = relationships || buildGraphEdges(members);

  sourceRelationships.forEach((relationship) => {
    if (!memberIds.has(relationship.child_id) && !relationships) return;
    const children = map.get(relationship.parent_id) || [];
    if (!children.includes(relationship.child_id)) {
      children.push(relationship.child_id);
    }
    map.set(relationship.parent_id, children);
  });

  return map;
}

export function buildGraphEdges(
  members: FamilyMemberNode[],
  relationships?: FamilyRelationship[]
): FamilyRelationship[] {
  if (relationships) {
    return relationships;
  }

  return members.flatMap((member) =>
    getParentRelations(member).map((relation) => ({
      child_id: relation.childId,
      parent_id: relation.parentId,
      parent_role: relation.relationType,
      relation_kind: relation.relationKind,
      is_primary: relation.isPrimary,
      notes: relation.notes,
    }))
  );
}

export function getRelationEdgeId(relation: ParentRelation): string {
  return `e-${relation.relationType}-${relation.relationKind}-${relation.parentId}-${relation.childId}`;
}

export function toParentRelation(relationship: FamilyRelationship): ParentRelation {
  return {
    parentId: relationship.parent_id,
    childId: relationship.child_id,
    relationType: relationship.parent_role,
    relationKind: relationship.relation_kind,
    isPrimary: relationship.is_primary,
    notes: relationship.notes,
  };
}
