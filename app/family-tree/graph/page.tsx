import { Suspense } from "react";
import { FamilyTreeGraph } from "./family-tree-graph";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Box } from "lucide-react";

function GraphSkeleton() {
  return (
    <div className="w-full h-[calc(100vh-200px)] min-h-[500px] border rounded-lg bg-muted/20 animate-pulse flex items-center justify-center">
      <div className="text-muted-foreground">加载族谱关系图...</div>
    </div>
  );
}

async function GraphLoader() {
  // Relationship graph data is fetched on demand after the user applies filters.
  return (
    <FamilyTreeGraph
      initialData={{
        members: [],
        relationships: [],
        spouseRelationships: [],
        seedIds: [],
        contextIds: [],
      }}
    />
  );
}

export default function FamilyTreeGraphPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
        <h1 className="text-3xl font-bold">族谱关系图</h1>
        <Button variant="outline" asChild>
          <Link href="/family-tree/graph-3d">
            <Box className="mr-2 h-4 w-4" />
            切换到 3D 视图
          </Link>
        </Button>
      </div>

      <Suspense fallback={<GraphSkeleton />}>
        <GraphLoader />
      </Suspense>
    </div>
  );
}
