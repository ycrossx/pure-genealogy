import { NextResponse } from "next/server";
import {
  getCities,
  getCountries,
  getDistricts,
  getProvinces,
  getTowns,
} from "@/lib/address-data";
import { createClient } from "@/lib/supabase/server";

type AddressLevel = "country" | "province" | "city" | "district" | "town";

const LEVELS: AddressLevel[] = ["country", "province", "city", "district", "town"];

function fallbackOptions(level: AddressLevel, params: Record<string, string>) {
  if (level === "country") return getCountries();
  if (level === "province") return getProvinces(params.country);
  if (level === "city") return getCities(params.country, params.province);
  if (level === "district") return getDistricts(params.country, params.province, params.city);
  return getTowns(params.country, params.province, params.city, params.district);
}

async function fetchDatabaseOptions(level: AddressLevel, parentCode: string | null) {
  const supabase = await createClient();

  const buildBaseQuery = () =>
    supabase
      .from("administrative_divisions")
      .select("code, name")
      .eq("level", level)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

  let query = buildBaseQuery();

  if (level === "country") {
    query = query.is("parent_code", null);
  } else if (parentCode) {
    query = query.eq("parent_code", parentCode);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (!error && data && data.length > 0) {
    return data.map((item) => ({
      value: item.code,
      label: item.name,
      code: item.code,
    }));
  }

  return [];
}

async function fetchDatabaseOptionsByParentName(level: AddressLevel, parentName: string | null) {
  if (!parentName || level === "country") return [];

  const supabase = await createClient();
  const { data: parents, error: parentError } = await supabase
    .from("administrative_divisions")
    .select("code")
    .eq("name", parentName);

  if (parentError || !parents || parents.length === 0) return [];

  const parentCodes = parents.map((parent) => parent.code);
  const { data, error } = await supabase
    .from("administrative_divisions")
    .select("code, name")
    .eq("level", level)
    .in("parent_code", parentCodes)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data || data.length === 0) return [];
  return data.map((item) => ({
    value: item.code,
    label: item.name,
    code: item.code,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLevel = searchParams.get("level") || "country";
  if (!LEVELS.includes(requestedLevel as AddressLevel)) {
    return NextResponse.json({ options: [] }, { status: 400 });
  }

  const level = requestedLevel as AddressLevel;
  const params = {
    country: searchParams.get("country") || "",
    province: searchParams.get("province") || "",
    city: searchParams.get("city") || "",
    district: searchParams.get("district") || "",
  };
  const parentCode = searchParams.get("parentCode");
  const parentNameByLevel: Record<AddressLevel, string> = {
    country: "",
    province: params.country,
    city: params.province,
    district: params.city,
    town: params.district,
  };
  const databaseOptions =
    (await fetchDatabaseOptions(level, parentCode)) ||
    [];
  const fallbackDatabaseOptions =
    databaseOptions.length > 0
      ? databaseOptions
      : await fetchDatabaseOptionsByParentName(level, parentNameByLevel[level]);

  return NextResponse.json({
    options: fallbackDatabaseOptions.length > 0 ? fallbackDatabaseOptions : fallbackOptions(level, params),
    source: fallbackDatabaseOptions.length > 0 ? "database" : "fallback",
  });
}
