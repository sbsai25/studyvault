// Generated sentences contain exactly one blank written as "____"
// (backend/services/rag.py validates this). Split around the first run of
// three or more underscores; a sentence without one gets its blank at the end.
export function splitSentence(sentence = '') {
  const match = /_{3,}/.exec(sentence);
  if (!match) return [sentence.trimEnd() + ' ', ''];
  return [sentence.slice(0, match.index), sentence.slice(match.index + match[0].length)];
}
