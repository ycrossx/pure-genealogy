export interface ResidenceAddressFields {
  residence_country?: string | null;
  residence_country_code?: string | null;
  residence_province?: string | null;
  residence_province_code?: string | null;
  residence_city?: string | null;
  residence_city_code?: string | null;
  residence_district?: string | null;
  residence_district_code?: string | null;
  residence_town?: string | null;
  residence_town_code?: string | null;
  residence_address?: string | null;
  residence_place?: string | null;
}

export const REQUIRED_RESIDENCE_FIELDS = [
  "residence_country",
  "residence_province",
  "residence_city",
  "residence_district",
] as const;

export type RequiredResidenceField = (typeof REQUIRED_RESIDENCE_FIELDS)[number];

export function formatResidencePlace(address: ResidenceAddressFields): string | null {
  const parts = [
    address.residence_country,
    address.residence_province,
    address.residence_city,
    address.residence_district,
    address.residence_town,
    address.residence_address,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("") : address.residence_place?.trim() || null;
}

export function hasStructuredResidence(address: ResidenceAddressFields): boolean {
  return [
    address.residence_country,
    address.residence_province,
    address.residence_city,
    address.residence_district,
    address.residence_town,
    address.residence_address,
  ].some((part) => Boolean(part?.trim()));
}

export function validateRequiredResidence(address: ResidenceAddressFields): string | null {
  if (!address.residence_country?.trim()) return "请填写国家";
  if (!address.residence_province?.trim()) return "请填写省份";
  if (!address.residence_city?.trim()) return "请填写城市";
  if (!address.residence_district?.trim()) return "请填写区县";
  return null;
}

export function normalizeResidenceAddress<T extends ResidenceAddressFields>(address: T): T {
  return {
    ...address,
    residence_country: address.residence_country?.trim() || null,
    residence_country_code: address.residence_country_code?.trim() || null,
    residence_province: address.residence_province?.trim() || null,
    residence_province_code: address.residence_province_code?.trim() || null,
    residence_city: address.residence_city?.trim() || null,
    residence_city_code: address.residence_city_code?.trim() || null,
    residence_district: address.residence_district?.trim() || null,
    residence_district_code: address.residence_district_code?.trim() || null,
    residence_town: address.residence_town?.trim() || null,
    residence_town_code: address.residence_town_code?.trim() || null,
    residence_address: address.residence_address?.trim() || null,
    residence_place: formatResidencePlace(address),
  };
}
