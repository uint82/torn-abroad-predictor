const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  settings: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 4.5v5M9 14.5v5'],
  key: ['M14.5 4.5a4.5 4.5 0 1 0-3.4 7.6L4 19.2V21h3l1-1v-2h2l1-1v-2h2l1.6-1.6', 'M16.5 8.5h.01'],
  refresh: ['M20 11a8 8 0 0 0-14.7-4M4 4v5h5', 'M4 13a8 8 0 0 0 14.7 4M20 20v-5h-5'],
  eye: [
    'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z',
    'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6',
    'M6.3 7.5A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 4-.9',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  close: ['M6 6l12 12M18 6L6 18'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  minus: ['M5 12h14'],
  info: ['M12 11v6', 'M12 7h.01', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  warning: ['M12 3l9.5 17h-19L12 3Z', 'M12 9v5', 'M12 17h.01'],
  check: ['M20 6L9 17l-5-5'],
} as const;

export type IconName = keyof typeof ICON_PATHS;

function svgNode(viewBox: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  return node;
}

function path(node: SVGSVGElement, data: string): void {
  const element = document.createElementNS(SVG_NS, 'path');
  element.setAttribute('d', data);
  node.append(element);
}

export function icon(name: IconName, size = 18): SVGSVGElement {
  const node = svgNode('0 0 24 24');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  for (const data of ICON_PATHS[name]) {
    path(node, data);
  }
  return node;
}

export function createLogo(): SVGSVGElement {
  const node = svgNode('0 0 64 64');
  node.setAttribute('class', 'brand-mark');
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', '64');
  background.setAttribute('height', '64');
  background.setAttribute('rx', '14');
  background.setAttribute('fill', '#0b0f14');
  node.append(background);
  for (const data of ['M12 46 L26 32 L36 40 L52 20', 'M42 20 H52 V30']) {
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', data);
    line.setAttribute('stroke', '#f4b41b');
    line.setAttribute('stroke-width', '5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    node.append(line);
  }
  return node;
}
