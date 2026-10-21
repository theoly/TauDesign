import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { icons } from 'lucide-react';

/** Render a bundled icon definition only, never the source initialization script. */
export function importedLucideSvg(name: string): string | undefined {
  const key = name.split('-').map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join('');
  if (!Object.hasOwn(icons, key)) return;
  return renderToStaticMarkup(createElement(icons[key as keyof typeof icons]));
}
