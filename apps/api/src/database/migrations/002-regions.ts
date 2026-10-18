// Regions as used in the Ministry's national water-source summary.
// The list (and the district list) should be confirmed against the official
// administrative boundaries supplied by the GIS team.
export const sql = /* sql */ `
INSERT INTO regions (code, name, aliases) VALUES
  ('AW', 'Awdal',        '{}'),
  ('MJ', 'Maroodi Jeex', '{"Woqooyi Galbeed","Maroodi Jeeh","Marodi Jeh","Marodijeh"}'),
  ('SX', 'Saaxil',       '{"Saahil","Sahil"}'),
  ('SN', 'Sanaag',       '{}'),
  ('SL', 'Sool',         '{}'),
  ('TG', 'Togdheer',     '{"Toghdheer","Togdher"}')
ON CONFLICT (code) DO NOTHING;
`;
