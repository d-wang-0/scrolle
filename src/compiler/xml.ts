// Small XML helpers over the browser's DOMParser.
// Kept dependency-free so the compiler can be unit-tested in jsdom/happy-dom
// or the real browser.

/** Parse an XML string into a Document, throwing on parse errors. */
export function parseXml(text: string, mime: DOMParserSupportedType = "application/xml"): Document {
  const doc = new DOMParser().parseFromString(text, mime);
  const err = doc.querySelector("parsererror");
  if (err) {
    throw new Error(`XML parse error: ${err.textContent?.trim() ?? "unknown"}`);
  }
  return doc;
}

/**
 * Get the first descendant element matching a local name, ignoring namespace
 * prefixes. EPUB files vary wildly in whether/how they declare namespaces, so
 * matching on localName is the pragmatic choice.
 */
export function firstByLocal(root: ParentNode, localName: string): Element | null {
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === localName) return el;
  }
  return null;
}

/** All descendant elements matching a local name (namespace-agnostic). */
export function allByLocal(root: ParentNode, localName: string): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === localName) out.push(el);
  }
  return out;
}

/** Direct element children matching a local name. */
export function childrenByLocal(parent: Element, localName: string): Element[] {
  return [...parent.children].filter((c) => c.localName === localName);
}

/** Read an attribute, trying a namespaced form by local name too. */
export function attr(el: Element, name: string): string | null {
  const direct = el.getAttribute(name);
  if (direct !== null) return direct;
  // Fall back to matching by local name (e.g. xlink:href).
  for (const a of el.attributes) {
    if (a.localName === name) return a.value;
  }
  return null;
}
