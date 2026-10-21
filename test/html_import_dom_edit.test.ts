import { describe, expect, test } from 'bun:test';
import { setTextByNid } from '../src/utils/textNode';
import { deleteElementByNid, duplicateElementByNid, patchElementByNid, wrapElementByNid } from '../src/utils/domPatcher';

const fragment = '<main data-nid="main0001"><section data-nid="card0001" class="source-card"><p data-nid="text0001">Original</p></section><aside data-nid="aside001">Sibling</aside></main>';
const documentHtml = '<!DOCTYPE html><html lang="zh-CN" data-page="imported"><head><title>Imported page</title><style id="source-styles">body.imported{margin:27px}.source-card{color:#123456}</style></head><body class="imported" style="margin:27px;background:#fdfdfd">' + fragment + '<style id="late-styles">.source-card{padding:19px}</style></body></html>';
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const operations: Array<{ name: string; run: (html: string) => string; inspect: (doc: Document) => void }> = [
  {
    name: 'text editing',
    run: html => {
      const result = setTextByNid(html, 'text0001', 'Updated <safe> text');
      expect(result).not.toBeNull();
      return result!;
    },
    inspect: doc => { expect(doc.querySelector('[data-nid="text0001"]')!.textContent).toBe('Updated <safe> text'); },
  },
  {
    name: 'element replacement',
    run: html => {
      const result = patchElementByNid(html, 'card0001', '<article class="changed"><h2>Replacement</h2></article>');
      expect(result.success).toBe(true);
      return result.html;
    },
    inspect: doc => {
      expect(doc.querySelector('[data-nid="card0001"]')!.localName).toBe('article');
      expect(doc.querySelector('h2')!.textContent).toBe('Replacement');
    },
  },
  {
    name: 'inner content replacement',
    run: html => {
      const result = patchElementByNid(html, 'card0001', 'Before <strong>After</strong>');
      expect(result.success).toBe(true);
      return result.html;
    },
    inspect: doc => {
      expect(doc.querySelector('[data-nid="card0001"]')!.localName).toBe('section');
      expect(doc.querySelector('[data-nid="card0001"]')!.textContent).toBe('Before After');
      expect(doc.querySelector('strong')!.getAttribute('data-nid')).toBeTruthy();
    },
  },
  {
    name: 'subtree deletion',
    run: html => {
      const result = deleteElementByNid(html, 'card0001');
      expect(result.success).toBe(true);
      expect(result.deletedNids).toEqual(['card0001', 'text0001']);
      return result.html;
    },
    inspect: doc => { expect(doc.querySelector('[data-nid="card0001"],[data-nid="text0001"]')).toBeNull(); },
  },
  {
    name: 'subtree duplication',
    run: html => {
      const result = duplicateElementByNid(html, 'card0001');
      expect(result.success).toBe(true);
      expect(result.newNid).not.toBe('card0001');
      return result.html;
    },
    inspect: doc => {
      const cards = [...doc.querySelectorAll('section')];
      expect(cards.length).toBe(2);
      expect(cards.map(card => card.textContent)).toEqual(['Original', 'Original']);
      const ids = [...doc.querySelectorAll('[data-nid]')].map(node => node.getAttribute('data-nid'));
      expect(new Set(ids).size).toBe(ids.length);
    },
  },
  {
    name: 'container wrapping',
    run: html => {
      const result = wrapElementByNid(html, 'card0001', 'row');
      expect(result.success).toBe(true);
      return result.html;
    },
    inspect: doc => {
      const card = doc.querySelector('[data-nid="card0001"]')!;
      expect(card.parentElement!.classList.contains('row')).toBe(true);
      expect(card.querySelector('[data-nid="text0001"]')!.textContent).toBe('Original');
    },
  },
];

describe('DOM editing keeps imported document and fragment shapes', () => {
  for (const operation of operations) {
    test(`${operation.name} retains complete document head, body attributes and source CSS order`, () => {
      const output = operation.run(documentHtml), doc = parse(output);
      expect(output.trimStart().toLowerCase().startsWith('<!doctype')).toBe(true);
      expect(doc.documentElement.getAttribute('lang')).toBe('zh-CN');
      expect(doc.documentElement.getAttribute('data-page')).toBe('imported');
      expect(doc.title).toBe('Imported page');
      expect(doc.head.querySelector('#source-styles')!.textContent).toBe('body.imported{margin:27px}.source-card{color:#123456}');
      expect(doc.body.className).toBe('imported');
      expect(doc.body.style.margin).toBe('27px');
      expect(doc.body.style.background).toBe('#fdfdfd');
      expect(doc.body.querySelector('#late-styles')!.textContent).toBe('.source-card{padding:19px}');
      expect(doc.querySelectorAll('style').length).toBe(2);
      expect(doc.querySelector('[data-nid="aside001"]')!.textContent).toBe('Sibling');
      operation.inspect(doc);
    });

    test(`${operation.name} continues to return an editable fragment without document wrappers`, () => {
      const output = operation.run(fragment), doc = parse(output);
      expect(output.trimStart().startsWith('<main')).toBe(true);
      expect(output).not.toMatch(/<!doctype|<html|<head|<body/i);
      expect(doc.querySelector('[data-nid="aside001"]')!.textContent).toBe('Sibling');
      operation.inspect(doc);
    });
  }

  test('failed or ineligible edits preserve the complete original document byte-for-byte', () => {
    expect(setTextByNid(documentHtml, 'card0001', 'Would destroy children')).toBeNull();
    expect(patchElementByNid(documentHtml, 'missing', '<p>No</p>').html).toBe(documentHtml);
    expect(deleteElementByNid(documentHtml, 'missing').html).toBe(documentHtml);
    expect(duplicateElementByNid(documentHtml, 'missing').html).toBe(documentHtml);
    expect(wrapElementByNid(documentHtml, 'missing', 'col').html).toBe(documentHtml);
  });
});
