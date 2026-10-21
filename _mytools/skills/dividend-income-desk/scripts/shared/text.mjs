/**
 * 公告正文的文本处理：东财公告接口返回的是带标签与 HTML 实体的片段，
 * `announcement.mjs` 与 `dividend-dossier.mjs` 都要先剥标签再解码。
 */

/**
 * 还原公告正文里常见的 HTML 实体。
 * @param {string} text - 待解码文本。
 * @returns {string} 解码后的文本。
 */
export function decodeEntities(text) {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}
