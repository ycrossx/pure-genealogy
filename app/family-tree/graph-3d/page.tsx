import { Suspense } from "react";
import { fetchAllFamilyMembers } from "../graph/actions";
import { FamilyForceGraph } from "./force-graph";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";

export const metadata: Metadata = {
  title: "族谱关系图 (3D) | Liu Family",
  description: "三维视角的家族族谱关系图",
};

async function Graph3DLoader() {
  // Reuse the same relationship dataset as 2D view.
  const { data, error } = await fetchAllFamilyMembers();

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] border rounded-lg bg-destructive/10 text-destructive p-4">
        <p>加载数据失败: {error}</p>
      </div>
    );
  }

  if (data.members.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] border rounded-lg bg-muted/50 text-muted-foreground p-8 text-center">
        <p>暂无族谱数据，请先添加成员。</p>
      </div>
    );
  }

  return <FamilyForceGraph data={data.members} relationships={data.relationships} />;
}

export default function FamilyTreeGraph3DPage() {
  // 3D graph entry page with navigation back to 2D graph.
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
        <h1 className="text-3xl font-bold">族谱关系图 (3D)</h1>
        <Button variant="outline" asChild>
          <Link href="/family-tree/graph">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            切换到 2D 视图
          </Link>
        </Button>
      </div>
      
      <Suspense fallback={
        <div className="w-full h-[600px] border rounded-lg bg-muted/20 animate-pulse flex items-center justify-center">
          <div className="text-muted-foreground">加载族谱数据...</div>
        </div>
      }>
        <Graph3DLoader />
      </Suspense>
    </div>
  );
}
