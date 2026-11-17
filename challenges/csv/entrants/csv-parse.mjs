// Scout's pick for `csv` on Node.
import { parse as parseCsv } from 'csv-parse/sync';

export const parse = text => parseCsv(text, { columns: true, skip_empty_lines: true, bom: true });
