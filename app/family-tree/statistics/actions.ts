"use server";

import { createClient } from "@/lib/supabase/server";

// Aggregated payload consumed by chart components.
export interface StatisticsData {
  totalMembers: number;
  genderStats: { name: string; value: number; fill: string }[];
  generationStats: { name: string; value: number }[];
  statusStats: { name: string; value: number; fill: string }[];
  ageStats: { name: string; value: number }[];
  commonNames: { name: string; count: number }[];
}

export async function fetchFamilyStatistics(): Promise<{
  data: StatisticsData | null;
  error: string | null;
}> {
  const supabase = await createClient();

  // Fetch only necessary fields for statistics to improve performance
  const { data: members, error } = await supabase
    .from("family_members")
    .select("id, name, gender, generation, is_alive, birthday")
    .order("generation", { ascending: true });

  if (error || !members) {
    console.error("Error fetching statistics data:", error);
    return { data: null, error: error?.message || "Failed to fetch data" };
  }

  const totalMembers = members.length;

  // 1) Gender statistics
  const genderCounts = members.reduce(
    (acc, member) => {
      const gender = member.gender || "未知";
      acc[gender] = (acc[gender] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const genderStats = [
    { name: "男", value: genderCounts["男"] || 0, fill: "#3b82f6" }, // blue-500
    { name: "女", value: genderCounts["女"] || 0, fill: "#ec4899" }, // pink-500
  ];
  if (genderCounts["未知"]) {
    genderStats.push({
      name: "未知",
      value: genderCounts["未知"],
      fill: "#94a3b8",
    }); // slate-400
  }

  // 2) Generation statistics
  const generationCounts = members.reduce(
    (acc, member) => {
      const gen = member.generation ? `第${member.generation}世` : "未知";
      acc[gen] = (acc[gen] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Keep generation bars in natural numeric order.
  const sortedGenerations = Object.keys(generationCounts).sort((a, b) => {
    if (a === "未知") return 1;
    if (b === "未知") return -1;
    const genA = parseInt(a.replace(/\D/g, ""));
    const genB = parseInt(b.replace(/\D/g, ""));
    return genA - genB;
  });

  const generationStats = sortedGenerations.map((gen) => ({
    name: gen,
    value: generationCounts[gen],
  }));

  // 3) Alive vs deceased
  const statusCounts = members.reduce(
    (acc, member) => {
      const status = member.is_alive ? "在世" : "已故";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const statusStats = [
    { name: "在世", value: statusCounts["在世"] || 0, fill: "#22c55e" }, // green-500
    { name: "已故", value: statusCounts["已故"] || 0, fill: "#64748b" }, // slate-500
  ];

  // 4) Age distribution for living members with birthday
  const now = new Date();
  const ageGroups: Record<string, number> = {
    "0-10岁": 0,
    "11-20岁": 0,
    "21-30岁": 0,
    "31-40岁": 0,
    "41-50岁": 0,
    "51-60岁": 0,
    "61-70岁": 0,
    "71-80岁": 0,
    "80岁以上": 0,
  };

  members.forEach((member) => {
    if (member.is_alive && member.birthday) {
      const birthDate = new Date(member.birthday);
      let age = now.getFullYear() - birthDate.getFullYear();
      const m = now.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age <= 10) ageGroups["0-10岁"]++;
      else if (age <= 20) ageGroups["11-20岁"]++;
      else if (age <= 30) ageGroups["21-30岁"]++;
      else if (age <= 40) ageGroups["31-40岁"]++;
      else if (age <= 50) ageGroups["41-50岁"]++;
      else if (age <= 60) ageGroups["51-60岁"]++;
      else if (age <= 70) ageGroups["61-70岁"]++;
      else if (age <= 80) ageGroups["71-80岁"]++;
      else ageGroups["80岁以上"]++;
    }
  });

  const ageStats = Object.entries(ageGroups).map(([name, value]) => ({
    name,
    value,
  }));

  // 5) Common generation-character trend.
  // Current heuristic: count the second character of each name.
  const nameCounts: Record<string, number> = {};
  members.forEach((m) => {
    // Naive assumption: First char is surname.
    const givenName = m.name.length > 1 ? m.name.substring(1) : m.name;
    // Count individual characters in given name for "Generation Name" (Zi) trends?
    // Or just count the full name if duplicates exist.
    // Let's count the 2nd character (often generation character).
    if (m.name.length >= 2) {
      const genChar = m.name[1]; // 2nd character
      nameCounts[genChar] = (nameCounts[genChar] || 0) + 1;
    }
  });

  const commonNames = Object.entries(nameCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    data: {
      totalMembers,
      genderStats,
      generationStats,
      statusStats,
      ageStats,
      commonNames,
    },
    error: null,
  };
}
