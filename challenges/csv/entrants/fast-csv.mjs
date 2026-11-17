// Scout's pick for `csv parser` on Node. It streams, so collect the rows.
import { parseString } from 'fast-csv';

export const parse = text => new Promise((resolve, reject) => {
  const rows = [];
  parseString(text, { headers: true, ignoreEmpty: true })
    .on('error', reject)
    .on('data', row => rows.push(row))
    .on('end', () => resolve(rows));
});
