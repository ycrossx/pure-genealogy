"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Background,
  BackgroundVariant,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { toPng } from "html-to-image";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUpDown,
  Check,
  Download,
  Lock,
  Maximize,
  Minimize,
  MoreVertical,
  RotateCcw,
  Search,
  TriangleAlert,
  Unlock,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FamilyMemberNodeType, type FamilyNodeData } from "./family-node";
import { GenerationNodeType } from "./generation-node";
import { toChineseNum } from "./utils/chinese-num";
import { getBranchBaseColor, generateBranchColor, type HSLColor } from "./utils/colors";
import { FlowingEdge } from "./flowing-edge";
import type { FamilyGraphDataset, FamilyMemberNode, FamilyRelationship, RelationKind } from "./actions";
import {
  buildChildrenMap,
  getParentRelations,
  getRelationEdgeId,
  toParentRelation,
  type ParentRelation,
} from "./relation-utils";
import { MemberDetailDialog } from "../member-detail-dialog";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 120;
const FAMILY_NODE_WIDTH = 118;
const FAMILY_NODE_HEIGHT = 40;
const HORIZONTAL_GAP = 90;
const VERTICAL_GAP = 120;
const PICKER_PAGE_SIZE = 10;
const DEFAULT_COUNTRY = "中国";

interface FamilyTreeGraphProps {
  initialData: FamilyGraphDataset;
}

interface FamilyTreeGraphInnerProps {
  dataset: FamilyGraphDataset;
  onMemberClick?: (member: FamilyMemberNode) => void;
}

type AppliedFilter =
  | { mode: "name"; name: string; address: AddressFilter; upGenerations: number; downGenerations: number }
  | { mode: "criteria"; surname: string; address: AddressFilter; upGenerations: number; downGenerations: number }
  | { mode: "surname"; surname: string; downGenerations: number };

interface AddressOption {
  value: string;
  label: string;
  code?: string;
}

type AddressLevel = "province" | "city" | "district" | "town";

interface AddressFilter {
  province: string;
  city: string;
  district: string;
  town: string;
}

interface AddressSelection {
  provinceCode: string;
  provinceLabel: string;
  cityCode: string;
  cityLabel: string;
  districtCode: string;
  districtLabel: string;
  townCode: string;
  townLabel: string;
}

const emptyAddressSelection: AddressSelection = {
  provinceCode: "",
  provinceLabel: "",
  cityCode: "",
  cityLabel: "",
  districtCode: "",
  districtLabel: "",
  townCode: "",
  townLabel: "",
};

interface FamilyUnit {
  id: string;
  parentIds: number[];
  childIds: number[];
  relationKinds: RelationKind[];
  parents: FamilyUnitParent[];
  childrenCount: number;
  branchColor: string;
  label: string;
  description: string;
  isMultiPartnerBranch: boolean;
}

interface FamilyUnitParent {
  id: number;
  name: string;
  role: ParentRelation["relationType"];
}

interface FamilyUnitNodeData extends Record<string, unknown> {
  relationKinds: RelationKind[];
  parentIds: number[];
  childIds: number[];
  parents: FamilyUnitParent[];
  childrenCount: number;
  label: string;
  description: string;
  branchColor: string;
  isMultiPartnerBranch: boolean;
  collapsed?: boolean;
  hasChildren?: boolean;
  isPathHighlighted?: boolean;
  isDimmed?: boolean;
  onToggleCollapse?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
  onHoverFamilyUnit?: (id: string | null) => void;
}

const FamilyUnitNode = memo(function FamilyUnitNode({ id, data }: NodeProps<Node<FamilyUnitNodeData>>) {
  const hasAdoptive = data.relationKinds.includes("adoptive");
  const hasNonBiological = data.relationKinds.some((kind) => kind !== "biological");
  const handleToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      data.onToggleCollapse?.(id);
    },
    [data, id]
  );
  const handleOpenDetails = useCallback(() => {
    data.onOpenDetails?.(id);
  }, [data, id]);
  const handleMouseEnter = useCallback(() => {
    data.onHoverFamilyUnit?.(id);
  }, [data, id]);
  const handleMouseLeave = useCallback(() => {
    data.onHoverFamilyUnit?.(null);
  }, [data]);

  return (
    <button
      type="button"
      onClick={handleOpenDetails}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative flex h-10 w-[118px] items-center justify-center gap-1 rounded-full border bg-background px-3 text-xs shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        data.isDimmed && "opacity-25 grayscale",
        data.isPathHighlighted && "z-40 scale-105 ring-2 ring-amber-300/70",
        hasAdoptive
          ? "border-violet-400 bg-violet-50 dark:bg-violet-950"
          : hasNonBiological
            ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
            : data.isMultiPartnerBranch
              ? "border-[var(--family-branch-color)]"
              : "border-muted-foreground/30"
      )}
      style={{ "--family-branch-color": data.branchColor } as CSSProperties}
      title={data.description}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--family-branch-color)]" />
      <Users className="h-3.5 w-3.5 shrink-0 text-[var(--family-branch-color)]" />
      <span className="min-w-0 truncate font-medium">{data.label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{data.childrenCount}</span>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--family-branch-color)]" />
      {data.hasChildren && (
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "absolute -bottom-3 left-1/2 z-[60] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border shadow-md transition-all duration-200 hover:scale-125 active:scale-90",
            data.collapsed
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border bg-background hover:bg-muted"
          )}
          title={data.collapsed ? "展开后代" : "折叠后代"}
        >
          {data.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      )}
    </button>
  );
});

const nodeTypes: NodeTypes = {
  familyMember: FamilyMemberNodeType,
  generationLabel: GenerationNodeType,
  familyUnit: FamilyUnitNode,
};

const edgeTypes = {
  flowing: FlowingEdge,
};

async function fetchAddressOptions(
  level: AddressLevel,
  params: Record<string, string> = {}
): Promise<AddressOption[]> {
  const searchParams = new URLSearchParams({ level, ...params });
  const response = await fetch(`/api/address?${searchParams.toString()}`);
  if (!response.ok) return [];

  const data = (await response.json()) as { options?: AddressOption[] };
  return data.options || [];
}

function withSelectedOption(options: AddressOption[], selectedValue: string, selectedLabel: string): AddressOption[] {
  if (!selectedValue || options.some((option) => option.value === selectedValue)) {
    return options;
  }

  return [{ value: selectedValue, label: selectedLabel || selectedValue, code: selectedValue }, ...options];
}

