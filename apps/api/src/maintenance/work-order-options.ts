// Problem types and priorities for maintenance work orders.

export const WORK_ORDER_CATEGORIES = [
  { code: 'pump', label: 'Pump' },
  { code: 'power', label: 'Generator or power supply' },
  { code: 'solar', label: 'Solar system' },
  { code: 'pipeline', label: 'Pipeline, taps or kiosks' },
  { code: 'storage', label: 'Reservoir or tank' },
  { code: 'structure', label: 'Well, borehole or dam structure' },
  { code: 'other', label: 'Other' },
] as const;
export type WorkOrderCategory = (typeof WORK_ORDER_CATEGORIES)[number]['code'];
export const WORK_ORDER_CATEGORY_CODES = WORK_ORDER_CATEGORIES.map((c) => c.code) as WorkOrderCategory[];

export const WORK_ORDER_PRIORITIES = [
  { code: 'urgent', label: 'Urgent: no water for users' },
  { code: 'high', label: 'High' },
  { code: 'normal', label: 'Normal' },
  { code: 'low', label: 'Low' },
] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number]['code'];
export const WORK_ORDER_PRIORITY_CODES = WORK_ORDER_PRIORITIES.map((p) => p.code) as WorkOrderPriority[];

export const categoryLabel = (code: string) => WORK_ORDER_CATEGORIES.find((c) => c.code === code)?.label ?? code;
