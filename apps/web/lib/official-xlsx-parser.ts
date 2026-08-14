import {
  officialXlsxPlanProposalSchema,
  officialXlsxPlanItemSchema,
  type OfficialXlsxPlanItem,
  type OfficialXlsxPlanProposal,
  type OfficialXlsxPlanSession,
  type TrainingModality,
} from "@daygym/contracts";
import type { Sheet } from "read-excel-file/browser";

const maximumFileBytes = 2_097_152;
const maximumExpandedBytes = 12_582_912;
const maximumArchiveEntries = 200;
const requiredSheetName = "Treinos";

const expectedHeaders = [
  "Dia",
  "Sessão",
  "Ordem",
  "Exercício",
  "Tipo",
  "Séries",
  "Reps mín",
  "Reps máx",
  "Duração (s)",
  "Distância (m)",
  "Descanso (s)",
  "Circuito",
  "Observações",
] as const;
const optionalPlannedWeightHeader = "Carga (kg)";

type CellValue = string | number | boolean | Date | null;

export interface PlanImportIssue {
  readonly message: string;
  readonly row: number | null;
  readonly severity: "blocking" | "info" | "warning";
}

export interface ParsedOfficialXlsx {
  readonly issues: readonly PlanImportIssue[];
  readonly planName: string;
  readonly proposal: OfficialXlsxPlanProposal | null;
  readonly sessions: readonly OfficialXlsxPlanSession[];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function cellText(value: CellValue): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trustedCell(value: unknown): CellValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  return null;
}

function cellInteger(value: CellValue): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function optionalInteger(value: CellValue): number | null {
  return value === null || value === "" ? null : cellInteger(value);
}

function optionalDecimal(value: CellValue): number | null {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function modalityFromCell(value: CellValue): TrainingModality | null {
  const normalized = cellText(value);
  if (!normalized) {
    return null;
  }
  return (
    (
      {
        cardio: "cardio",
        circuito: "circuit",
        distancia: "distance",
        forca: "strength",
        tempo: "time",
      } as const
    )[normalizeText(normalized)] ?? null
  );
}

function sanitizedFileName(name: string): string {
  const clean = name
    .normalize("NFKC")
    .replace(/[\\/]/g, "-")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? "-" : character;
    })
    .join("")
    .trim();
  return clean.slice(Math.max(0, clean.length - 120));
}