function AddressSelect({
  value,
  placeholder,
  options,
  selectedLabel,
  disabled,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: AddressOption[];
  selectedLabel?: string;
  disabled?: boolean;
  onChange: (option: AddressOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectOptions = useMemo(
    () => withSelectedOption(options, value, selectedLabel || value),
    [options, selectedLabel, value]
  );
  const selectedOption = useMemo(
    () => selectOptions.find((option) => option.value === value) || null,
    [selectOptions, value]
  );
  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return selectOptions;

    return selectOptions.filter((option) => {
      const label = option.label.toLowerCase();
      const optionValue = option.value.toLowerCase();
      const code = option.code?.toLowerCase() || "";
      return label.includes(keyword) || optionValue.includes(keyword) || code.includes(keyword);
    });
  }, [query, selectOptions]);

  const selectOption = useCallback(
    (option: AddressOption | null) => {
      onChange(option);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-36 justify-between px-3 font-normal sm:w-44"
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[100] w-72 p-0 sm:w-80">
        <div className="border-b p-2">
          <div className="flex items-center rounded-md border px-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${placeholder}`}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {value && (
            <Button
              type="button"
              variant="ghost"
              className="mb-1 w-full justify-start font-normal text-muted-foreground"
              onClick={() => selectOption(null)}
            >
              清空
            </Button>
          )}
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              暂无可选项
            </div>
          ) : (
            filteredOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                title={option.label}
                className={cn(
                  "h-auto min-h-9 w-full justify-start gap-2 whitespace-normal py-2 text-left font-normal",
                  option.value === value && "bg-accent"
                )}
                onClick={() => selectOption(option)}
              >
                <Check className={cn("h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 break-words">{option.label}</span>
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getLayoutedElements(
  members: FamilyMemberNode[],
  relationships: FamilyRelationship[],
  collapsedIds: Set<string>,
  highlightedId: number | null,
  hoveredFamilyUnitId: string | null,
  onToggleCollapse?: (id: string) => void,
  onOpenFamilyDetails?: (id: string) => void,
  onHoverFamilyUnit?: (id: string | null) => void
): { nodes: Node[]; edges: Edge[] } {
  if (!members.length) {
    return { nodes: [], edges: [] };
  }

  const allFamilyUnits = buildFamilyUnits(members, relationships);
  const visibleMembers = applyCollapsedState(members, relationships, collapsedIds, allFamilyUnits);
  const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));
  const familyUnits = allFamilyUnits.filter((familyUnit) => {
    const hasVisibleParent = familyUnit.parentIds.some((parentId) => visibleMemberIds.has(parentId));
    const hasVisibleChild = familyUnit.childIds.some((childId) => visibleMemberIds.has(childId));
    return hasVisibleParent && (hasVisibleChild || collapsedIds.has(familyUnit.id));
  });
  const roots = visibleMembers.filter((member) =>
    getParentRelations(member, relationships).every((relation) => !visibleMemberIds.has(relation.parentId))
  );
  const rootGeneration = roots[0]?.generation || 1;
  const childrenMap = buildChildrenMap(visibleMembers, relationships);
  const memberBaseColorMap = buildBranchColorMap(roots, childrenMap);

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "TB",
    nodesep: HORIZONTAL_GAP,
    ranksep: VERTICAL_GAP,
  });

  visibleMembers.forEach((member) => {
    dagreGraph.setNode(String(member.id), {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  familyUnits.forEach((familyUnit) => {
    dagreGraph.setNode(familyUnit.id, {
      width: FAMILY_NODE_WIDTH,
      height: FAMILY_NODE_HEIGHT,
    });
  });

  const edges: Edge[] = [];

  familyUnits.forEach((familyUnit) => {
    familyUnit.parentIds.forEach((parentId) => {
      if (!visibleMemberIds.has(parentId)) return;
      dagreGraph.setEdge(String(parentId), familyUnit.id, { weight: 4 });
      edges.push({
        id: `e-parent-${parentId}-${familyUnit.id}`,
        source: String(parentId),
        target: familyUnit.id,
        type: "flowing",
        animated: false,
        style: {
          stroke: familyUnit.branchColor,
          strokeWidth: 1.5,
          opacity: 0.42,
        },
        data: {
          branchColor: familyUnit.branchColor,
        },
      });
    });

    familyUnit.childIds.forEach((childId) => {
      if (!visibleMemberIds.has(childId)) return;
      dagreGraph.setEdge(familyUnit.id, String(childId), { weight: 6 });
      const edgeStyle = getChildEdgeStyle(familyUnit.relationKinds, familyUnit.branchColor);
      edges.push({
        id: `e-family-${familyUnit.id}-${childId}`,
        source: familyUnit.id,
        target: String(childId),
        type: "flowing",
        animated: false,
        style: edgeStyle,
        data: {
          relationKind: familyUnit.relationKinds.join(","),
          branchColor: familyUnit.branchColor,
        },
      });
    });
  });

  dagre.layout(dagreGraph);

  const parentFamilyCounts = countParentFamilyUnits(familyUnits);
  spreadMultiPartnerFamilyUnits(dagreGraph, familyUnits, parentFamilyCounts);
  familyUnits.forEach((familyUnit) => {
    if (familyUnit.parentIds.length !== 2) return;
    const [firstParentId, secondParentId] = familyUnit.parentIds;
    if ((parentFamilyCounts.get(firstParentId) || 0) > 1 || (parentFamilyCounts.get(secondParentId) || 0) > 1) {
      return;
    }

    const familyPosition = dagreGraph.node(familyUnit.id);
    const firstParent = dagreGraph.node(String(firstParentId));
    const secondParent = dagreGraph.node(String(secondParentId));
    if (!familyPosition || !firstParent || !secondParent) return;

    const parentY = Math.min(firstParent.y, secondParent.y);
    firstParent.x = familyPosition.x - NODE_WIDTH / 2 - 16;
    secondParent.x = familyPosition.x + NODE_WIDTH / 2 + 16;
    firstParent.y = parentY;
    secondParent.y = parentY;
  });

  let minX = Infinity;
  const generationYMap = new Map<number, { totalY: number; count: number }>();

  const memberNodes: Node[] = visibleMembers.map((member) => {
    const nodeWithPosition = dagreGraph.node(String(member.id));
    const hasChildren = (childrenMap.get(member.id)?.length || 0) > 0;
    const x = nodeWithPosition.x - NODE_WIDTH / 2;
    const y = nodeWithPosition.y - NODE_HEIGHT / 2;

    minX = Math.min(minX, x);

    if (member.generation) {
      const current = generationYMap.get(member.generation) || { totalY: 0, count: 0 };
      generationYMap.set(member.generation, {
        totalY: current.totalY + nodeWithPosition.y,
        count: current.count + 1,
      });
    }

    const baseColor = memberBaseColorMap.get(member.id);
    const genOffset = (member.generation || rootGeneration) - (rootGeneration + 1);
    const familyColor = findPrimaryChildFamilyColor(member.id, familyUnits);
    const nodeColor = familyColor || (baseColor ? generateBranchColor(baseColor, Math.max(0, genOffset)) : undefined);
    const nodeData: FamilyNodeData = {
      ...member,
      isHighlighted: member.id === highlightedId,
      hasChildren,
      branchColor: nodeColor,
    };

    return {
      id: String(member.id),
      type: "familyMember",
      position: { x, y },
      data: nodeData,
    };
  });

  const familyNodes: Node[] = familyUnits.map((familyUnit) => {
    const position = dagreGraph.node(familyUnit.id);
    return {
      id: familyUnit.id,
      type: "familyUnit",
      position: {
        x: position.x - FAMILY_NODE_WIDTH / 2,
        y: position.y - FAMILY_NODE_HEIGHT / 2,
      },
      data: {
        relationKinds: familyUnit.relationKinds,
        parentIds: familyUnit.parentIds,
        childIds: familyUnit.childIds,
        parents: familyUnit.parents,
        childrenCount: familyUnit.childrenCount,
        label: familyUnit.label,
        description: familyUnit.description,
        branchColor: familyUnit.branchColor,
        isMultiPartnerBranch: familyUnit.isMultiPartnerBranch,
        collapsed: collapsedIds.has(familyUnit.id),
        hasChildren: familyUnit.childIds.length > 0,
        onToggleCollapse,
        onOpenDetails: onOpenFamilyDetails,
        onHoverFamilyUnit,
        isPathHighlighted: hoveredFamilyUnitId === familyUnit.id,
      },
      draggable: false,
      selectable: false,
    };
  });

  const generationNodes: Node[] = [];
  const labelX = Number.isFinite(minX) ? minX - 140 : -140;
  generationYMap.forEach(({ totalY, count }, generation) => {
    generationNodes.push({
      id: `gen-label-${generation}`,
      type: "generationLabel",
      position: { x: labelX, y: totalY / count - 40 },
      data: {
        generation,
        label: `第${toChineseNum(generation)}世`,
      },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });
  });

  return { nodes: [...memberNodes, ...familyNodes, ...generationNodes], edges };
}

const FamilyTreeGraphInner = memo(function FamilyTreeGraphInner({
  dataset,
  onMemberClick,
}: FamilyTreeGraphInnerProps) {
  const reactFlowInstance = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [userEmail, setUserEmail] = useState("");
  const [surnameInput, setSurnameInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [upGenerationsInput, setUpGenerationsInput] = useState("2");
  const [downGenerationsInput, setDownGenerationsInput] = useState("3");
  const [addressSelection, setAddressSelection] = useState<AddressSelection>(emptyAddressSelection);
  const [provinceOptions, setProvinceOptions] = useState<AddressOption[]>([]);
  const [cityOptions, setCityOptions] = useState<AddressOption[]>([]);
  const [districtOptions, setDistrictOptions] = useState<AddressOption[]>([]);
  const [townOptions, setTownOptions] = useState<AddressOption[]>([]);
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter | null>(null);
  const [filterWarning, setFilterWarning] = useState("");
  const [selectedCenterId, setSelectedCenterId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPage, setPickerPage] = useState(1);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [highlightedPathIds, setHighlightedPathIds] = useState<Set<string>>(new Set());
  const [hoveredFamilyUnitId, setHoveredFamilyUnitId] = useState<string | null>(null);
  const [selectedFamilyUnitId, setSelectedFamilyUnitId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDraggable, setIsDraggable] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const members = dataset.members;
  const relationships = dataset.relationships;

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchAddressOptions("province", { country: DEFAULT_COUNTRY }).then((options) => {
      if (!ignore) setProvinceOptions(options);
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!addressSelection.provinceCode) {
      setCityOptions([]);
      return;
    }

    let ignore = false;
    fetchAddressOptions("city", {
      country: DEFAULT_COUNTRY,
      province: addressSelection.provinceLabel,
      parentCode: addressSelection.provinceCode,
    }).then((options) => {
      if (!ignore) setCityOptions(options);
    });

    return () => {
      ignore = true;
    };
  }, [addressSelection.provinceCode, addressSelection.provinceLabel]);

  useEffect(() => {
    if (!addressSelection.cityCode) {
      setDistrictOptions([]);
      return;
    }

    let ignore = false;
    fetchAddressOptions("district", {
      country: DEFAULT_COUNTRY,
      province: addressSelection.provinceLabel,
      city: addressSelection.cityLabel,
      parentCode: addressSelection.cityCode,
    }).then((options) => {
      if (!ignore) setDistrictOptions(options);
    });

    return () => {
      ignore = true;
    };
  }, [addressSelection.cityCode, addressSelection.cityLabel, addressSelection.provinceLabel]);

  useEffect(() => {
    if (!addressSelection.districtCode) {
      setTownOptions([]);
      return;
    }

    let ignore = false;
    fetchAddressOptions("town", {
      country: DEFAULT_COUNTRY,
      province: addressSelection.provinceLabel,
      city: addressSelection.cityLabel,
      district: addressSelection.districtLabel,
      parentCode: addressSelection.districtCode,
    }).then((options) => {
      if (!ignore) setTownOptions(options);
    });

    return () => {
      ignore = true;
    };
  }, [
    addressSelection.cityLabel,
    addressSelection.districtCode,
    addressSelection.districtLabel,
    addressSelection.provinceLabel,
  ]);

  const selectedAddressFilter = useMemo<AddressFilter>(
    () => ({
      province: addressSelection.provinceLabel,
      city: addressSelection.cityLabel,
      district: addressSelection.districtLabel,
      town: addressSelection.townLabel,
    }),
    [
      addressSelection.cityLabel,
      addressSelection.districtLabel,
      addressSelection.provinceLabel,
      addressSelection.townLabel,
    ]
  );

  const candidateMembers = useMemo(
    () => getFilterCandidates(appliedFilter, members, relationships),
    [appliedFilter, members, relationships]
  );

  useEffect(() => {
    if (!appliedFilter || candidateMembers.length === 0) {
      setSelectedCenterId(null);
      setHighlightedId(null);
      return;
    }

    setSelectedCenterId((currentId) => {
      if (currentId && candidateMembers.some((member) => member.id === currentId)) {
        return currentId;
      }
      return candidateMembers[0].id;
    });
  }, [appliedFilter, candidateMembers]);

  useEffect(() => {
    setHighlightedId(selectedCenterId);
  }, [selectedCenterId]);

  const filteredMembers = useMemo(() => {
    if (!appliedFilter || !selectedCenterId) return [];
    return getVisibleMembers(appliedFilter, selectedCenterId, members, relationships);
  }, [appliedFilter, selectedCenterId, members, relationships]);

  const filteredMemberIds = useMemo(
    () => new Set(filteredMembers.map((member) => member.id)),
    [filteredMembers]
  );

  const filteredRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          filteredMemberIds.has(relationship.child_id) && filteredMemberIds.has(relationship.parent_id)
      ),
    [relationships, filteredMemberIds]
  );

  const childrenMap = useMemo(
    () => buildChildrenMap(filteredMembers, filteredRelationships),
    [filteredMembers, filteredRelationships]
  );

  useEffect(() => {
    if (!highlightedId || filteredMembers.length === 0) {
      setHighlightedPathIds(new Set());
      return;
    }

    const pathSet = new Set<string>();
    const memberMap = new Map(filteredMembers.map((member) => [member.id, member]));
    const ancestorQueue = [highlightedId];
    const visitedAncestors = new Set<number>();

    pathSet.add(String(highlightedId));

    while (ancestorQueue.length > 0) {
      const currentId = ancestorQueue.shift()!;
      if (visitedAncestors.has(currentId)) continue;
      visitedAncestors.add(currentId);

      const member = memberMap.get(currentId);
      if (!member) continue;

      getParentRelations(member, filteredRelationships).forEach((relation) => {
        if (!memberMap.has(relation.parentId)) return;
        pathSet.add(String(relation.parentId));
        pathSet.add(getRelationEdgeId(relation));
        ancestorQueue.push(relation.parentId);
      });
    }

    const descendantQueue = [highlightedId];
    const visitedDescendants = new Set<number>();
    while (descendantQueue.length > 0) {
      const parentId = descendantQueue.shift()!;
      if (visitedDescendants.has(parentId)) continue;
      visitedDescendants.add(parentId);

      (childrenMap.get(parentId) || []).forEach((childId) => {
        pathSet.add(String(childId));
        const child = memberMap.get(childId);
        if (child) {
          getParentRelations(child, filteredRelationships)
            .filter((relation) => relation.parentId === parentId)
            .forEach((relation) => pathSet.add(getRelationEdgeId(relation)));
        }
        descendantQueue.push(childId);
      });
    }

    setHighlightedPathIds(pathSet);
  }, [highlightedId, filteredMembers, filteredRelationships, childrenMap]);

  const familyUnitsForDetails = useMemo(
    () => buildFamilyUnits(filteredMembers, filteredRelationships),
    [filteredMembers, filteredRelationships]
  );

  const hoveredFamilyPathIds = useMemo(() => {
    if (!hoveredFamilyUnitId) return new Set<string>();

    const familyUnit = familyUnitsForDetails.find((unit) => unit.id === hoveredFamilyUnitId);
    if (!familyUnit) return new Set<string>();

    const pathSet = new Set<string>([familyUnit.id]);
    familyUnit.parentIds.forEach((parentId) => {
      pathSet.add(String(parentId));
      pathSet.add(`e-parent-${parentId}-${familyUnit.id}`);
    });

    const queue = [...familyUnit.childIds];
    const visited = new Set<number>();
    while (queue.length > 0) {
      const memberId = queue.shift()!;
      if (visited.has(memberId)) continue;
      visited.add(memberId);
      pathSet.add(String(memberId));

      familyUnitsForDetails
        .filter((unit) => unit.childIds.includes(memberId))
        .forEach((unit) => {
          pathSet.add(unit.id);
          pathSet.add(`e-family-${unit.id}-${memberId}`);
        });

      (childrenMap.get(memberId) || []).forEach((childId) => queue.push(childId));
    }

    return pathSet;
  }, [childrenMap, familyUnitsForDetails, hoveredFamilyUnitId]);

  const onToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const onOpenFamilyDetails = useCallback((id: string) => {
    setSelectedFamilyUnitId(id);
  }, []);
  const onHoverFamilyUnit = useCallback((id: string | null) => {
    setHoveredFamilyUnitId(id);
  }, []);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      getLayoutedElements(
        filteredMembers,
        filteredRelationships,
        collapsedIds,
        highlightedId,
        hoveredFamilyUnitId,
        onToggleCollapse,
        onOpenFamilyDetails,
        onHoverFamilyUnit
      ),
    [
      filteredMembers,
      filteredRelationships,
      collapsedIds,
      highlightedId,
      hoveredFamilyUnitId,
      onToggleCollapse,
      onOpenFamilyDetails,
      onHoverFamilyUnit,
    ]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => {
    const hasHighlight = highlightedId !== null || hoveredFamilyUnitId !== null;
    const activePathIds = new Set([...highlightedPathIds, ...hoveredFamilyPathIds]);

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.type === "generationLabel") {
          return {
            ...node,
            style: {
              ...node.style,
              opacity: hasHighlight ? 0.35 : 1,
              transition: "opacity 0.3s ease",
            },
          };
        }

        if (node.type === "familyUnit") {
          const isPathNode = activePathIds.has(node.id);
          return {
            ...node,
            data: {
              ...node.data,
              isPathHighlighted: isPathNode,
              isDimmed: hasHighlight && !isPathNode,
            },
            style: {
              ...node.style,
              transition: "opacity 0.3s ease",
            },
          };
        }

        const isPathNode = activePathIds.has(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            isHighlighted: node.id === String(highlightedId),
            isPathHighlighted: isPathNode,
            isDimmed: hasHighlight && !isPathNode,
          },
        };
      })
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const isPathEdge = activePathIds.has(edge.id);
        const relationKind = String(edge.data?.relationKind || "");
        const branchColor = typeof edge.data?.branchColor === "string" ? edge.data.branchColor : undefined;
        const baseStyle = getChildEdgeStyle(
          relationKind ? (relationKind.split(",") as RelationKind[]) : ["biological"],
          branchColor
        );

        if (!hasHighlight) {
          return {
            ...edge,
            animated: false,
            style: {
              ...edge.style,
              ...(edge.id.startsWith("e-family-") ? baseStyle : {}),
              ...(edge.id.startsWith("e-parent-") && branchColor ? { stroke: branchColor, opacity: 0.42 } : {}),
            },
            zIndex: 0,
          };
        }

        return {
          ...edge,
          animated: isPathEdge,
          style: {
            ...edge.style,
            stroke: isPathEdge ? "#f59e0b" : edge.style?.stroke,
            strokeWidth: isPathEdge ? 3 : edge.style?.strokeWidth,
            opacity: isPathEdge ? 1 : 0.1,
          },
          zIndex: isPathEdge ? 10 : 0,
        };
      })
    );
  }, [highlightedId, highlightedPathIds, hoveredFamilyPathIds, hoveredFamilyUnitId, setNodes, setEdges]);

  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [reactFlowInstance, filteredMembers.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const onApplyFilter = useCallback(() => {
    const trimmedName = nameInput.trim();
    const trimmedSurname = surnameInput.trim();
    const upGenerations = parseGenerationInput(upGenerationsInput, 0);
    const downGenerations = parseGenerationInput(downGenerationsInput, 3);
    const hasAddress = hasAddressFilter(selectedAddressFilter);
    const hasName = Boolean(trimmedName);
    const hasSurname = Boolean(trimmedSurname);

    setCollapsedIds(new Set());
    setPickerPage(1);
    setFilterWarning("");

    if (!hasName && !hasSurname && !hasAddress) {
      setAppliedFilter(null);
      setSelectedCenterId(null);
      setHighlightedId(null);
      setPickerOpen(false);
      setFilterWarning("需要其他信息才能进行筛选数据。");
      return;
    }

    if (!hasName && !hasSurname && hasAddress) {
      setAppliedFilter(null);
      setSelectedCenterId(null);
      setHighlightedId(null);
      setPickerOpen(false);
      setFilterWarning("仅有地址信息无法筛选，请补充姓氏、名字等更多信息。");
      return;
    }

    if (trimmedName) {
      setAppliedFilter({
        mode: "name",
        name: trimmedName,
        address: selectedAddressFilter,
        upGenerations,
        downGenerations,
      });
      setPickerOpen(true);
      return;
    }

    if (trimmedSurname && !hasAddress) {
      setAppliedFilter({
        mode: "surname",
        surname: trimmedSurname,
        downGenerations: 3,
      });
      setUpGenerationsInput("0");
      setDownGenerationsInput("3");
      setPickerOpen(true);
      return;
    }

    if (trimmedSurname) {
      setAppliedFilter({
        mode: "criteria",
        surname: trimmedSurname,
        address: selectedAddressFilter,
        upGenerations,
        downGenerations,
      });
      setPickerOpen(true);
      return;
    }

    setAppliedFilter(null);
    setSelectedCenterId(null);
    setHighlightedId(null);
    setPickerOpen(false);
  }, [
    nameInput,
    selectedAddressFilter,
    surnameInput,
    upGenerationsInput,
    downGenerationsInput,
  ]);

  const onResetFilters = useCallback(() => {
    setSurnameInput("");
    setNameInput("");
    setUpGenerationsInput("2");
    setDownGenerationsInput("3");
    setAddressSelection(emptyAddressSelection);
    setAppliedFilter(null);
    setFilterWarning("");
    setSelectedCenterId(null);
    setHighlightedId(null);
    setCollapsedIds(new Set());
    setPickerOpen(false);
  }, []);

  const onExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }, 100);
  }, [reactFlowInstance]);

  const onResetView = useCallback(() => {
    setNodes(initialNodes);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }, 10);
  }, [reactFlowInstance, initialNodes, setNodes]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  const onDownload = useCallback(async () => {
    const viewportElem = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!viewportElem || nodes.length === 0) return;

    const bounds = getNodesBounds(nodes);
    const imageWidth = bounds.width + 300;
    const imageHeight = bounds.height + 300;
    const transform = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 2, 0.15);

    let bgDataUrl = "";
    try {
      const response = await fetch("/images/login-bg.jpg");
      if (response.ok) {
        const blob = await response.blob();
        bgDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch (error) {
      console.warn("Failed to load background image:", error);
    }

    const canvas = document.createElement("canvas");
    canvas.width = imageWidth * 2;
    canvas.height = imageHeight * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(2, 2);

    if (bgDataUrl) {
      const bgImg = new Image();
      bgImg.src = bgDataUrl;
      await new Promise((resolve) => {
        bgImg.onload = resolve;
      });

      const bgRatio = bgImg.width / bgImg.height;
      const canvasRatio = imageWidth / imageHeight;
      let drawW = imageWidth;
      let drawH = imageHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (bgRatio > canvasRatio) {
        drawH = imageHeight;
        drawW = imageHeight * bgRatio;
        offsetX = (imageWidth - drawW) / 2;
      } else {
        drawW = imageWidth;
        drawH = imageWidth / bgRatio;
        offsetY = (imageHeight - drawH) / 2;
      }

      ctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
    } else {
      ctx.fillStyle = "#f9f5f0";
      ctx.fillRect(0, 0, imageWidth, imageHeight);
    }

    const watermarkText = userEmail || "Liu Family";
    ctx.save();
    ctx.rotate((-30 * Math.PI) / 180);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
    ctx.textAlign = "center";

    for (let x = -imageWidth; x < imageWidth * 2; x += 200) {
      for (let y = -imageHeight; y < imageHeight * 2; y += 100) {
        ctx.fillText(watermarkText, x, y);
      }
    }
    ctx.restore();

    const treeDataUrl = await toPng(viewportElem, {
      width: imageWidth,
      height: imageHeight,
      backgroundColor: null as any,
      style: {
        width: imageWidth.toString(),
        height: imageHeight.toString(),
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "transparent",
      },
      pixelRatio: 2,
      cacheBust: true,
    });

    const treeImg = new Image();
    treeImg.src = treeDataUrl;
    await new Promise((resolve) => {
      treeImg.onload = resolve;
    });

    ctx.drawImage(treeImg, 0, 0, imageWidth, imageHeight);

    const finalDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const a = document.createElement("a");
    a.setAttribute("download", `family-tree-${new Date().toISOString().split("T")[0]}.jpg`);
    a.setAttribute("href", finalDataUrl);
    a.click();
  }, [nodes, userEmail]);

  const toggleDraggable = useCallback(() => {
    setIsDraggable((prev) => !prev);
  }, []);

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type !== "familyMember") return;
      const member = members.find((item) => item.id === Number(node.id));
      if (member && onMemberClick) {
        setHighlightedId(member.id);
        onMemberClick(member);
      }
    },
    [members, onMemberClick]
  );

  const pickerTotalPages = Math.max(1, Math.ceil(candidateMembers.length / PICKER_PAGE_SIZE));
  const pickerItems = candidateMembers.slice(
    (pickerPage - 1) * PICKER_PAGE_SIZE,
    pickerPage * PICKER_PAGE_SIZE
  );
  const isSurnameMode =
    appliedFilter?.mode === "surname" ||
    (!!surnameInput.trim() && !nameInput.trim() && !hasAddressFilter(selectedAddressFilter));
  const selectedCenter = members.find((member) => member.id === selectedCenterId) || null;
  const selectedFamilyUnit = familyUnitsForDetails.find((unit) => unit.id === selectedFamilyUnitId) || null;
  const memberMapForDetails = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <div
      ref={containerRef}
      className="relative h-[calc(100vh-200px)] min-h-[560px] w-full rounded-lg border bg-background"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => instance.fitView({ padding: 0.2 })}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        nodesDraggable={isDraggable}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-border !shadow-md [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted [&>button>svg]:!fill-current"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />

        <Panel
          position="top-left"
          className="!absolute !left-0 !top-0 !m-0 flex !w-full flex-wrap items-start justify-between gap-2 p-2 sm:p-4 pointer-events-none z-10"
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur-sm">
            <Input
              placeholder="姓氏"
              value={surnameInput}
              onChange={(event) => setSurnameInput(event.target.value)}
              className="h-9 w-24"
            />
            <Input
              placeholder="姓名"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onApplyFilter()}
              className="h-9 w-32 sm:w-40"
            />
            <Input
              type="number"
              min={0}
              disabled={isSurnameMode}
              title={isSurnameMode ? "姓氏支系模式只能向下展示" : "向上几代"}
              value={isSurnameMode ? "0" : upGenerationsInput}
              onChange={(event) => setUpGenerationsInput(event.target.value)}
              className="h-9 w-24"
              placeholder="向上"
            />
            <Input
              type="number"
              min={0}
              value={downGenerationsInput}
              onChange={(event) => setDownGenerationsInput(event.target.value)}
              className="h-9 w-24"
              placeholder="向下"
            />
            <AddressSelect
              placeholder="省"
              value={addressSelection.provinceCode}
              selectedLabel={addressSelection.provinceLabel}
              options={provinceOptions}
              onChange={(option) =>
                setAddressSelection({
                  ...emptyAddressSelection,
                  provinceCode: option?.value || "",
                  provinceLabel: option?.label || "",
                })
              }
            />
            <AddressSelect
              placeholder="市"
              value={addressSelection.cityCode}
              selectedLabel={addressSelection.cityLabel}
              options={cityOptions}
              disabled={!addressSelection.provinceCode}
              onChange={(option) =>
                setAddressSelection((current) => ({
                  ...current,
                  cityCode: option?.value || "",
                  cityLabel: option?.label || "",
                  districtCode: "",
                  districtLabel: "",
                  townCode: "",
                  townLabel: "",
                }))
              }
            />
            <AddressSelect
              placeholder="县/区"
              value={addressSelection.districtCode}
              selectedLabel={addressSelection.districtLabel}
              options={districtOptions}
              disabled={!addressSelection.cityCode}
              onChange={(option) =>
                setAddressSelection((current) => ({
                  ...current,
                  districtCode: option?.value || "",
                  districtLabel: option?.label || "",
                  townCode: "",
                  townLabel: "",
                }))
              }
            />
            <AddressSelect
              placeholder="镇"
              value={addressSelection.townCode}
              selectedLabel={addressSelection.townLabel}
              options={townOptions}
              disabled={!addressSelection.districtCode}
              onChange={(option) =>
                setAddressSelection((current) => ({
                  ...current,
                  townCode: option?.value || "",
                  townLabel: option?.label || "",
                }))
              }
            />
            <Button size="sm" onClick={onApplyFilter} className="h-9">
              <Search className="mr-1 h-4 w-4" />
              应用
            </Button>
            <Button size="icon" variant="ghost" onClick={onResetFilters} title="重置筛选" className="h-9 w-9">
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!appliedFilter || candidateMembers.length === 0}
              onClick={() => setPickerOpen(true)}
              className="h-9"
            >
              {selectedCenter ? selectedCenter.name : "选择支系"}
            </Button>
            {filterWarning && (
              <Alert className="w-full border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{filterWarning}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onResetView}
              disabled={nodes.length === 0}
              title="重置视图"
              className="h-9 w-9 bg-background/95 px-0 shadow-sm backdrop-blur-sm sm:w-auto sm:px-4"
            >
              <RotateCcw className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">重置</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleFullscreen}
              title={isFullscreen ? "退出全屏" : "进入全屏"}
              className="h-9 w-9 bg-background/95 px-0 shadow-sm backdrop-blur-sm sm:w-auto sm:px-4"
            >
              {isFullscreen ? <Minimize className="h-4 w-4 sm:mr-1" /> : <Maximize className="h-4 w-4 sm:mr-1" />}
              <span className="hidden sm:inline">{isFullscreen ? "退出全屏" : "全屏"}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-9 w-9 bg-background/95 shadow-sm backdrop-blur-sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onExpandAll}>
                  <ChevronsDown className="mr-2 h-4 w-4" />
                  全部展开
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleDraggable}>
                  {isDraggable ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                  {isDraggable ? "解锁位置" : "锁定位置"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDownload} disabled={nodes.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  保存图片
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Panel>

        <Panel position="bottom-right" className="rounded-md border bg-background/95 px-3 py-2 backdrop-blur-sm">
          <span className="text-sm text-muted-foreground">
            显示 {filteredMembers.length} / {members.length} 位成员
          </span>
        </Panel>
      </ReactFlow>

      <CandidatePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="选择支系成员"
        description={
          appliedFilter?.mode === "surname"
            ? "只输入姓氏时，请选择要展示的根支系。"
            : "筛选条件匹配到多位成员，请选择一个作为中心。"
        }
        members={pickerItems}
        allMembers={members}
        relationships={relationships}
        totalCount={candidateMembers.length}
        currentPage={pickerPage}
        totalPages={pickerTotalPages}
        selectedId={selectedCenterId}
        onPrevious={() => setPickerPage((page) => Math.max(1, page - 1))}
        onNext={() => setPickerPage((page) => Math.min(pickerTotalPages, page + 1))}
        onSelect={(memberId) => {
          setSelectedCenterId(memberId);
          setHighlightedId(memberId);
          setPickerOpen(false);
        }}
      />
      <FamilyUnitDetailsDialog
        open={Boolean(selectedFamilyUnit)}
        onOpenChange={(open) => {
          if (!open) setSelectedFamilyUnitId(null);
        }}
        familyUnit={selectedFamilyUnit}
        memberMap={memberMapForDetails}
      />
    </div>
  );
});

