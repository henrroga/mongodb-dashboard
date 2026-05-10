function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: unclosed quoted field");
  }

  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function sanitizeForCsvCell(value) {
  const str = String(value);
  if (!str) return str;
  const startsDangerous = /^[=+\-@]/.test(str);
  return startsDangerous ? `'${str}` : str;
}

function toCsvRow(headers, doc) {
  return headers
    .map((h) => {
      const val = doc[h];
      if (val === null || val === undefined) return "";
      const raw = typeof val === "object" ? JSON.stringify(val) : String(val);
      const str = sanitizeForCsvCell(raw);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    })
    .join(",");
}

module.exports = {
  parseCsv,
  toCsvRow,
  sanitizeForCsvCell,
};
