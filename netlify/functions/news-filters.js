function hasExcluded(title) {
  return [
    '날씨',
    '운세',
    '로또',
    '복권',
    '스포츠',
    '프로야구',
    '코스피',
    '코스닥',
    '교통정보',
  ].some(kw => title.includes(kw));
}

function hasImportance(title) {
  return [
    '정책',
    '국회',
    '정부',
    '법원',
    '검찰',
    '수사',
    '외교',
    '안보',
    '노동',
    '교육',
    '부동산',
    '복지',
    '의료',
    '환경',
    '예산',
    '선거',
  ].some(kw => title.includes(kw));
}

function shouldSkipStory(title) {
  return hasExcluded(title) && !hasImportance(title);
}

module.exports = {
  shouldSkipStory,
  hasExcluded,
  hasImportance,
};
