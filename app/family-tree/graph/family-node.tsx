"use client";

import { memo, type CSSProperties } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { FamilyMemberNode } from "./actions";

export interface FamilyNodeData extends FamilyMemberNode {
  isHighlighted?: boolean;
  isPathHighlighted?: boolean;
  isDimmed?: boolean;
  hasChildren?: boolean;
  branchColor?: string;
  [key: string]: unknown;
}

export interface FamilyNodeProps {
  data: FamilyNodeData;
}

function FamilyMemberNodeComponent({ data: nodeData }: FamilyNodeProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 text-card-foreground shadow-md min-w-[140px] transition-all duration-300 relative group",
        nodeData.isDimmed && "opacity-30 grayscale scale-95 blur-[0.5px]",
        nodeData.is_alive ? "bg-card" : "bg-muted/50",
        nodeData.isHighlighted
          ? "border-green-500 ring-4 ring-green-400/50 scale-110 z-50"
          : nodeData.isPathHighlighted
            ? "border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)] z-10"
            : nodeData.gender === "男"
              ? nodeData.is_alive
                ? "border-blue-400 dark:border-blue-500"
                : "border-blue-300/40 dark:border-blue-900/40"
              : nodeData.gender === "女"
                ? nodeData.is_alive
                  ? "border-pink-400 dark:border-pink-500"
                  : "border-pink-300/40 dark:border-pink-900/40"
                : "border-border",
        !nodeData.is_alive && !nodeData.isDimmed && "opacity-80 grayscale-[0.2]",
        "hover:shadow-xl hover:-translate-y-0.5 transition-transform duration-300"
      )}
    >
      <div
        className={cn(
          "absolute top-0 inset-x-0 h-1 rounded-t-[inherit]",
          nodeData.isHighlighted
            ? "bg-green-500"
            : nodeData.isPathHighlighted
              ? "bg-amber-400"
              : nodeData.gender === "男"
                ? nodeData.is_alive
                  ? "bg-blue-400 dark:bg-blue-500"
                  : "bg-blue-300/40"
                : nodeData.gender === "女"
                  ? nodeData.is_alive
                    ? "bg-pink-400 dark:bg-pink-500"
                    : "bg-pink-300/40"
                  : "bg-border"
        )}
        style={
          nodeData.branchColor && !nodeData.isHighlighted && !nodeData.isPathHighlighted
            ? ({ backgroundColor: nodeData.branchColor } as CSSProperties)
            : undefined
        }
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />

      <div className="flex flex-col items-center gap-1.5 mb-1 w-full">
        <div
          className={cn(
            "font-semibold text-base text-center truncate w-full px-2",
            !nodeData.is_alive && "text-foreground/80"
          )}
          title={nodeData.name}
        >
          {nodeData.name}
        </div>

        {nodeData.spouse && (
          <div className="flex items-center justify-center gap-0.5 w-full -mt-0.5 mb-0.5">
            <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap select-none">配</span>
            <span
              className="text-xs text-muted-foreground font-medium truncate max-w-[80%] text-center"
              title={nodeData.spouse}
            >
              {nodeData.spouse}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {nodeData.generation !== null && (
            <Badge
              variant={nodeData.is_alive ? "secondary" : "outline"}
              className={cn("text-xs", !nodeData.is_alive && "opacity-80")}
            >
              第{nodeData.generation}世
            </Badge>
          )}
          {nodeData.sibling_order !== null && (
            <Badge variant="outline" className={cn("text-xs", !nodeData.is_alive && "opacity-80")}>
              排行{nodeData.sibling_order}
            </Badge>
          )}
        </div>

        {nodeData.gender && (
          <span
            className={cn(
              "text-xs",
              nodeData.gender === "男"
                ? nodeData.is_alive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-blue-800/60 dark:text-blue-300/50"
                : nodeData.is_alive
                  ? "text-pink-600 dark:text-pink-400"
                  : "text-pink-800/60 dark:text-pink-300/50"
            )}
          >
            {nodeData.gender}
          </span>
        )}

        {!nodeData.is_alive && <span className="text-xs text-muted-foreground/80 italic">已故</span>}
      </div>

      {nodeData.hasChildren && (
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
    </div>
  );
}

export const FamilyMemberNodeType = memo(FamilyMemberNodeComponent);
