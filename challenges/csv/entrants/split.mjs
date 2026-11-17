// The quick way: split the lines, split the commas.
export function parse(text) {
  const [header, ...lines] = text.trim().split('\n');
  const keys = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
}
