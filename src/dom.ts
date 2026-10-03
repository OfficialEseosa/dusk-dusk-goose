/** Update existing nodes so input composition, pointer capture and animations survive snapshots. */
export function patchDom(root: Element, html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  patchChildren(root, template.content);
}

function key(node: Node): string | null {
  if (!(node instanceof Element)) return null;
  const explicit =
    node.id ||
    node.getAttribute("data-testid") ||
    node.getAttribute("data-dom-key");
  if (explicit) return `${node.localName}:${explicit}`;
  const radio = node.getAttribute("data-radio");
  if (radio) return `radio:${radio}`;
  const baseClass = node.getAttribute("class")?.split(/\s+/)[0];
  return `${node.localName}:${baseClass ?? ""}`;
}

function compatible(a: Node, b: Node): boolean {
  return a.nodeType === b.nodeType && key(a) === key(b);
}

function patchChildren(current: Node, desired: Node) {
  let cursor = current.firstChild;
  for (const next of Array.from(desired.childNodes)) {
    let match = cursor;
    while (match && !compatible(match, next)) match = match.nextSibling;
    if (!match) {
      const inserted = next.cloneNode(true);
      current.insertBefore(inserted, cursor);
      continue;
    }
    // Remove obsolete preceding nodes rather than moving a focused/captured node.
    while (cursor && cursor !== match) {
      const obsolete = cursor;
      cursor = cursor.nextSibling;
      current.removeChild(obsolete);
    }
    patchNode(match, next);
    cursor = match.nextSibling;
  }
  while (cursor) {
    const obsolete = cursor;
    cursor = cursor.nextSibling;
    current.removeChild(obsolete);
  }
}

function patchNode(current: Node, desired: Node) {
  if (current instanceof Element && desired instanceof Element) {
    for (const attr of Array.from(current.attributes)) {
      if (!desired.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    }
    for (const attr of Array.from(desired.attributes)) {
      if (current.getAttribute(attr.name) !== attr.value)
        current.setAttribute(attr.name, attr.value);
    }
    // User-editable values belong to the user, not to a newly generated template.
    if (
      current instanceof HTMLInputElement &&
      current.readOnly &&
      desired instanceof HTMLInputElement
    )
      if (current.value !== desired.value) current.value = desired.value;
    patchChildren(current, desired);
  } else if (current.nodeValue !== desired.nodeValue) {
    current.nodeValue = desired.nodeValue;
  }
}