export function defaultImportedPlanName(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `Treino - ${day}/${month}/${date.getFullYear()}`;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function inspectArchive(buffer: ArrayBuffer): Promise<PlanImportIssue[]> {
  const { strFromU8, unzipSync } = await import("fflate");
  let expandedBytes = 0;
  let entryCount = 0;
  const archive = unzipSync(new Uint8Array(buffer), {
    filter(entry) {
      entryCount += 1;
      expandedBytes += entry.originalSize;
      if (
        entryCount > maximumArchiveEntries ||
        expandedBytes > maximumExpandedBytes
      ) {
        throw new Error("expanded-limit");
      }
      return true;
    },
  });
  const paths = Object.keys(archive);
  if (
    !paths.includes("xl/workbook.xml") ||
    !paths.includes("[Content_Types].xml")
  ) {
    return [
      {
        message: "O arquivo não possui uma estrutura XLSX válida.",
        row: null,
        severity: "blocking",
      },
    ];
  }

  const unsafePath = paths.some(
    (path) =>
      path.includes("..") ||
      path.includes("\\") ||
      /(^|\/)vbaProject\.bin$/i.test(path) ||
      /^(xl\/(externalLinks|embeddings|drawings|activeX)\/|customXml\/)/i.test(
        path,
      ) ||
      /^xl\/connections\.xml$/i.test(path),
  );
  if (unsafePath) {
    return [
      {
        message: "A planilha contém macro, link externo ou objeto incorporado.",
        row: null,
        severity: "blocking",
      },
    ];
  }

  const xml = paths
    .filter((path) => path.endsWith(".xml") || path.endsWith(".rels"))
    .map((path) => {
      const entry = archive[path];
      return entry ? strFromU8(entry) : "";
    })
    .join("\n");
  if (/<f(?:\s|\/?>)/i.test(xml)) {
    return [
      {
        message: "Remova as fórmulas antes de importar.",
        row: null,
        severity: "blocking",
      },
    ];
  }
  if (
    /<hyperlink(?:\s|\/?>)/i.test(xml) ||
    /TargetMode=["']External["']/i.test(xml)
  ) {
    return [
      {
        message: "Remova os links externos antes de importar.",
        row: null,
        severity: "blocking",
      },
    ];
  }
  if (/<(?:workbook|sheet)Protection(?:\s|\/?>)/i.test(xml)) {
    return [
      {
        message: "Desproteja a planilha antes de importar.",
        row: null,
        severity: "blocking",
      },
    ];
  }
  return [];
}

function buildItem(
  row: readonly CellValue[],
  rowNumber: number,
  issues: PlanImportIssue[],
): OfficialXlsxPlanItem | null {
  const modality = modalityFromCell(row[4] ?? null);
  const rest = optionalInteger(row[10] ?? null);
  const candidate = {
    circuitGroup: cellText(row[11] ?? null),
    distanceMeters: optionalInteger(row[9] ?? null),
    durationSeconds: optionalInteger(row[8] ?? null),
    exerciseName: cellText(row[3] ?? null) ?? "",
    modality,
    notes: cellText(row[12] ?? null),
    order: cellInteger(row[2] ?? null),
    plannedWeightKg: optionalDecimal(row[13] ?? null),
    repsMax: optionalInteger(row[7] ?? null),
    repsMin: optionalInteger(row[6] ?? null),
    restSeconds: rest ?? 60,
    sets: cellInteger(row[5] ?? null),
  };
  if (rest === null) {
    issues.push({
      message: "Descanso vazio: será usado o padrão de 60 segundos.",
      row: rowNumber,
      severity: "warning",
    });
  }
  const parsed = officialXlsxPlanItemSchema.safeParse(candidate);
  if (!parsed.success) {
    issues.push({
      message: "Confira exercício, tipo, séries e medidas desta linha.",
      row: rowNumber,
      severity: "blocking",
    });
    return null;
  }
  return parsed.data;
}

export async function parseOfficialXlsxFile(
  file: File,
): Promise<ParsedOfficialXlsx> {
  const safeFileName = sanitizedFileName(file.name);
  const baseResult = {
    planName: defaultImportedPlanName(),
    sessions: [] as OfficialXlsxPlanSession[],
  };
  if (!safeFileName.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
    return {
      ...baseResult,
      issues: [
        {
          message: "Selecione um arquivo com extensão .xlsx.",
          row: null,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }
  if (file.size < 1 || file.size > maximumFileBytes) {
    return {
      ...baseResult,
      issues: [
        {
          message: "A planilha precisa ter no máximo 2 MB.",
          row: null,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }

  const buffer = await file.arrayBuffer();
  let securityIssues: PlanImportIssue[];
  try {
    securityIssues = await inspectArchive(buffer);
  } catch {
    return {
      ...baseResult,
      issues: [
        {
          message: "A planilha está danificada ou excede o limite de expansão.",
          row: null,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }
  if (securityIssues.length > 0) {
    return { ...baseResult, issues: securityIssues, proposal: null };
  }

  const { default: readXlsxFile } = await import("read-excel-file/browser");
  let sheets: Sheet<number>[];
  try {
    sheets = await readXlsxFile(buffer);
  } catch {
    return {
      ...baseResult,
      issues: [
        {
          message: "Não foi possível ler esta planilha.",
          row: null,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }
  const sheet = sheets.find(
    (candidate) => candidate.sheet === requiredSheetName,
  );
  if (!sheet) {
    return {
      ...baseResult,
      issues: [
        {
          message: 'A aba obrigatória "Treinos" não foi encontrada.',
          row: null,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }
  const [header, ...rows] = sheet.data.map((row) => row.map(trustedCell));
  const headerMatches =
    expectedHeaders.every(
      (expected, index) => cellText(header?.[index] ?? null) === expected,
    ) &&
    (header?.[13] === undefined ||
      header?.[13] === null ||
      cellText(header[13]) === optionalPlannedWeightHeader);
  if (!headerMatches) {
    return {
      ...baseResult,
      issues: [
        {
          message:
            "Os títulos da aba Treinos não correspondem ao modelo oficial.",
          row: 1,
          severity: "blocking",
        },
      ],
      proposal: null,
    };
  }

  const issues: PlanImportIssue[] = [];
  const sessions = new Map<
    number,
    { items: OfficialXlsxPlanItem[]; name: string }
  >();
  rows.forEach((row, index) => {
    if (row.every((cell) => cell === null || cell === "")) {
      return;
    }
    const rowNumber = index + 2;
    const dayOrder = cellInteger(row[0] ?? null);
    const sessionName = cellText(row[1] ?? null);
    if (dayOrder === null || dayOrder < 1 || dayOrder > 14 || !sessionName) {
      issues.push({
        message: "Informe um dia entre 1 e 14 e o nome da sessão.",
        row: rowNumber,
        severity: "blocking",
      });
      return;
    }
    const item = buildItem(row, rowNumber, issues);
    if (!item) {
      return;
    }
    const current = sessions.get(dayOrder);
    if (current && current.name !== sessionName) {
      issues.push({
        message: "O mesmo dia não pode ter dois nomes de sessão.",
        row: rowNumber,
        severity: "blocking",
      });
      return;
    }
    if (current?.items.some((candidate) => candidate.order === item.order)) {
      issues.push({
        message: "A ordem do exercício está repetida nesta sessão.",
        row: rowNumber,
        severity: "blocking",
      });
      return;
    }
    if (current) {
      current.items.push(item);
    } else {
      sessions.set(dayOrder, { items: [item], name: sessionName });
    }
  });

  const normalizedSessions = [...sessions.entries()]
    .sort(([first], [second]) => first - second)
    .map(([dayOrder, session]) => ({
      dayOrder,
      items: session.items.toSorted(
        (first, second) => first.order - second.order,
      ),
      name: session.name,
    }));
  const sourceSha256 = await sha256Hex(buffer);
  const candidate = {
    operationId: `plan-import:${crypto.randomUUID()}`,
    planName: baseResult.planName,
    sessions: normalizedSessions,
    sourceFileName: safeFileName,
    sourceSha256,
    sourceSizeBytes: file.size,
  };
  const proposal = officialXlsxPlanProposalSchema.safeParse(candidate);
  if (!proposal.success) {
    issues.push({
      message: "A planilha ultrapassa os limites do modelo oficial.",
      row: null,
      severity: "blocking",
    });
  }
  return {
    issues,
    planName: baseResult.planName,
    proposal: issues.some((issue) => issue.severity === "blocking")
      ? null
      : proposal.success
        ? proposal.data
        : null,
    sessions: normalizedSessions,
  };
}