export function FamilyTreeGraph({ initialData }: FamilyTreeGraphProps) {
  const [selectedMember, setSelectedMember] = useState<FamilyMemberNode | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const getMemberName = useCallback(
    (memberId: number | null) => {
      if (!memberId) return null;
      return initialData.members.find((member) => member.id === memberId)?.name || null;
    },
    [initialData.members]
  );

  const getPrimaryParentId = useCallback(
    (member: FamilyMemberNode | null, role: "father" | "mother") => {
      if (!member) return null;
      const relationship = initialData.relationships.find(
        (item) => item.child_id === member.id && item.parent_role === role && item.is_primary
      );
      return relationship?.parent_id || (role === "father" ? member.father_id : member.mom_id);
    },
    [initialData.relationships]
  );

  const handleMemberClick = useCallback((member: FamilyMemberNode) => {
    setSelectedMember(member);
    setIsDetailOpen(true);
  }, []);

  return (
    <>
      <ReactFlowProvider>
        <FamilyTreeGraphInner dataset={initialData} onMemberClick={handleMemberClick} />
      </ReactFlowProvider>

      <MemberDetailDialog
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        member={selectedMember}
        fatherName={getMemberName(getPrimaryParentId(selectedMember, "father"))}
        motherName={getMemberName(getPrimaryParentId(selectedMember, "mother"))}
      />
    </>
  );
}

