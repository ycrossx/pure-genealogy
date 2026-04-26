"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Check, ChevronsUpDown } from "lucide-react";
import type { FamilyMember } from "./actions";
import {
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMembers,
  fetchAllMembersForSelect,
  fetchFemaleMembersForSelect,
  fetchMemberById,
} from "./actions";
import { ImportMembersDialog } from "./import-members-dialog";
import { FatherCombobox } from "./father-combobox";
import { RichTextEditor } from "@/components/rich-text/editor";
import { RichTextViewer } from "@/components/rich-text/viewer";
import { cn } from "@/lib/utils";
import { formatResidencePlace, hasStructuredResidence, validateRequiredResidence } from "./address-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Main interactive table for CRUD:
// - search + pagination
// - batch selection + delete
// - add/edit dialog
// - biography rich-text preview
interface FamilyMembersTableProps {
  initialData: FamilyMember[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  searchQuery: string;
}

interface AddressOption {
  value: string;
  label: string;
  code?: string;
}

type AddressLevel = "country" | "province" | "city" | "district" | "town";

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
  clearable,
}: {
  value: string;
  placeholder: string;
  options: AddressOption[];
  selectedLabel?: string;
  disabled?: boolean;
  clearable?: boolean;
  onChange: (option: AddressOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selectOptions = React.useMemo(
    () => withSelectedOption(options, value, selectedLabel || value),
    [options, selectedLabel, value]
  );

  const selectedOption = React.useMemo(
    () => selectOptions.find((option) => option.value === value) || null,
    [selectOptions, value]
  );

  const filteredOptions = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return selectOptions;

    return selectOptions.filter((option) => {
      const label = option.label.toLowerCase();
      const optionValue = option.value.toLowerCase();
      const code = option.code?.toLowerCase() || "";
      return label.includes(keyword) || optionValue.includes(keyword) || code.includes(keyword);
    });
  }, [query, selectOptions]);

  const selectOption = (option: AddressOption | null) => {
    onChange(option);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[100] w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b p-2">
          <div className="flex items-center rounded-md border px-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${placeholder.replace(" *", "")}`}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {clearable && value && (
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
                className={cn(
                  "w-full justify-start gap-2 font-normal",
                  option.value === value && "bg-accent"
                )}
                onClick={() => selectOption(option)}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FamilyMembersTable({
  initialData,
  totalCount,
  currentPage,
  pageSize,
  searchQuery,
}: FamilyMembersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // Local UI states for selection, dialogs, loading flags, and form editing.
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(searchQuery);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoadingParents, setIsLoadingParents] = React.useState(false);
  const [loadingFatherId, setLoadingFatherId] = React.useState<number | null>(null);
  const [loadingMotherId, setLoadingMotherId] = React.useState<number | null>(null);

  const [editingMember, setEditingMember] = React.useState<FamilyMember | null>(null);
  const [biographyMember, setBiographyMember] = React.useState<FamilyMember | null>(null);
  const [parentOptions, setParentOptions] = React.useState<
    { id: number; name: string; generation: number | null }[]
  >([]);
  const [motherOptions, setMotherOptions] = React.useState<
    { id: number; name: string; generation: number | null }[]
  >([]);
  const [countryOptions, setCountryOptions] = React.useState<AddressOption[]>([]);
  const [provinceOptions, setProvinceOptions] = React.useState<AddressOption[]>([]);
  const [cityOptions, setCityOptions] = React.useState<AddressOption[]>([]);
  const [districtOptions, setDistrictOptions] = React.useState<AddressOption[]>([]);
  const [townOptions, setTownOptions] = React.useState<AddressOption[]>([]);

  // 新增表单状态
  const [formData, setFormData] = React.useState({
    name: "",
    generation: "",
    sibling_order: "",
    father_id: "",
    mom_id: "",
    gender: "",
    official_position: "",
    is_alive: true,
    spouse: "",
    remarks: "",
    birthday: "",
    death_date: "",
    residence_place: "",
    residence_country: "中国",
    residence_country_code: "CN",
    residence_province: "",
    residence_province_code: "",
    residence_city: "",
    residence_city_code: "",
    residence_district: "",
    residence_district_code: "",
    residence_town: "",
    residence_town_code: "",
    residence_address: "",
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  // 判断是否为编辑模式
  const isEditMode = editingMember !== null;

  // 加载父亲选择列表
  React.useEffect(() => {
    if (isDialogOpen) {
      setIsLoadingParents(true);
      Promise.all([fetchAllMembersForSelect(), fetchFemaleMembersForSelect()])
        .then(([parents, mothers]) => {
          setParentOptions(parents);
          setMotherOptions(mothers);
        })
        .finally(() => setIsLoadingParents(false));
    }
  }, [isDialogOpen]);

  React.useEffect(() => {
    if (!isDialogOpen) return;
    fetchAddressOptions("country").then(setCountryOptions);
  }, [isDialogOpen]);

  React.useEffect(() => {
    if (!isDialogOpen || !formData.residence_country) {
      setProvinceOptions([]);
      return;
    }

    fetchAddressOptions("province", {
      country: formData.residence_country,
      parentCode: formData.residence_country_code,
    }).then(setProvinceOptions);
  }, [isDialogOpen, formData.residence_country, formData.residence_country_code]);

  React.useEffect(() => {
    if (!isDialogOpen || !formData.residence_country || !formData.residence_province) {
      setCityOptions([]);
      return;
    }

    fetchAddressOptions("city", {
      country: formData.residence_country,
      province: formData.residence_province,
      parentCode: formData.residence_province_code,
    }).then(setCityOptions);
  }, [isDialogOpen, formData.residence_country, formData.residence_province, formData.residence_province_code]);

  React.useEffect(() => {
    if (
      !isDialogOpen ||
      !formData.residence_country ||
      !formData.residence_province ||
      !formData.residence_city
    ) {
      setDistrictOptions([]);
      return;
    }

    fetchAddressOptions("district", {
      country: formData.residence_country,
      province: formData.residence_province,
      city: formData.residence_city,
      parentCode: formData.residence_city_code,
    }).then(setDistrictOptions);
  }, [isDialogOpen, formData.residence_country, formData.residence_province, formData.residence_city, formData.residence_city_code]);

  React.useEffect(() => {
    if (
      !isDialogOpen ||
      !formData.residence_country ||
      !formData.residence_province ||
      !formData.residence_city ||
      !formData.residence_district
    ) {
      setTownOptions([]);
      return;
    }

    fetchAddressOptions("town", {
      country: formData.residence_country,
      province: formData.residence_province,
      city: formData.residence_city,
      district: formData.residence_district,
      parentCode: formData.residence_district_code,
    }).then(setTownOptions);
  }, [
    isDialogOpen,
    formData.residence_country,
    formData.residence_province,
    formData.residence_city,
    formData.residence_district,
    formData.residence_district_code,
  ]);

  const updateUrlParams = (params: Record<string, string>) => {
    // Keep search/pagination in URL so page state is shareable and reload-safe.
    startTransition(() => {
      const newParams = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      });
      router.push(`/family-tree?${newParams.toString()}`);
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ search: searchInput, page: "1" });
  };

  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage.toString() });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(initialData.map((m) => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedIds.size} 条记录吗？`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    const result = await deleteFamilyMembers(Array.from(selectedIds));
    setIsDeleting(false);

    if (result.success) {
      setSelectedIds(new Set());
      router.refresh();
    } else {
      alert(`删除失败: ${result.error}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      generation: "",
      sibling_order: "",
      father_id: "",
      mom_id: "",
      gender: "",
      official_position: "",
      is_alive: true,
      spouse: "",
      remarks: "",
      birthday: "",
      death_date: "",
      residence_place: "",
      residence_country: "中国",
      residence_country_code: "CN",
      residence_province: "",
      residence_province_code: "",
      residence_city: "",
      residence_city_code: "",
      residence_district: "",
      residence_district_code: "",
      residence_town: "",
      residence_town_code: "",
      residence_address: "",
    });
    setEditingMember(null);
  };

  // 打开新增弹窗
  const handleOpenAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // 打开编辑弹窗
  const handleOpenEditDialog = (member: FamilyMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      generation: member.generation?.toString() ?? "",
      sibling_order: member.sibling_order?.toString() ?? "",
      father_id: member.father_id?.toString() ?? "null",
      mom_id: member.mom_id?.toString() ?? "null",
      gender: member.gender ?? "",
      official_position: member.official_position ?? "",
      is_alive: member.is_alive,
      spouse: member.spouse ?? "",
      remarks: member.remarks ?? "",
      birthday: member.birthday ?? "",
      death_date: member.death_date ?? "",
      residence_place: member.residence_place ?? "",
      residence_country: member.residence_country ?? "",
      residence_country_code: member.residence_country_code ?? "",
      residence_province: member.residence_province ?? "",
      residence_province_code: member.residence_province_code ?? "",
      residence_city: member.residence_city ?? "",
      residence_city_code: member.residence_city_code ?? "",
      residence_district: member.residence_district ?? "",
      residence_district_code: member.residence_district_code ?? "",
      residence_town: member.residence_town ?? "",
      residence_town_code: member.residence_town_code ?? "",
      residence_address: member.residence_address ?? "",
    });
    setIsDialogOpen(true);
  };

  // 关闭弹窗
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const handleSubmitMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("请输入姓名");
      return;
    }

    const residenceError = validateRequiredResidence(formData);
    if (residenceError) {
      alert(residenceError);
      return;
    }

    setIsSubmitting(true);
    const residencePlace = formatResidencePlace(formData);

    // Convert string form fields into the server action payload shape.
    const memberData = {
      name: formData.name.trim(),
      generation: formData.generation ? parseInt(formData.generation) : null,
      sibling_order: formData.sibling_order
        ? parseInt(formData.sibling_order)
        : null,
      father_id: (formData.father_id && formData.father_id !== "null") 
        ? parseInt(formData.father_id) 
        : null,
      mom_id: (formData.mom_id && formData.mom_id !== "null")
        ? parseInt(formData.mom_id)
        : null,
      gender: (formData.gender as "男" | "女") || null,
      official_position: formData.official_position || null,
      is_alive: formData.is_alive,
      spouse: formData.spouse || null,
      remarks: formData.remarks || null,
      birthday: formData.birthday || null,
      death_date: (!formData.is_alive && formData.death_date) ? formData.death_date : null,
      residence_place: residencePlace,
      residence_country: formData.residence_country.trim(),
      residence_country_code: formData.residence_country_code.trim() || null,
      residence_province: formData.residence_province.trim(),
      residence_province_code: formData.residence_province_code.trim() || null,
      residence_city: formData.residence_city.trim(),
      residence_city_code: formData.residence_city_code.trim() || null,
      residence_district: formData.residence_district.trim(),
      residence_district_code: formData.residence_district_code.trim() || null,
      residence_town: formData.residence_town.trim() || null,
      residence_town_code: formData.residence_town_code.trim() || null,
      residence_address: formData.residence_address.trim() || null,
    };

    const result = isEditMode && editingMember
      ? await updateFamilyMember({ ...memberData, id: editingMember.id })
      : await createFamilyMember(memberData);

    setIsSubmitting(false);

    if (result.success) {
      handleCloseDialog();
      router.refresh();
    } else {
      alert(`${isEditMode ? "更新" : "添加"}失败: ${result.error}`);
    }
  };

  const allSelected =
    initialData.length > 0 && selectedIds.size === initialData.length;

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        {/* 搜索 */}
        <form onSubmit={handleSearch} className="flex gap-2 w-full lg:w-auto">
          <Input
            placeholder="搜索姓名..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full sm:w-64"
          />
          <Button type="submit" variant="outline" size="icon" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {/* 操作按钮 */}
        <div className="flex gap-2 flex-wrap w-full lg:w-auto">
          <ImportMembersDialog onSuccess={() => router.refresh()} />
          
          <Button onClick={handleOpenAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            新增
          </Button>

          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={selectedIds.size === 0 || isDeleting}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            删除 {selectedIds.size > 0 && `(${selectedIds.size})`}
          </Button>
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent 
          className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 gap-0"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{isEditMode ? "编辑成员" : "新增成员"}</DialogTitle>
            <DialogDescription>
              填写成员信息后点击保存
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmitMember} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-4">
                {/* 姓名 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    姓名 *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="col-span-3"
                    required
                  />
                </div>

                {/* 父亲 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="father_id" className="text-right">
                    父亲
                  </Label>
                  <div className="col-span-3">
                    <FatherCombobox
                      value={formData.father_id}
                      options={parentOptions}
                      isLoading={isLoadingParents}
                      onChange={(value) => {
                        const father = parentOptions.find(p => p.id.toString() === value);
                        const newGeneration = father && father.generation !== null 
                          ? (father.generation + 1).toString() 
                          : (value === "null" ? "" : formData.generation);
                        setFormData({ 
                          ...formData, 
                          father_id: value, 
                          generation: newGeneration 
                        });
                      }}
                    />
                  </div>
                </div>

                {/* 母亲 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="mom_id" className="text-right">
                    母亲
                  </Label>
                  <div className="col-span-3">
                    <FatherCombobox
                      value={formData.mom_id}
                      options={motherOptions}
                      isLoading={isLoadingParents}
                      placeholder="选择母亲..."
                      searchPlaceholder="搜索母亲姓名或世代..."
                      onChange={(value) => {
                        setFormData({
                          ...formData,
                          mom_id: value,
                        });
                      }}
                    />
                  </div>
                </div>

                {/* 世代 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="generation" className="text-right">
                    世代
                  </Label>
                  <Input
                    id="generation"
                    type="number"
                    value={formData.generation}
                    onChange={(e) =>
                      setFormData({ ...formData, generation: e.target.value })
                    }
                    className="col-span-3"
                    disabled={!!formData.father_id && formData.father_id !== "null"}
                  />
                </div>

                {/* 排行 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sibling_order" className="text-right">
                    排行
                  </Label>
                  <Input
                    id="sibling_order"
                    type="number"
                    value={formData.sibling_order}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sibling_order: e.target.value,
                      })
                    }
                    className="col-span-3"
                  />
                </div>

                {/* 性别 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="gender" className="text-right">
                    性别
                  </Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) =>
                      setFormData({ ...formData, gender: value })
                    }
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="选择性别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="男">男</SelectItem>
                      <SelectItem value="女">女</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 生日 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="birthday" className="text-right">
                    生日
                  </Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={(e) =>
                      setFormData({ ...formData, birthday: e.target.value })
                    }
                    className="col-span-3"
                  />
                </div>

                {/* 居住地 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">
                    居住地
                  </Label>
                  <div className="col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <AddressSelect
                      value={formData.residence_country_code || formData.residence_country}
                      selectedLabel={formData.residence_country}
                      placeholder="国家 *"
                      options={countryOptions}
                      onChange={(option) =>
                        setFormData({
                          ...formData,
                          residence_country: option?.label || "",
                          residence_country_code: option?.code || option?.value || "",
                          residence_province: "",
                          residence_province_code: "",
                          residence_city: "",
                          residence_city_code: "",
                          residence_district: "",
                          residence_district_code: "",
                          residence_town: "",
                          residence_town_code: "",
                        })
                      }
                    />
                    <AddressSelect
                      value={formData.residence_province_code || formData.residence_province}
                      selectedLabel={formData.residence_province}
                      placeholder="省份 *"
                      options={provinceOptions}
                      disabled={!formData.residence_country}
                      onChange={(option) =>
                        setFormData({
                          ...formData,
                          residence_province: option?.label || "",
                          residence_province_code: option?.code || option?.value || "",
                          residence_city: "",
                          residence_city_code: "",
                          residence_district: "",
                          residence_district_code: "",
                          residence_town: "",
                          residence_town_code: "",
                        })
                      }
                    />
                    <AddressSelect
                      value={formData.residence_city_code || formData.residence_city}
                      selectedLabel={formData.residence_city}
                      placeholder="城市 *"
                      options={cityOptions}
                      disabled={!formData.residence_province}
                      onChange={(option) =>
                        setFormData({
                          ...formData,
                          residence_city: option?.label || "",
                          residence_city_code: option?.code || option?.value || "",
                          residence_district: "",
                          residence_district_code: "",
                          residence_town: "",
                          residence_town_code: "",
                        })
                      }
                    />
                    <AddressSelect
                      value={formData.residence_district_code || formData.residence_district}
                      selectedLabel={formData.residence_district}
                      placeholder="区县 *"
                      options={districtOptions}
                      disabled={!formData.residence_city}
                      onChange={(option) =>
                        setFormData({
                          ...formData,
                          residence_district: option?.label || "",
                          residence_district_code: option?.code || option?.value || "",
                          residence_town: "",
                          residence_town_code: "",
                        })
                      }
                    />
                    <AddressSelect
                      value={formData.residence_town_code || formData.residence_town}
                      selectedLabel={formData.residence_town}
                      placeholder="乡镇"
                      options={townOptions}
                      disabled={!formData.residence_district}
                      clearable
                      onChange={(option) => {
                        const nextTown = option?.label || "";
                        const nextTownCode = option?.code || option?.value || "";
                        setFormData((current) => ({
                          ...current,
                          residence_town: nextTown,
                          residence_town_code: nextTownCode,
                        }));
                      }}
                    />
                    <Input
                      id="residence_address"
                      placeholder="详细地址"
                      value={formData.residence_address}
                      onChange={(e) => setFormData({ ...formData, residence_address: e.target.value })}
                    />
                    {formData.residence_place && !hasStructuredResidence(formData) && (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        历史居住地：{formData.residence_place}
                      </p>
                    )}
                  </div>
                </div>

                {/* 官职 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="official_position" className="text-right">
                    官职
                  </Label>
                  <Input
                    id="official_position"
                    value={formData.official_position}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        official_position: e.target.value,
                      })
                    }
                    className="col-span-3"
                  />
                </div>

                {/* 是否在世 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="is_alive" className="text-right">
                    是否在世
                  </Label>
                  <div className="col-span-3 flex items-center space-x-2">
                    <Checkbox
                      id="is_alive"
                      checked={formData.is_alive}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          is_alive: checked as boolean,
                        })
                      }
                    />
                    <Label htmlFor="is_alive" className="font-normal">
                      在世
                    </Label>
                  </div>
                </div>

                {/* 卒年 (仅去世可选) */}
                {!formData.is_alive && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="death_date" className="text-right">
                      卒年
                    </Label>
                    <Input
                      id="death_date"
                      type="date"
                      value={formData.death_date}
                      onChange={(e) =>
                        setFormData({ ...formData, death_date: e.target.value })
                      }
                      className="col-span-3"
                    />
                  </div>
                )}

                {/* 配偶 */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="spouse" className="text-right">
                    配偶
                  </Label>
                  <Input
                    id="spouse"
                    value={formData.spouse}
                    onChange={(e) =>
                      setFormData({ ...formData, spouse: e.target.value })
                    }
                    className="col-span-3"
                  />
                </div>

                {/* 备注 / 生平事迹 */}
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="remarks" className="text-right pt-2">
                    生平事迹
                  </Label>
                  <div className="col-span-3">
                    <RichTextEditor
                      value={formData.remarks}
                      onChange={(value) =>
                        setFormData({ ...formData, remarks: value })
                      }
                      maxLength={500}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter className="px-6 py-4 border-t mt-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 表格 */}
      <div className={cn("border rounded-lg transition-opacity duration-200", isPending && "opacity-60 pointer-events-none")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="全选"
                />
              </TableHead>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead className="w-20">世代</TableHead>
              <TableHead className="w-20">排行</TableHead>
              <TableHead className="w-24">父亲</TableHead>
              <TableHead className="w-24">母亲</TableHead>
              <TableHead className="w-16">性别</TableHead>
              <TableHead>生日</TableHead>
              <TableHead>卒年</TableHead>
              <TableHead>居住地</TableHead>
              <TableHead>官职</TableHead>
              <TableHead className="w-20">在世</TableHead>
              <TableHead>配偶</TableHead>
              <TableHead>生平事迹</TableHead>
              <TableHead className="w-44">更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={16} className="h-24 text-center">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((member) => (
                <TableRow
                  key={member.id}
                  data-state={selectedIds.has(member.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={(checked) =>
                        handleSelectOne(member.id, checked as boolean)
                      }
                      aria-label={`选择 ${member.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{member.id}</TableCell>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      onClick={() => handleOpenEditDialog(member)}
                      className="text-primary hover:underline cursor-pointer text-left"
                    >
                      {member.name}
                    </button>
                  </TableCell>
                  <TableCell>{member.generation ?? "-"}</TableCell>
                  <TableCell>{member.sibling_order ?? "-"}</TableCell>
                  <TableCell>
                    {member.father_id && member.father_name ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={loadingFatherId === member.father_id}
                          onClick={async () => {
                            if (!member.father_id) return;
                            setLoadingFatherId(member.father_id);
                            try {
                              const fatherData = await fetchMemberById(member.father_id);
                              if (fatherData) {
                                handleOpenEditDialog(fatherData);
                              }
                            } finally {
                              setLoadingFatherId(null);
                            }
                          }}
                          className={cn(
                            "text-primary hover:underline cursor-pointer text-left",
                            loadingFatherId === member.father_id && "opacity-70 cursor-wait"
                          )}
                        >
                          {member.father_name}
                        </button>
                        {loadingFatherId === member.father_id && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {member.mom_id && member.mom_name ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={loadingMotherId === member.mom_id}
                          onClick={async () => {
                            if (!member.mom_id) return;
                            setLoadingMotherId(member.mom_id);
                            try {
                              const motherData = await fetchMemberById(member.mom_id);
                              if (motherData) {
                                handleOpenEditDialog(motherData);
                              }
                            } finally {
                              setLoadingMotherId(null);
                            }
                          }}
                          className={cn(
                            "text-primary hover:underline cursor-pointer text-left",
                            loadingMotherId === member.mom_id && "opacity-70 cursor-wait"
                          )}
                        >
                          {member.mom_name}
                        </button>
                        {loadingMotherId === member.mom_id && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{member.gender ?? "-"}</TableCell>
                  <TableCell>
                    {member.birthday
                      ? (() => {
                          const [y, m, d] = member.birthday.split("-");
                          return `${y}年${m}月${d}日`;
                        })()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {member.death_date
                      ? (() => {
                          const [y, m, d] = member.death_date.split("-");
                          return `${y}年${m}月${d}日`;
                        })()
                      : "-"}
                  </TableCell>
                  <TableCell>{formatResidencePlace(member) ?? "-"}</TableCell>
                  <TableCell>{member.official_position ?? "-"}</TableCell>
                  <TableCell>{member.is_alive ? "是" : "否"}</TableCell>
                  <TableCell>{member.spouse ?? "-"}</TableCell>
                  <TableCell>
                    {member.remarks ? (
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0" 
                        onClick={() => setBiographyMember(member)}
                      >
                        查看
                      </Button>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(member.updated_at).toLocaleString("zh-CN")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
        <p className="text-sm text-muted-foreground">
          共 {totalCount} 条记录，第 {currentPage} / {totalPages || 1} 页
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isPending}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 生平事迹查看弹窗 */}
      <Dialog open={!!biographyMember} onOpenChange={(open) => !open && setBiographyMember(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{biographyMember?.name} 的生平事迹</DialogTitle>
          </DialogHeader>
          <div className="py-4">
             <RichTextViewer value={biographyMember?.remarks ?? null} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
