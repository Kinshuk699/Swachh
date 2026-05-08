export type ProxyBrandRecord = {
  brandName: string;
  region: string;
  proxyType: string;
  defaultConfidence: number;
  notes: string;
};

export type CuratedStopRecord = {
  name: string;
  region: string;
  proxyType: string;
  highwayContext: string;
  routeContext: string;
  localityHint: string;
  defaultConfidence: number;
  notes: string;
};

type SearchTextInput = Pick<CuratedStopRecord, "name" | "highwayContext" | "routeContext" | "localityHint">;

export function parseProxyBrandCsv(csv: string): ProxyBrandRecord[] {
  return parseCsvRows(csv).map((row) => {
    required(row.default_confidence, "default_confidence");
    const defaultConfidence = parseConfidence(row.default_confidence);
    return {
      brandName: required(row.brand_name, "brand_name"),
      region: required(row.region, "region"),
      proxyType: required(row.proxy_type, "proxy_type"),
      defaultConfidence,
      notes: required(row.notes, "notes"),
    };
  });
}

export function parseCuratedStopCsv(csv: string): CuratedStopRecord[] {
  return parseCsvRows(csv).map((row) => {
    required(row.default_confidence, "default_confidence");
    return {
      name: required(row.name, "name"),
      region: required(row.region, "region"),
      proxyType: required(row.proxy_type, "proxy_type"),
      highwayContext: required(row.highway_context, "highway_context"),
      routeContext: required(row.route_context, "route_context"),
      localityHint: required(row.locality_hint, "locality_hint"),
      defaultConfidence: parseConfidence(row.default_confidence),
      notes: required(row.notes, "notes"),
    };
  });
}

export function buildGoogleSearchText(input: SearchTextInput): string {
  return [input.name, input.highwayContext, input.routeContext, input.localityHint, "India"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function parseCsvRows(csv: string): Record<string, string>[] {
  if (!csv || !csv.trim()) return [];
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  if (line == null) return [];
  const cells: string[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const ch = line[i];
    if (ch === ',') {
      // empty cell
      cells.push("");
      i++;
      continue;
    }

    if (ch === '"') {
      // quoted field
      i++;
      let field = "";
      let closed = false;
      while (i < len) {
        const c = line[i];
        if (c === '"') {
          // escaped quote?
          if (i + 1 < len && line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          // closing quote
          i++;
          closed = true;
          break;
        }
        field += c;
        i++;
      }

      if (!closed) {
        throw new Error('Unterminated quoted field in CSV line');
      }

      // skip optional spaces after closing quote
      while (i < len && line[i] === ' ') i++;

      // if next is comma, consume it
      if (i < len && line[i] === ',') i++;

      cells.push(field);
      continue;
    }

    // unquoted field
    let field = "";
    while (i < len && line[i] !== ',') {
      field += line[i];
      i++;
    }
    // consume comma
    if (i < len && line[i] === ',') i++;
    cells.push(field.trim());
  }

  return cells;
}

function parseConfidence(value: string): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("default_confidence must be between 0 and 1");
  }
  return confidence;
}

function required(value: string, field: string): string {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}