export type StaffingRow = {
  institute: string;
  instituteCode: string;
  personId: string;
  area: string;
  role: string;
  specialtyCode: string;
  period: string;
  month: string;
  weeklyHours: number;
};

export type PlannedRow = StaffingRow & {
  contractedHours: number;
  directHours: number;
  indirectHours: number;
  nasHours: number;
  directAttentions: number;
  indirectAttentions: number;
  totalAttentions: number;
  managementTarget: number;
  foja: number;
};

export type Parameters = {
  directPct: number;
  indirectPct: number;
  nasPct: number;
  groupPct: number;
  patientsPerGroup: number;
  managementTarget: number;
  standardMinutes: number;
  indirectMinutes: number;
  weeksPerMonth: number;
};

export type ValidationItem = {
  label: string;
  count: number;
  description: string;
};