function FamilyUnitDetailsDialog({
  open,
  onOpenChange,
  familyUnit,
  memberMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyUnit: FamilyUnit | null;
  memberMap: Map<number, FamilyMemberNode>;
}) {
  if (!familyUnit) return null;

  const father = familyUnit.parents.find((parent) => parent.role === "father");
  const mother = familyUnit.parents.find((parent) => parent.role === "mother");
  const children = familyUnit.childIds
    .map((childId) => memberMap.get(childId))
    .filter((member): member is FamilyMemberNode => Boolean(member));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>配偶家庭单元</DialogTitle>
          <DialogDescription>{familyUnit.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">父亲</div>
              <div className="mt-1 font-medium">{father?.name || "未记录"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">母亲</div>
              <div className="mt-1 font-medium">{mother?.name || "未记录"}</div>
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">子女</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {familyUnit.childrenCount} 人
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {children.length > 0 ? (
                children.map((child) => (
                  <span
                    key={child.id}
                    className="rounded-full border px-2.5 py-1 text-sm"
                    style={{ borderColor: familyUnit.branchColor }}
                  >
                    {child.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">暂无可见子女</span>
              )}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">关系类型</div>
            <div className="mt-1 text-sm">{getRelationKindLabel(familyUnit.relationKinds)}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidatePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  members,
  allMembers,
  relationships,
  totalCount,
  currentPage,
  totalPages,
  selectedId,
  onPrevious,
  onNext,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  members: FamilyMemberNode[];
  allMembers: FamilyMemberNode[];
  relationships: FamilyRelationship[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  selectedId: number | null;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (memberId: number) => void;
}) {
  const memberMap = useMemo(() => new Map(allMembers.map((member) => [member.id, member])), [allMembers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {members.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              没有找到匹配结果。
            </div>
          ) : (
            members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelect(member.id)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-md border px-3 py-3 text-left text-sm transition-colors hover:bg-muted",
                  selectedId === member.id && "border-primary bg-primary/5"
                )}
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-medium">{member.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {member.generation ? `第${member.generation}世` : "世代未知"}
                  </span>
                </div>
                <div className="grid w-full gap-1 text-muted-foreground sm:grid-cols-2">
                  <span className="min-w-0 break-words">配偶：{member.spouse || "未录入"}</span>
                  <span className="min-w-0 break-words">
                    父母：{formatCandidateParents(member, memberMap, relationships)}
                  </span>
                  <span className="min-w-0 break-words sm:col-span-2">
                    地区：{formatCandidateResidence(member)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            共 {totalCount} 条，{currentPage} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrevious} disabled={currentPage <= 1}>
              上一页
            </Button>
            <Button variant="outline" size="sm" onClick={onNext} disabled={currentPage >= totalPages}>
              下一页
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatCandidateParents(
  member: FamilyMemberNode,
  memberMap: Map<number, FamilyMemberNode>,
  relationships: FamilyRelationship[]
) {
  const fatherId = getCandidateParentId(member, "father", relationships);
  const motherId = getCandidateParentId(member, "mother", relationships);
  const fatherName = fatherId ? memberMap.get(fatherId)?.name : "";
  const motherName = motherId ? memberMap.get(motherId)?.name : "";
  const parts = [
    fatherName ? `父 ${fatherName}` : "",
    motherName ? `母 ${motherName}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("，") : "未录入";
}

function getCandidateParentId(
  member: FamilyMemberNode,
  role: "father" | "mother",
  relationships: FamilyRelationship[]
) {
  const relationship = relationships.find(
    (item) => item.child_id === member.id && item.parent_role === role && item.is_primary
  );
  return relationship?.parent_id || (role === "father" ? member.father_id : member.mom_id);
}

function formatCandidateResidence(member: FamilyMemberNode) {
  const parts = [
    member.residence_province,
    member.residence_city,
    member.residence_district,
    member.residence_town,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("") : member.residence_place || "未录入";
}

function getFilterCandidates(
  filter: AppliedFilter | null,
  members: FamilyMemberNode[],
  relationships: FamilyRelationship[]
): FamilyMemberNode[] {
  if (!filter) return [];

  if (filter.mode === "name") {
    return members.filter(
      (member) => member.name.includes(filter.name) && memberMatchesAddressFilter(member, filter.address)
    );
  }

  if (filter.mode === "criteria") {
    return members.filter(
      (member) =>
        member.name.startsWith(filter.surname) && memberMatchesAddressFilter(member, filter.address)
    );
  }

  return members.filter((member) => {
    if (!member.name.startsWith(filter.surname)) return false;
    return getParentRelations(member, relationships).length === 0;
  });
}

function getVisibleMembers(
  filter: AppliedFilter,
  centerId: number,
  members: FamilyMemberNode[],
  relationships: FamilyRelationship[]
): FamilyMemberNode[] {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const visibleIds = new Set<number>([centerId]);

  if (filter.mode === "name") {
    collectAncestors(centerId, filter.upGenerations, memberMap, relationships, visibleIds);
    collectDescendants(centerId, filter.downGenerations, relationships, visibleIds);
  } else if (filter.mode === "criteria") {
    collectAncestors(centerId, filter.upGenerations, memberMap, relationships, visibleIds);
    collectDescendants(centerId, filter.downGenerations, relationships, visibleIds);
  } else {
    collectDescendants(centerId, filter.downGenerations, relationships, visibleIds);
  }

  includeVisibleCoParents(visibleIds, memberMap, relationships);

  return members.filter((member) => visibleIds.has(member.id));
}

function hasAddressFilter(address: AddressFilter) {
  return Boolean(address.province || address.city || address.district || address.town);
}

function memberMatchesAddressFilter(member: FamilyMemberNode, address: AddressFilter) {
  if (address.province && member.residence_province !== address.province) return false;
  if (address.city && member.residence_city !== address.city) return false;
  if (address.district && member.residence_district !== address.district) return false;
  if (address.town && member.residence_town !== address.town) return false;

  return true;
}

function collectAncestors(
  startId: number,
  depth: number,
  memberMap: Map<number, FamilyMemberNode>,
  relationships: FamilyRelationship[],
  visibleIds: Set<number>
) {
  const queue: { id: number; depth: number }[] = [{ id: startId, depth: 0 }];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth >= depth) continue;
    visited.add(current.id);

    const member = memberMap.get(current.id);
    if (!member) continue;

    getParentRelations(member, relationships).forEach((relation) => {
      if (!memberMap.has(relation.parentId)) return;
      visibleIds.add(relation.parentId);
      queue.push({ id: relation.parentId, depth: current.depth + 1 });
    });
  }
}

function collectDescendants(
  startId: number,
  depth: number,
  relationships: FamilyRelationship[],
  visibleIds: Set<number>
) {
  const childrenMap = new Map<number, number[]>();
  relationships.forEach((relationship) => {
    const children = childrenMap.get(relationship.parent_id) || [];
    if (!children.includes(relationship.child_id)) {
      children.push(relationship.child_id);
    }
    childrenMap.set(relationship.parent_id, children);
  });

  const queue: { id: number; depth: number }[] = [{ id: startId, depth: 0 }];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth >= depth) continue;
    visited.add(current.id);

    (childrenMap.get(current.id) || []).forEach((childId) => {
      visibleIds.add(childId);
      queue.push({ id: childId, depth: current.depth + 1 });
    });
  }
}

function includeVisibleCoParents(
  visibleIds: Set<number>,
  memberMap: Map<number, FamilyMemberNode>,
  relationships: FamilyRelationship[]
) {
  const relationshipsByChild = new Map<number, FamilyRelationship[]>();

  relationships.forEach((relationship) => {
    const childRelationships = relationshipsByChild.get(relationship.child_id) || [];
    childRelationships.push(relationship);
    relationshipsByChild.set(relationship.child_id, childRelationships);
  });

  relationshipsByChild.forEach((childRelationships, childId) => {
    if (!visibleIds.has(childId)) return;

    const hasVisibleParent = childRelationships.some((relationship) => visibleIds.has(relationship.parent_id));
    if (!hasVisibleParent) return;

    childRelationships.forEach((relationship) => {
      if (memberMap.has(relationship.parent_id)) {
        visibleIds.add(relationship.parent_id);
      }
    });
  });
}

function applyCollapsedState(
  members: FamilyMemberNode[],
  relationships: FamilyRelationship[],
  collapsedIds: Set<string>,
  familyUnits: FamilyUnit[]
): FamilyMemberNode[] {
  if (collapsedIds.size === 0) return members;

  const memberIds = new Set(members.map((member) => member.id));
  const childrenMap = buildChildrenMap(members, relationships);
  const visibleIds = new Set(memberIds);

  familyUnits.forEach((familyUnit) => {
    if (!collapsedIds.has(familyUnit.id)) return;

    const queue = [...familyUnit.childIds];
    const hiddenIds = new Set<number>();
    while (queue.length > 0) {
      const memberId = queue.shift()!;
      if (hiddenIds.has(memberId) || !memberIds.has(memberId)) continue;
      hiddenIds.add(memberId);

      (childrenMap.get(memberId) || []).forEach((childId) => {
        queue.push(childId);
      });
    }

    let changed = true;
    while (changed) {
      changed = false;

      familyUnits.forEach((relatedFamilyUnit) => {
        if (relatedFamilyUnit.id === familyUnit.id) return;

        const hasHiddenChild = relatedFamilyUnit.childIds.some((childId) => hiddenIds.has(childId));
        const hasHiddenParent = relatedFamilyUnit.parentIds.some((parentId) => hiddenIds.has(parentId));
        if (!hasHiddenChild && !hasHiddenParent) return;

        [...relatedFamilyUnit.parentIds, ...relatedFamilyUnit.childIds].forEach((memberId) => {
          if (memberIds.has(memberId) && !hiddenIds.has(memberId)) {
            hiddenIds.add(memberId);
            changed = true;
          }
        });
      });
    }

    hiddenIds.forEach((memberId) => visibleIds.delete(memberId));
  });

  return members.filter((member) => visibleIds.has(member.id));
}
function buildBranchColorMap(roots: FamilyMemberNode[], childrenMap: Map<number, number[]>): Map<number, HSLColor> {
  const memberBaseColorMap = new Map<number, HSLColor>();

  const setDescendantColors = (memberId: number, color: HSLColor) => {
    memberBaseColorMap.set(memberId, color);
    (childrenMap.get(memberId) || []).forEach((childId) => {
      if (!memberBaseColorMap.has(childId)) {
        setDescendantColors(childId, color);
      }
    });
  };

  roots.forEach((root) => {
    (childrenMap.get(root.id) || []).forEach((childId, index) => {
      setDescendantColors(childId, getBranchBaseColor(index));
    });
  });

  return memberBaseColorMap;
}

function buildFamilyUnits(
  visibleMembers: FamilyMemberNode[],
  relationships: FamilyRelationship[]
): FamilyUnit[] {
  const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));
  const memberMap = new Map(visibleMembers.map((member) => [member.id, member]));
  const visibleChildRelationships = relationships.filter(
    (relationship) => visibleMemberIds.has(relationship.child_id) && visibleMemberIds.has(relationship.parent_id)
  );
  const relationshipsByChild = new Map<number, ParentRelation[]>();

  visibleChildRelationships.forEach((relationship) => {
    const relation = toParentRelation(relationship);
    const relations = relationshipsByChild.get(relation.childId) || [];
    relations.push(relation);
    relationshipsByChild.set(relation.childId, relations);
  });

  const familyMap = new Map<string, FamilyUnit>();

  relationshipsByChild.forEach((relations, childId) => {
    const orderedParents = orderParentIds(relations);
    if (orderedParents.length === 0) return;

    const key = `family-${orderedParents.join("-")}`;
    const existing = familyMap.get(key) || {
      id: key,
      parentIds: orderedParents,
      childIds: [],
      relationKinds: [],
      parents: [],
      childrenCount: 0,
      branchColor: "",
      label: "",
      description: "",
      isMultiPartnerBranch: false,
    };

    if (!existing.childIds.includes(childId)) {
      existing.childIds.push(childId);
    }
    relations.forEach((relation) => {
      if (!existing.relationKinds.includes(relation.relationKind)) {
        existing.relationKinds.push(relation.relationKind);
      }
    });
    familyMap.set(key, existing);
  });

  const parentFamilyCounts = countParentFamilyUnits(Array.from(familyMap.values()));
  return Array.from(familyMap.values()).map((familyUnit, index) => {
    const parents = familyUnit.parentIds.map((parentId) => {
      const relation = familyUnit.childIds
        .flatMap((childId) => relationshipsByChild.get(childId) || [])
        .find((item) => item.parentId === parentId);
      return {
        id: parentId,
        name: memberMap.get(parentId)?.name || `#${parentId}`,
        role: relation?.relationType || "parent",
      };
    });
    const branchColor = getFamilyBranchColor(index);
    const isMultiPartnerBranch = familyUnit.parentIds.some((parentId) => (parentFamilyCounts.get(parentId) || 0) > 1);

    return {
      ...familyUnit,
      parents,
      childrenCount: familyUnit.childIds.length,
      branchColor,
      label: getFamilyUnitLabel(parents, parentFamilyCounts, isMultiPartnerBranch),
      description: getFamilyUnitDescription(parents, familyUnit.childIds.length, familyUnit.relationKinds),
      isMultiPartnerBranch,
    };
  });
}

function orderParentIds(relations: ParentRelation[]): number[] {
  const father = relations.find((relation) => relation.relationType === "father");
  const mother = relations.find((relation) => relation.relationType === "mother");
  const otherParents = relations
    .filter((relation) => relation.relationType === "parent")
    .map((relation) => relation.parentId)
    .sort((a, b) => a - b);

  return [father?.parentId, mother?.parentId, ...otherParents].filter(
    (parentId): parentId is number => typeof parentId === "number"
  );
}

function getFamilyBranchColor(index: number): string {
  const hue = (142 + index * 47) % 360;
  return `hsl(${hue}, 54%, 45%)`;
}

function getFamilyUnitLabel(
  parents: FamilyUnitParent[],
  parentFamilyCounts: Map<number, number>,
  isMultiPartnerBranch: boolean
): string {
  if (!parents.length) return "家庭";

  if (isMultiPartnerBranch) {
    const differentiator =
      parents.find((parent) => (parentFamilyCounts.get(parent.id) || 0) === 1) ||
      parents.find((parent) => parent.role === "mother") ||
      parents.find((parent) => parent.role === "father") ||
      parents[0];
    return `${getParentRoleShortLabel(differentiator.role)}：${differentiator.name}`;
  }

  const father = parents.find((parent) => parent.role === "father");
  const mother = parents.find((parent) => parent.role === "mother");
  if (father && mother) return `${father.name} / ${mother.name}`;

  return parents.map((parent) => parent.name).join(" / ");
}

function getFamilyUnitDescription(
  parents: FamilyUnitParent[],
  childrenCount: number,
  relationKinds: RelationKind[]
): string {
  const parentText = parents
    .map((parent) => `${getParentRoleLabel(parent.role)}：${parent.name}`)
    .join(" / ");
  return `${parentText || "父母未记录"}；子女 ${childrenCount} 人；关系：${getRelationKindLabel(relationKinds)}`;
}

function getParentRoleShortLabel(role: ParentRelation["relationType"]): string {
  if (role === "father") return "父";
  if (role === "mother") return "母";
  return "亲";
}

function getParentRoleLabel(role: ParentRelation["relationType"]): string {
  if (role === "father") return "父亲";
  if (role === "mother") return "母亲";
  return "家长";
}

function countParentFamilyUnits(familyUnits: FamilyUnit[]): Map<number, number> {
  const counts = new Map<number, number>();
  familyUnits.forEach((familyUnit) => {
    familyUnit.parentIds.forEach((parentId) => {
      counts.set(parentId, (counts.get(parentId) || 0) + 1);
    });
  });
  return counts;
}

function spreadMultiPartnerFamilyUnits(
  dagreGraph: dagre.graphlib.Graph,
  familyUnits: FamilyUnit[],
  parentFamilyCounts: Map<number, number>
) {
  const grouped = new Map<number, FamilyUnit[]>();
  familyUnits.forEach((familyUnit) => {
    familyUnit.parentIds.forEach((parentId) => {
      if ((parentFamilyCounts.get(parentId) || 0) <= 1) return;
      grouped.set(parentId, [...(grouped.get(parentId) || []), familyUnit]);
    });
  });

  grouped.forEach((units) => {
    const uniqueUnits = Array.from(new Map(units.map((unit) => [unit.id, unit])).values());
    if (uniqueUnits.length <= 1) return;

    uniqueUnits.sort((a, b) => a.id.localeCompare(b.id));
    const center = uniqueUnits.reduce((total, unit) => total + (dagreGraph.node(unit.id)?.x || 0), 0) / uniqueUnits.length;
    const spacing = NODE_WIDTH + FAMILY_NODE_WIDTH + 80;

    uniqueUnits.forEach((unit, index) => {
      const node = dagreGraph.node(unit.id);
      if (!node) return;
      node.x = center + (index - (uniqueUnits.length - 1) / 2) * spacing;
    });
  });
}

function findPrimaryChildFamilyColor(memberId: number, familyUnits: FamilyUnit[]): string | undefined {
  return familyUnits.find((familyUnit) => familyUnit.childIds.includes(memberId))?.branchColor;
}

function getChildEdgeStyle(relationKinds: RelationKind[], branchColor = "hsl(var(--muted-foreground))"): Edge["style"] {
  if (relationKinds.includes("adoptive")) {
    return {
      stroke: "#8b5cf6",
      strokeWidth: 2.5,
      opacity: 0.85,
      strokeDasharray: "8 5",
    };
  }

  if (relationKinds.some((kind) => kind !== "biological")) {
    return {
      stroke: "#f59e0b",
      strokeWidth: 2,
      opacity: 0.75,
      strokeDasharray: "5 5",
    };
  }

  return {
    stroke: branchColor,
    strokeWidth: 2.4,
    opacity: 0.72,
  };
}

function getRelationKindLabel(relationKinds: RelationKind[]): string {
  const labels: Record<RelationKind, string> = {
    biological: "亲生",
    adoptive: "领养",
    step: "继亲",
    guardian: "监护",
    unknown: "未知",
  };

  return Array.from(new Set(relationKinds)).map((kind) => labels[kind]).join(" / ") || "家庭关系";
}

function parseGenerationInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}
