import type { Parameters, PlannedRow, StaffingRow, ValidationItem } from "./types";

export const MONTHS: Record<string, string> = {
  "Jan-26": "Enero",
  "Feb-26": "Febrero",
  "Mar-26": "Marzo",
  "Apr-26": "Abril",
  "May-26": "Mayo",
  "Jun-26": "Junio",
  "Jul-26": "Julio",
  "Aug-26": "Agosto",
  "Sep-26": "Septiembre",
  "Oct-26": "Octubre",
  "Nov-26": "Noviembre",
  "Dec-26": "Diciembre",
};

export const MONTH_ORDER = Object.keys(MONTHS);

const INSTITUTE_NAMES: Record<string, string> = {
  Ari: "Arica",
  Iqu: "Iquique",
  Ant: "Antofagasta",
  Cal: "Calama",
  Cop: "Copiapó",
  Coq: "Coquimbo",
  Val: "Valparaíso",
  OHi: "O'Higgins",
  Tal: "Talca",
  Con: "Concepción",
  Tem: "Temuco",
  PMo: "Puerto Montt",
  Coy: "Coyhaique",
  Vdv: "Valdivia",
  Cas: "Castro",
  San: "Santiago",
};

const GROUP_RULES: Record<string, [number, number]> = {
  ED: [0.55, 3],
  AS: [0.35, 3],
  UTA: [0.55, 3],
  ULAB: [0.55, 3],
  UTAC: [0.55, 3],
};

const DEFAULT_PARAMETERS: Parameters = {
  directPct: 0.6,
  indirectPct: 0.25,
  nasPct: 0.15,
  groupPct: 0.35,
  patientsPerGroup: 3,
  managementTarget: 0.9,
  standardMinutes: 30,
  indirectMinutes: 30,
  weeksPerMonth: 4.2,
};

export { DEFAULT_PARAMETERS };

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "")
    .replace(/�/g, "");
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

export function parseStaffingCsv(csv: string): StaffingRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("El reporte no contiene datos.");
  const rows = lines.slice(1).map(parseCsvRow);
  return rows
    .filter((row) => row[2] && row[2].toLowerCase() !== "personaid")
    .map((row) => {
      const period = normalizeText(row[7] ?? "");
      const instituteCode = normalizeText(row[1] ?? "");
      return {
        institute: INSTITUTE_NAMES[instituteCode] ?? instituteCode,
        instituteCode,
        personId: normalizeText(row[2] ?? ""),
        area: normalizeText(row[3] ?? "") || "Sin área informada",
        role: normalizeText(row[13] ?? "") || "Cargo no informado",
        specialtyCode: normalizeText(row[17] ?? "") || "Sin especialidad",
        period,
        month: MONTHS[period] ?? period,
        weeklyHours: Number.parseFloat(row[12] ?? "") || 0,
      };
    });
}

function distributionForRole(role: string): [number, number, number] {
  const normalized = role.toUpperCase();
  return ["DIRECTOR", "JEFE", "COORDINADOR"].some((token) =>
    normalized.includes(token),
  )
    ? [0.45, 0.2, 0.35]
    : [0.6, 0.25, 0.15];
}

export function calculatePlan(rows: StaffingRow[], parameters: Parameters): PlannedRow[] {
  return rows.map((row) => {
    const [roleDirect, roleIndirect, roleNas] = distributionForRole(row.role);
    const directPct = roleDirect === 0.6 ? parameters.directPct : roleDirect;
    const indirectPct = roleIndirect === 0.25 ? parameters.indirectPct : roleIndirect;
    const nasPct = roleNas === 0.15 ? parameters.nasPct : roleNas;
    const [groupPct, patientsPerGroup] =
      GROUP_RULES[row.specialtyCode] ?? [
        parameters.groupPct,
        parameters.patientsPerGroup,
      ];
    const contractedHours = row.weeklyHours * parameters.weeksPerMonth;
    const directHours = contractedHours * directPct;
    const indirectHours = contractedHours * indirectPct;
    const nasHours = contractedHours * nasPct;
    const directAttentions = Math.max(
      0,
      Math.floor(
        (directHours * 60) / parameters.standardMinutes *
          (1 + groupPct * (patientsPerGroup - 1)),
      ),
    );
    const indirectAttentions = Math.max(
      0,
      Math.floor((indirectHours * 60) / parameters.indirectMinutes),
    );
    const totalAttentions = directAttentions + indirectAttentions;
    return {
      ...row,
      contractedHours,
      directHours,
      indirectHours,
      nasHours,
      directAttentions,
      indirectAttentions,
      totalAttentions,
      managementTarget: Math.floor(totalAttentions * parameters.managementTarget),
      foja: contractedHours ? directHours / contractedHours : 0,
    };
  });
}

export function validateStaffing(rows: StaffingRow[]): ValidationItem[] {
  const seen = new Set<string>();
  let duplicates = 0;
  rows.forEach((row) => {
    const key = `${row.personId}-${row.period}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });
  return [
    {
      label: "Filas sin identificador",
      count: rows.filter((row) => !row.personId).length,
      description: "Cada fila mensual debe tener PersonaId.",
    },
    {
      label: "Horas inválidas",
      count: rows.filter((row) => row.weeklyHours < 0 || !Number.isFinite(row.weeklyHours)).length,
      description: "Las horas semanales deben ser numéricas y no negativas.",
    },
    {
      label: "Duplicados profesional-mes",
      count: duplicates,
      description: "No debe existir más de una fila por profesional y mes.",
    },
    {
      label: "Cargos sin especialidad",
      count: rows.filter((row) => row.specialtyCode === "Sin especialidad").length,
      description: "Revisar antes de aprobar la planificación.",
    },
  ];
}
