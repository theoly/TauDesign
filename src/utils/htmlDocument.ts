/** 解析离线副本；序列化时保留整页文档或HTML片段的原有形态。 */
export function parseHtmlCopy(html: string) {
  const start = html.trimStart().toLowerCase();
  const full = start.startsWith('<!doctype') || start.startsWith('<html');
  const doc = new DOMParser().parseFromString(full ? html : `<body>${html}</body>`, 'text/html');
  return {
    doc, full,
    serialize: () => full
      ? `${doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : ''}${doc.documentElement.outerHTML}`
      : doc.body.innerHTML
  };
}
