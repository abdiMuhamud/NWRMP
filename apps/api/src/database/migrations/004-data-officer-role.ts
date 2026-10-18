// HQ data officer: registers and edits sources in every region (changes still go for approval).
export const sql = /* sql */ `
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'data_officer';
`;
