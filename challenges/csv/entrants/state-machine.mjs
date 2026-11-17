// The careful way: read one character at a time and track whether we are inside quotes.
// Written with RFC 4180 open, by someone who had already seen the test files.
export function parse(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let sawQuote = false;
  const endField = () => { row.push(field); field = ''; sawQuote = false; };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (char === '"' && field === '' && !sawQuote) {
      quoted = true;
      sawQuote = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || sawQuote || row.length) endRow();
  const [keys = [], ...records] = rows;
  return records.map(record => Object.fromEntries(keys.map((key, i) => [key, record[i] ?? ''])));
}
