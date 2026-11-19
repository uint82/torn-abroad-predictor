export type Child = Node | string | number | null | undefined | false;

type EventMap = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export interface ElementOptions {
  className?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  on?: EventMap;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.title !== undefined) {
    node.title = options.title;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [key, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[key] = value;
  }
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(type, handler as EventListener);
  }
  append(node, children);
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
}

export function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Missing element: ${selector}`);
  }
  return node;
}

export function listen(
  target: EventTarget,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}
