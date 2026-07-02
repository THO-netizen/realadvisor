// Sdílený typ metadat pro všechny portálové adaptéry.
// Kompatibilní s UpsertInput z listings-store.ts.

export interface PortalMetadata {
  externalId: string;
  title: string;
  price: number;
  pricePerM2: number | null;
  disposition: string | null;
  usableArea: number | null;
  municipality: string | null;
  addressText: string | null;
  sourceUrl: string;
  gpsLat: number | null;
  gpsLng: number | null;
  ownershipType: "OV" | "DV" | "OTHER" | null;
  condition: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel: string | null;
  floor: number | null;
  totalFloors: number | null;
  /** true = získali jsme pouze základní data z URL nebo nekompletní HTML */
  isPartial: boolean;
}

export type PortalSource =
  | "sreality"
  | "bezrealitky"
  | "idnes"
  | "bazos"
  | "unknown";
