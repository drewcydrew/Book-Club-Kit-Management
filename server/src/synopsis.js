const htmlEntities = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' ']]);

function decodeHtmlEntity(match, code) {
  if (code[0] === '#') {
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }
  return htmlEntities.get(code.toLowerCase()) ?? match;
}

// Stored text is escaped so that a literal "<b>" in a synopsis is shown as text, not as bold.
function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatParagraph(raw) {
  let bold = false;
  let html = '';
  for (const part of raw.split(/(<\/?b>)/)) {
    if (part === '<b>') {
      if (!bold) { html += '<b>'; bold = true; }
    } else if (part === '</b>') {
      if (bold) { html += '</b>'; bold = false; }
    } else {
      html += escapeText(part.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, decodeHtmlEntity));
    }
  }
  if (bold) html += '</b>';
  return html.replace(/\s+/g, ' ').replace(/<b><\/b>/g, '').trim();
}

// Cuts on a token boundary so no tag or entity is split, then closes any open tags.
function truncateMarkup(html, max) {
  if (html.length <= max) return html;
  const tokens = html.match(/<\/?[pb]>|&[#a-zA-Z0-9]+;|[\s\S]/g);
  const reserve = '</b></p>'.length;
  let out = '';
  let bold = false;
  let paragraph = false;
  for (const token of tokens) {
    if (out.length + token.length + reserve > max) break;
    out += token;
    if (token === '<b>') bold = true;
    else if (token === '</b>') bold = false;
    else if (token === '<p>') paragraph = true;
    else if (token === '</p>') paragraph = false;
  }
  return out + (bold ? '</b>' : '') + (paragraph ? '</p>' : '');
}

// Keeps <p> paragraphs and <b> bold runs (<strong> is read as <b>, <br> starts a new paragraph).
// Other tags are removed, text is escaped, and the result is capped at max characters.
// Running it on its own output returns the same output, so it can be applied on save and on import.
function formatSynopsis(value, max) {
  if (typeof value !== 'string') return null;
  const marked = value
    .replace(/\s+/g, ' ')
    .replace(/<(\/?)(?:strong|b)\b[^>]*>/gi, (_, slash) => (slash ? '</b>' : '<b>'))
    .replace(/<br\b[^>]*>|<\/?(?:p|div|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, '\n\n')
    .replace(/<(?!\/?b>)[^>]*>/g, '');
  const paragraphs = marked.split(/\n\n+/).map(formatParagraph).filter(Boolean);
  if (!paragraphs.length) return null;
  return truncateMarkup(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''), max);
}

module.exports = { formatSynopsis };
