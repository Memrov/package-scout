// Scout's pick for `csv parser` in the browser.
import Papa from 'papaparse';

export const parse = text => Papa.parse(text, { header: true, skipEmptyLines: true }).data;
