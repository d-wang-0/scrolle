// localStorage that never throws: it can be missing, blocked or full (private windows, quota), and nothing
// here is worth failing over, so a read comes back empty and a write is dropped.

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered.
  }
}

export function removeText(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}

/** The stored value, or null when there is none or it is not JSON. It is not checked: validate what you read. */
export function readJson<T>(key: string): T | null {
  const text = readText(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeText(key, JSON.stringify(value));
  } catch {
    // Not serialisable: not remembered.
  }
}
