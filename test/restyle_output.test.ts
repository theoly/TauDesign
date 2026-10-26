import { describe, expect, test } from 'bun:test';
import { extractRestyleHtml } from '../src/services/ai/restyleOutput';

describe('restyle output extraction', () => {
  test('extracts a complete HTML fenced block with surrounding commentary', () => {
    expect(extractRestyleHtml('完成如下：\n```html\n<div><button>保存</button></div>\n```'))
      .toBe('<div><button>保存</button></div>');
  });

  test('extracts complete artifact responses', () => {
    expect(extractRestyleHtml('<artifact type="screen"><main><article>页面</article></main></artifact>'))
      .toBe('<main><article>页面</article></main>');
  });

  test('accepts complete raw fragments with uncommon root tags', () => {
    expect(extractRestyleHtml('<article><h2>标题</h2></article>'))
      .toBe('<article><h2>标题</h2></article>');
  });

  test('rejects an unclosed fence or truncated element tree', () => {
    expect(extractRestyleHtml('```html\n<article><h2>标题</h2>')).toBeNull();
    expect(extractRestyleHtml('<main><article>截断')).toBeNull();
  });
});
