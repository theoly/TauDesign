/** Explicit existing-page scope; negated instructions do not authorize a redesign. */
export function explicitlyRequestsPageRedesign(request:string):boolean{
 return request.split(/[。；;\n]/).some(clause=>!/(?:不要|无需|不得|禁止|不重新|\b(?:not|never)\b)/i.test(clause)&&/(?:重新设计|重设计|整页(?:重构|重做|重写|改写)|全页(?:重构|重做|重写)|\bredesign\s+(?:the\s+)?(?:whole\s+)?page\b)/i.test(clause));
}
