import { Service, Services } from './config';

type ServiceRecord = Record<string, unknown>;
const LINE_SEPARATOR = /\r?\n/;

export function parseServicesStatus(stdout?: string | Buffer): Services {
  const raw = stdoutToString(stdout);
  const trimmed = raw.trim();

  if (!trimmed) {
    return new Map();
  }

  const direct = safeJSONParse(trimmed);
  if (direct !== undefined) {
    const records = coerceServiceRecords(direct);
    if (records.length > 0) {
      return collectServices(records);
    }
  }

  const clippedPayload = clipJsonPayload(raw);
  if (clippedPayload) {
    const parsed = safeJSONParse(clippedPayload);
    if (parsed !== undefined) {
      const records = coerceServiceRecords(parsed);
      if (records.length > 0) {
        return collectServices(records);
      }
    }
  }

  const ndjsonRecords = parseNdjson(raw);
  return collectServices(ndjsonRecords);
}

function stdoutToString(stdout?: string | Buffer): string {
  if (!stdout) {
    return '';
  }
  return typeof stdout === 'string' ? stdout : stdout.toString('utf8');
}

function safeJSONParse(payload: string): unknown | undefined {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is ServiceRecord {
  return typeof value === 'object' && value !== null;
}

function coerceServiceRecords(payload: unknown): ServiceRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (isRecord(payload)) {
    const services = (payload as ServiceRecord)['services'];
    if (Array.isArray(services)) {
      return services.filter(isRecord);
    }
    if ('name' in payload) {
      return [payload];
    }
  }

  return [];
}

function clipJsonPayload(raw: string): string | undefined {
  for (const [startToken, endToken] of [['[', ']'], ['{', '}']] as const) {
    const start = raw.indexOf(startToken);
    const end = raw.lastIndexOf(endToken);
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = raw.slice(start, end + 1).trim();
      if (candidate) {
        return candidate;
      }
    }
  }
  return undefined;
}

function parseNdjson(raw: string): ServiceRecord[] {
  const records: ServiceRecord[] = [];
  for (const line of raw.split(LINE_SEPARATOR)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = safeJSONParse(trimmed);
    if (parsed === undefined) {
      continue;
    }
    const lineRecords = coerceServiceRecords(parsed);
    if (lineRecords.length > 0) {
      records.push(...lineRecords);
    }
  }
  return records;
}

function collectServices(records: ServiceRecord[]): Services {
  const services: Services = new Map();
  for (const record of records) {
    const service = coerceService(record);
    if (!service) {
      continue;
    }
    services.set(service.name, service);
  }
  return services;
}

function coerceService(record: ServiceRecord): Service | undefined {
  const nameValue = record['name'];
  if (typeof nameValue !== 'string' || nameValue.length === 0) {
    return undefined;
  }

  const statusValue = record['status'];
  const pidValue = record['pid'];

  const service: Service = {
    name: nameValue,
    status: typeof statusValue === 'string' && statusValue.length > 0 ? statusValue : 'Unknown',
    pid: typeof pidValue === 'number' ? pidValue : pidValue === null ? null : null,
  };

  if ('exit_code' in record) {
    const exitValue = record['exit_code'];
    service.exit_code = typeof exitValue === 'number'
      ? exitValue
      : exitValue === null
        ? null
        : service.exit_code;
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'name' || key === 'status' || key === 'pid' || key === 'exit_code') {
      continue;
    }
    service[key] = value;
  }

  return service;
}
