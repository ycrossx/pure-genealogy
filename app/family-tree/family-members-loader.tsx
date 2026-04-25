import { fetchFamilyMembers } from "./actions";
import { FamilyMembersTable } from "./family-members-table";

interface FamilyMembersLoaderProps {
  // Pagination + search are computed by the page server component.
  page: number;
  pageSize: number;
  search: string;
}

export async function FamilyMembersLoader({
  page,
  pageSize,
  search,
}: FamilyMembersLoaderProps) {
  // Fetch happens on the server to avoid exposing direct DB credentials/client logic.
  const { data, count, error } = await fetchFamilyMembers(page, pageSize, search);

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
        <p>加载数据失败: {error}</p>
      </div>
    );
  }

  return (
    <FamilyMembersTable
      initialData={data}
      totalCount={count}
      currentPage={page}
      pageSize={pageSize}
      searchQuery={search}
    />
  );
}
