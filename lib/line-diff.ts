export const MAX_DIFF_LINES_PER_SIDE = 2_000;
export const MAX_DIFF_CHARACTERS_PER_SIDE = 500_000;
export const MAX_LCS_CELLS = 1_000_000;

const MAX_CHARACTER_LCS_CELLS = 60_000;

export type LineDiffKind = 'same' | 'added' | 'removed' | 'changed';

export interface CharacterDiffSegment {
  text: string;
  changed: boolean;
}

export interface LineDiffCell {
  lineNumber: number;
  text: string;
  segments: CharacterDiffSegment[];
}

export interface LineDiffRow {
  kind: LineDiffKind;
  left: LineDiffCell | null;
  right: LineDiffCell | null;
}

export interface LineDiffResult {
  rows: LineDiffRow[];
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  identical: boolean;
  leftLineCount: number;
  rightLineCount: number;
}

export interface LineDiffOptions {
  maxLinesPerSide?: number;
  maxCharactersPerSide?: number;
  maxLcsCells?: number;
}

export class LineDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineDiffError';
  }
}

function splitLines(input: string) {
  return input.replace(/\r\n?/g, '\n').split('\n');
}

function plainSegments(text: string): CharacterDiffSegment[] {
  return [{ text, changed: false }];
}

function pushSegment(
  segments: CharacterDiffSegment[],
  text: string,
  changed: boolean,
) {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.changed === changed) {
    previous.text += text;
  } else {
    segments.push({ text, changed });
  }
}

function commonAffixCharacterDiff(left: string[], right: string[]) {
  let prefixLength = 0;
  while (
    prefixLength < left.length
    && prefixLength < right.length
    && left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < left.length - prefixLength
    && suffixLength < right.length - prefixLength
    && left[left.length - 1 - suffixLength] === right[right.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const leftSegments: CharacterDiffSegment[] = [];
  const rightSegments: CharacterDiffSegment[] = [];
  const prefix = left.slice(0, prefixLength).join('');
  const suffix = suffixLength ? left.slice(left.length - suffixLength).join('') : '';

  pushSegment(leftSegments, prefix, false);
  pushSegment(rightSegments, prefix, false);
  pushSegment(
    leftSegments,
    left.slice(prefixLength, left.length - suffixLength).join(''),
    true,
  );
  pushSegment(
    rightSegments,
    right.slice(prefixLength, right.length - suffixLength).join(''),
    true,
  );
  pushSegment(leftSegments, suffix, false);
  pushSegment(rightSegments, suffix, false);

  return {
    left: leftSegments.length ? leftSegments : plainSegments(''),
    right: rightSegments.length ? rightSegments : plainSegments(''),
  };
}

export function diffCharacters(leftText: string, rightText: string) {
  if (leftText === rightText) {
    return { left: plainSegments(leftText), right: plainSegments(rightText) };
  }

  const left = Array.from(leftText);
  const right = Array.from(rightText);
  const cellCount = (left.length + 1) * (right.length + 1);
  if (cellCount > MAX_CHARACTER_LCS_CELLS) {
    return commonAffixCharacterDiff(left, right);
  }

  const columns = right.length + 1;
  const table = new Uint16Array((left.length + 1) * columns);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cell = leftIndex * columns + rightIndex;
      table[cell] = left[leftIndex - 1] === right[rightIndex - 1]
        ? table[(leftIndex - 1) * columns + rightIndex - 1] + 1
        : Math.max(table[(leftIndex - 1) * columns + rightIndex], table[cell - 1]);
    }
  }

  const operations: Array<{ side: 'both' | 'left' | 'right'; character: string }> = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 || rightIndex > 0) {
    if (
      leftIndex > 0
      && rightIndex > 0
      && left[leftIndex - 1] === right[rightIndex - 1]
    ) {
      operations.push({ side: 'both', character: left[leftIndex - 1] });
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (
      leftIndex > 0
      && (
        rightIndex === 0
        || table[(leftIndex - 1) * columns + rightIndex]
          >= table[leftIndex * columns + rightIndex - 1]
      )
    ) {
      operations.push({ side: 'left', character: left[leftIndex - 1] });
      leftIndex -= 1;
    } else {
      operations.push({ side: 'right', character: right[rightIndex - 1] });
      rightIndex -= 1;
    }
  }

  const leftSegments: CharacterDiffSegment[] = [];
  const rightSegments: CharacterDiffSegment[] = [];
  operations.reverse().forEach((operation) => {
    if (operation.side !== 'right') {
      pushSegment(leftSegments, operation.character, operation.side === 'left');
    }
    if (operation.side !== 'left') {
      pushSegment(rightSegments, operation.character, operation.side === 'right');
    }
  });

  return {
    left: leftSegments.length ? leftSegments : plainSegments(''),
    right: rightSegments.length ? rightSegments : plainSegments(''),
  };
}

