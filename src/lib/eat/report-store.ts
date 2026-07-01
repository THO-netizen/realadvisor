// Úložiště EAT reportů — .data/eat-reports.json
// Stejný vzor jako listings-store.ts — nahradit Prisma při spuštění backendu

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { EATReport } from "./types";

const DATA_FILE = path.join(process.cwd(), ".data", "eat-reports.json");

function ensureDir(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadReports(): EATReport[] {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as EATReport[];
  } catch {
    return [];
  }
}

export function getReportById(id: string): EATReport | null {
  return loadReports().find((r) => r.id === id) ?? null;
}

export function saveReport(
  data: Omit<EATReport, "id" | "createdAt">
): EATReport {
  const reports = loadReports();
  const existing = reports.find((r) => r.sourceUrl === data.sourceUrl);

  if (existing) {
    Object.assign(existing, data);
    persist(reports);
    return existing;
  }

  const report: EATReport = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  reports.unshift(report);
  persist(reports);
  return report;
}

function persist(reports: EATReport[]): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2), "utf-8");
}
