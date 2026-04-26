"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { AlertCircle, Download, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FAMILY_SURNAME } from "@/lib/utils";
import { formatResidencePlace, hasStructuredResidence, validateRequiredResidence } from "./address-utils";
import { batchCreateFamilyMembers, type ImportMemberInput } from "./actions";

interface ImportMembersDialogProps {
  onSuccess?: () => void;
}

type ImportRow = Record<string, string | number | boolean | null | undefined>;

function readCell(row: ImportRow, key: string): string | null {
  const value = row[key];
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function ImportMembersDialog({ onSuccess }: ImportMembersDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [parsedData, setParsedData] = React.useState<ImportMemberInput[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = () => {
    setParsedData([]);
    setError(null);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetState();
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        姓名: `${FAMILY_SURNAME}某某`,
        世代: 20,
        排行: 1,
        父亲姓名: `${FAMILY_SURNAME}父名`,
        母亲姓名: "母亲名",
        性别: "男",
        官职: "进士",
        是否在世: "是",
        配偶: "王氏",
        生平事迹: "字某某",
        生日: "1990-01-01",
        国家: "中国",
        省份: "江苏省",
        城市: "苏州市",
        区县: "吴中区",
        乡镇: "木渎镇",
        详细地址: "某村某号",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "成员导入模板");
    XLSX.writeFile(wb, "族谱成员导入模板.xlsx");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const workbook = XLSX.read(readerEvent.target?.result, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet);
        const hasNewAddressHeaders = rows.some((row) =>
          ["国家", "省份", "城市", "区县", "乡镇", "详细地址"].some((key) =>
            Object.prototype.hasOwnProperty.call(row, key)
          )
        );

        if (rows.length === 0) {
          setError("文件中没有数据");
          return;
        }

        const formattedData = rows
          .map((row) => {
            const member: ImportMemberInput = {
              name: readCell(row, "姓名") || "",
              generation: readCell(row, "世代") ? Number(readCell(row, "世代")) : null,
              sibling_order: readCell(row, "排行") ? Number(readCell(row, "排行")) : null,
              father_name: readCell(row, "父亲姓名"),
              mother_name: readCell(row, "母亲姓名"),
              gender: (readCell(row, "性别") === "女" ? "女" : "男") as ImportMemberInput["gender"],
              official_position: readCell(row, "官职"),
              is_alive: readCell(row, "是否在世") === "否" ? false : true,
              spouse: readCell(row, "配偶"),
              remarks: readCell(row, "生平事迹") || readCell(row, "备注"),
              birthday: readCell(row, "生日"),
              residence_country: readCell(row, "国家"),
              residence_province: readCell(row, "省份"),
              residence_city: readCell(row, "城市"),
              residence_district: readCell(row, "区县"),
              residence_town: readCell(row, "乡镇"),
              residence_address: readCell(row, "详细地址"),
              residence_place: readCell(row, "居住地"),
            };
            member.residence_place = hasStructuredResidence(member)
              ? formatResidencePlace(member)
              : member.residence_place;
            return member;
          })
          .filter((member) => member.name);

        const invalidMember = formattedData.find((member) =>
          (hasNewAddressHeaders || hasStructuredResidence(member)) && validateRequiredResidence(member)
        );
        if (invalidMember) {
          setError(`${invalidMember.name} 缺少国家、省份、城市或区县`);
          setParsedData([]);
          return;
        }

        if (formattedData.length === 0) {
          setError("未找到有效的成员数据，请检查表头是否正确");
          setParsedData([]);
          return;
        }

        setParsedData(formattedData);
      } catch (err) {
        console.error(err);
        setError("解析文件失败，请确保文件格式正确");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setIsLoading(true);
    const result = await batchCreateFamilyMembers(parsedData);
    setIsLoading(false);

    if (result.success) {
      alert(`成功导入 ${result.count} 条记录`);
      setIsOpen(false);
      onSuccess?.();
    } else {
      setError(`导入失败: ${result.error}`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          批量导入
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>批量导入成员</DialogTitle>
          <DialogDescription>
            下载模板并填写数据后上传，支持 Excel (.xlsx, .xls) 和 CSV 格式。国家、省份、城市、区县为必填。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="secondary" onClick={handleDownloadTemplate} size="sm">
              <Download className="mr-2 h-4 w-4" />
              下载模板
            </Button>
            <div className="flex-1">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>错误</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {parsedData.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between bg-muted p-2 text-sm text-muted-foreground">
                <span>预览 ({parsedData.length} 条记录)</span>
                {parsedData.some((member) => member.father_name || member.mother_name) && (
                  <span className="flex items-center text-xs text-amber-600">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    父母姓名将自动匹配现有数据库，匹配失败则留空
                  </span>
                )}
              </div>
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>世代</TableHead>
                      <TableHead>父亲姓名</TableHead>
                      <TableHead>母亲姓名</TableHead>
                      <TableHead>性别</TableHead>
                      <TableHead>生日</TableHead>
                      <TableHead>居住地</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((member, index) => (
                      <TableRow key={`${member.name}-${index}`}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.generation}</TableCell>
                        <TableCell className={member.father_name ? "text-primary" : "text-muted-foreground"}>
                          {member.father_name || "-"}
                        </TableCell>
                        <TableCell className={member.mother_name ? "text-primary" : "text-muted-foreground"}>
                          {member.mother_name || "-"}
                        </TableCell>
                        <TableCell>{member.gender}</TableCell>
                        <TableCell>{member.birthday || "-"}</TableCell>
                        <TableCell>{formatResidencePlace(member) || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={parsedData.length === 0 || isLoading}>
            {isLoading ? "处理中..." : "确认导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