function sameRow(
  text: string,
  leftLineNumber: number,
  rightLineNumber: number,
): LineDiffRow {
  return {
    kind: 'same',
    left: { lineNumber: leftLineNumber, text, segments: plainSegments(text) },
    right: { lineNumber: rightLineNumber, text, segments: plainSegments(text) },
  };
}

function changedRow(
  leftText: string,
  rightText: string,
  leftLineNumber: number,
  rightLineNumber: number,
): LineDiffRow {
  const segments = diffCharacters(leftText, rightText);
  return {
    kind: 'changed',
    left: { lineNumber: leftLineNumber, text: leftText, segments: segments.left },
    right: { lineNumber: rightLineNumber, text: rightText, segments: segments.right },
  };
}

function changeBlock(
  left: string[],
  right: string[],
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  const rows: LineDiffRow[] = [];
  const leftCount = leftEnd - leftStart;
  const rightCount = rightEnd - rightStart;
  const pairedCount = Math.min(leftCount, rightCount);

  for (let offset = 0; offset < pairedCount; offset += 1) {
    rows.push(changedRow(
      left[leftStart + offset],
      right[rightStart + offset],
      leftStart + offset + 1,
      rightStart + offset + 1,
    ));
  }

  for (let offset = pairedCount; offset < leftCount; offset += 1) {
    const lineNumber = leftStart + offset + 1;
    const text = left[leftStart + offset];
    rows.push({
      kind: 'removed',
      left: { lineNumber, text, segments: [{ text, changed: true }] },
      right: null,
    });
  }

  for (let offset = pairedCount; offset < rightCount; offset += 1) {
    const lineNumber = rightStart + offset + 1;
    const text = right[rightStart + offset];
    rows.push({
      kind: 'added',
      left: null,
      right: { lineNumber, text, segments: [{ text, changed: true }] },
    });
  }

  return rows;
}

function findLineMatches(left: string[], right: string[]) {
  const columns = right.length + 1;
  const table = new Uint16Array((left.length + 1) * columns);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cell = leftIndex * columns + rightIndex;
      table[cell] = left[leftIndex - 1] === right[rightIndex - 1]
        ? table[(leftIndex - 1) * columns + rightIndex - 1] + 1
        : Math.max(table[(leftIndex - 1) * columns + rightIndex], table[cell - 1]);
    }
  }

  const matches: Array<[number, number]> = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 && rightIndex > 0) {
    if (left[leftIndex - 1] === right[rightIndex - 1]) {
      matches.push([leftIndex - 1, rightIndex - 1]);
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (
      table[(leftIndex - 1) * columns + rightIndex]
      >= table[leftIndex * columns + rightIndex - 1]
    ) {
      leftIndex -= 1;
    } else {
      rightIndex -= 1;
    }
  }

  return matches.reverse();
}

