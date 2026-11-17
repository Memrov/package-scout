// The clever way: a lookahead that only splits on commas outside quotes.
const COMMA_OUTSIDE_QUOTES = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
const unquote = cell => cell.replace(/^"(.*)"$/s, '$1').replace(/""/g, '"');

export function parse(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(COMMA_OUTSIDE_QUOTES).map(unquote);
  return lines.map(line => Object.fromEntries(line.split(COMMA_OUTSIDE_QUOTES).map((cell, i) => [keys[i], unquote(cell)])));
}
