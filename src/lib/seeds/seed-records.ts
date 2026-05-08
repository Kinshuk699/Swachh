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
  return parseCsvRows(csv).map((row) => ({
    name: required(row.name, "name"),
    region: required(row.region, "region"),
    proxyType: required(row.proxy_type, "proxy_type"),
    highwayContext: required(row.highway_context, "highway_context"),
    routeContext: required(row.route_context, "route_context"),
    localityHint: required(row.locality_hint, "locality_hint"),
    defaultConfidence: parseConfidence(row.default_confidence),
    notes: required(row.notes, "notes"),
  }));
}

export function buildGoogleSearchText(input: SearchTextInput): string {
  return [input.name, input.highwayContext, input.routeContext, input.localityHint, "India"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
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