export function diffLines(
  leftInput: string,
  rightInput: string,
  options: LineDiffOptions = {},
): LineDiffResult {
  const maxLines = options.maxLinesPerSide ?? MAX_DIFF_LINES_PER_SIDE;
  const maxCharacters = options.maxCharactersPerSide ?? MAX_DIFF_CHARACTERS_PER_SIDE;
  const maxCells = options.maxLcsCells ?? MAX_LCS_CELLS;

  if (leftInput.length > maxCharacters || rightInput.length > maxCharacters) {
    throw new LineDiffError(
      `内容过大。为避免浏览器卡顿，每侧最多比较 ${maxCharacters.toLocaleString('zh-CN')} 个字符。`,
    );
  }

  const left = splitLines(leftInput);
  const right = splitLines(rightInput);
  if (left.length > maxLines || right.length > maxLines) {
    throw new LineDiffError(`行数过多。为避免浏览器卡顿，每侧最多比较 ${maxLines} 行。`);
  }

  let prefixLength = 0;
  while (
    prefixLength < left.length
    && prefixLength < right.length
    && left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < left.length - prefixLength
    && suffixLength < right.length - prefixLength
    && left[left.length - 1 - suffixLength] === right[right.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const leftMiddleEnd = left.length - suffixLength;
  const rightMiddleEnd = right.length - suffixLength;
  const leftMiddle = left.slice(prefixLength, leftMiddleEnd);
  const rightMiddle = right.slice(prefixLength, rightMiddleEnd);
  const cellCount = (leftMiddle.length + 1) * (rightMiddle.length + 1);
  if (cellCount > maxCells) {
    throw new LineDiffError(
      '两侧差异范围过大，无法安全完成逐行对齐。请缩小比较片段后重试。',
    );
  }

  const rows: LineDiffRow[] = [];
  for (let index = 0; index < prefixLength; index += 1) {
    rows.push(sameRow(left[index], index + 1, index + 1));
  }

  const matches = findLineMatches(leftMiddle, rightMiddle);
  let previousLeft = 0;
  let previousRight = 0;
  matches.forEach(([leftIndex, rightIndex]) => {
    rows.push(...changeBlock(
      left,
      right,
      prefixLength + previousLeft,
      prefixLength + leftIndex,
      prefixLength + previousRight,
      prefixLength + rightIndex,
    ));
    rows.push(sameRow(
      leftMiddle[leftIndex],
      prefixLength + leftIndex + 1,
      prefixLength + rightIndex + 1,
    ));
    previousLeft = leftIndex + 1;
    previousRight = rightIndex + 1;
  });

  rows.push(...changeBlock(
    left,
    right,
    prefixLength + previousLeft,
    leftMiddleEnd,
    prefixLength + previousRight,
    rightMiddleEnd,
  ));

  for (let offset = suffixLength; offset > 0; offset -= 1) {
    const leftIndex = left.length - offset;
    const rightIndex = right.length - offset;
    rows.push(sameRow(left[leftIndex], leftIndex + 1, rightIndex + 1));
  }

  const added = rows.filter((row) => row.kind === 'added').length;
  const removed = rows.filter((row) => row.kind === 'removed').length;
  const changed = rows.filter((row) => row.kind === 'changed').length;
  const unchanged = rows.filter((row) => row.kind === 'same').length;

  return {
    rows,
    added,
    removed,
    changed,
    unchanged,
    identical: added === 0 && removed === 0 && changed === 0,
    leftLineCount: left.length,
    rightLineCount: right.length,
  };
}

export function formatUnifiedLineDiff(result: LineDiffResult) {
  const output: string[] = [];
  result.rows.forEach((row) => {
    switch (row.kind) {
      case 'same':
        output.push(`  ${row.left?.text ?? ''}`);
        break;
      case 'removed':
        output.push(`- ${row.left?.text ?? ''}`);
        break;
      case 'added':
        output.push(`+ ${row.right?.text ?? ''}`);
        break;
      case 'changed':
        output.push(`- ${row.left?.text ?? ''}`, `+ ${row.right?.text ?? ''}`);
        break;
    }
  });
  return output.join('\n');
}
