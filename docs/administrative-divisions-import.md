# 全国地址数据导入说明

`/api/address` 会优先读取 Supabase 表 `administrative_divisions`，如果表不存在或没有数据，则回退到 `lib/address-data.ts` 的少量内置数据。

## 1. 先执行 SQL

在 Supabase SQL Editor 执行：

```sql
docs/family-member-address-fields.sql
```

这会创建：

- 成员地址 code 字段
- `administrative_divisions` 行政区划表
- 默认国家记录：中国，code 为 `CN`

## 2. 准备 JSON 数据

导入脚本接受 JSON 数组：

```json
[
  {
    "code": "CN",
    "name": "中国",
    "level": "country",
    "parent_code": null,
    "full_name": "中国",
    "sort_order": 1
  },
  {
    "code": "320000",
    "name": "江苏省",
    "level": "province",
    "parent_code": "CN",
    "full_name": "中国江苏省",
    "sort_order": 320000
  }
]
```

层级值固定为：

- `country`
- `province`
- `city`
- `district`
- `town`

## 3. 执行导入

需要服务端密钥，只在本地或可信服务器执行：

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-administrative-divisions.mjs divisions.json
```

不要把 `SUPABASE_SERVICE_ROLE_KEY` 提交到仓库。
