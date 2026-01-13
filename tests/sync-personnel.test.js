const { describe, it } = require('node:test');
const assert = require('node:assert');

// Ranks - order matters for sorting (Chief first, then by seniority)
const RANKS = [
  'Chief',
  'Assistant Chief',
  'Battalion Chief',
  'Division Chief',
  'Captain',
  'Lieutenant',
  'Apparatus Operator',
  'Firefighter',
];

// For parsing, check longer ranks first to avoid partial matches
const RANKS_BY_LENGTH = [...RANKS].sort((a, b) => b.length - a.length);

/**
 * Extract rank and title from jobTitle
 */
function parseJobTitle(jobTitle) {
  if (!jobTitle) return { rank: null, title: null };

  let rank = null;
  let title = jobTitle;

  // Find matching rank (check longer ranks first to avoid partial matches)
  for (const r of RANKS_BY_LENGTH) {
    if (jobTitle.toLowerCase().includes(r.toLowerCase())) {
      rank = r;
      // Remove rank from title
      title = jobTitle.replace(new RegExp(r, 'i'), '');
      break;
    }
  }

  // Clean up separators: leading/trailing spaces, dashes, colons, underscores, commas
  title = title.replace(/^[\s\-:_,]+|[\s\-:_,]+$/g, '').trim();

  return {
    rank,
    title: title || null,
  };
}

/**
 * Sort personnel by staff_type, rank, then first_name
 */
function sortPersonnel(personnel) {
  return [...personnel].sort((a, b) => {
    // Staff before volunteers
    if (a.staff_type !== b.staff_type) {
      return a.staff_type === 'staff' ? -1 : 1;
    }

    // Within staff, sort by rank
    if (a.staff_type === 'staff') {
      const aRankIdx = a.rank ? RANKS.indexOf(a.rank) : 999;
      const bRankIdx = b.rank ? RANKS.indexOf(b.rank) : 999;
      if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;
    }

    // Then by first name
    return a.first_name.localeCompare(b.first_name);
  });
}

describe('sync-personnel', () => {
  describe('RANKS_BY_LENGTH', () => {
    it('sorts longer ranks first for parsing', () => {
      // "Battalion Chief" (15 chars) should come before "Chief" (5 chars)
      const battalionIdx = RANKS_BY_LENGTH.indexOf('Battalion Chief');
      const chiefIdx = RANKS_BY_LENGTH.indexOf('Chief');
      assert.ok(battalionIdx < chiefIdx, 'Battalion Chief should come before Chief');
    });

    it('ensures all compound chief ranks come before Chief', () => {
      const chiefIdx = RANKS_BY_LENGTH.indexOf('Chief');
      const assistantIdx = RANKS_BY_LENGTH.indexOf('Assistant Chief');
      const battalionIdx = RANKS_BY_LENGTH.indexOf('Battalion Chief');
      const divisionIdx = RANKS_BY_LENGTH.indexOf('Division Chief');

      assert.ok(assistantIdx < chiefIdx, 'Assistant Chief should come before Chief');
      assert.ok(battalionIdx < chiefIdx, 'Battalion Chief should come before Chief');
      assert.ok(divisionIdx < chiefIdx, 'Division Chief should come before Chief');
    });
  });

  describe('parseJobTitle', () => {
    it('returns null for empty input', () => {
      assert.deepStrictEqual(parseJobTitle(null), { rank: null, title: null });
      assert.deepStrictEqual(parseJobTitle(''), { rank: null, title: null });
    });

    it('extracts rank without title', () => {
      assert.deepStrictEqual(parseJobTitle('Captain'), { rank: 'Captain', title: null });
      assert.deepStrictEqual(parseJobTitle('Chief'), { rank: 'Chief', title: null });
    });

    it('extracts rank with title using dash separator', () => {
      const result = parseJobTitle('Captain - Training Officer');
      assert.strictEqual(result.rank, 'Captain');
      assert.strictEqual(result.title, 'Training Officer');
    });

    it('extracts rank with title using colon separator', () => {
      const result = parseJobTitle('Captain: Training Officer');
      assert.strictEqual(result.rank, 'Captain');
      assert.strictEqual(result.title, 'Training Officer');
    });

    it('extracts rank with title using underscore separator', () => {
      const result = parseJobTitle('Captain_Training Officer');
      assert.strictEqual(result.rank, 'Captain');
      assert.strictEqual(result.title, 'Training Officer');
    });

    it('correctly identifies Battalion Chief (not just Chief)', () => {
      const result = parseJobTitle('Battalion Chief - Operations');
      assert.strictEqual(result.rank, 'Battalion Chief');
      assert.strictEqual(result.title, 'Operations');
    });

    it('correctly identifies Division Chief (not just Chief)', () => {
      const result = parseJobTitle('Division Chief');
      assert.strictEqual(result.rank, 'Division Chief');
      assert.strictEqual(result.title, null);
    });

    it('correctly identifies Assistant Chief (not just Chief)', () => {
      const result = parseJobTitle('Assistant Chief - Admin');
      assert.strictEqual(result.rank, 'Assistant Chief');
      assert.strictEqual(result.title, 'Admin');
    });

    it('handles case insensitive matching', () => {
      const result = parseJobTitle('CAPTAIN - training');
      assert.strictEqual(result.rank, 'Captain');
      assert.strictEqual(result.title, 'training');
    });

    it('returns full title when no rank matches', () => {
      const result = parseJobTitle('Administrative Assistant');
      assert.strictEqual(result.rank, null);
      assert.strictEqual(result.title, 'Administrative Assistant');
    });
  });

  describe('sortPersonnel', () => {
    it('sorts staff before volunteers', () => {
      const personnel = [
        { first_name: 'Zoe', staff_type: 'volunteer' },
        { first_name: 'Adam', staff_type: 'staff' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].first_name, 'Adam');
      assert.strictEqual(sorted[1].first_name, 'Zoe');
    });

    it('sorts by rank within staff (Chief first)', () => {
      const personnel = [
        { first_name: 'Bob', staff_type: 'staff', rank: 'Captain' },
        { first_name: 'Alice', staff_type: 'staff', rank: 'Chief' },
        { first_name: 'Charlie', staff_type: 'staff', rank: 'Lieutenant' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].rank, 'Chief');
      assert.strictEqual(sorted[1].rank, 'Captain');
      assert.strictEqual(sorted[2].rank, 'Lieutenant');
    });

    it('sorts Chief ranks in correct order', () => {
      const personnel = [
        { first_name: 'D', staff_type: 'staff', rank: 'Division Chief' },
        { first_name: 'A', staff_type: 'staff', rank: 'Chief' },
        { first_name: 'B', staff_type: 'staff', rank: 'Assistant Chief' },
        { first_name: 'C', staff_type: 'staff', rank: 'Battalion Chief' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].rank, 'Chief');
      assert.strictEqual(sorted[1].rank, 'Assistant Chief');
      assert.strictEqual(sorted[2].rank, 'Battalion Chief');
      assert.strictEqual(sorted[3].rank, 'Division Chief');
    });

    it('sorts by first name within same rank', () => {
      const personnel = [
        { first_name: 'Zach', staff_type: 'staff', rank: 'Captain' },
        { first_name: 'Adam', staff_type: 'staff', rank: 'Captain' },
        { first_name: 'Mike', staff_type: 'staff', rank: 'Captain' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].first_name, 'Adam');
      assert.strictEqual(sorted[1].first_name, 'Mike');
      assert.strictEqual(sorted[2].first_name, 'Zach');
    });

    it('sorts staff without rank after those with rank', () => {
      const personnel = [
        { first_name: 'Bob', staff_type: 'staff', rank: null },
        { first_name: 'Alice', staff_type: 'staff', rank: 'Firefighter' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].first_name, 'Alice');
      assert.strictEqual(sorted[1].first_name, 'Bob');
    });

    it('sorts volunteers by first name', () => {
      const personnel = [
        { first_name: 'Zoe', staff_type: 'volunteer' },
        { first_name: 'Adam', staff_type: 'volunteer' },
        { first_name: 'Mike', staff_type: 'volunteer' },
      ];
      const sorted = sortPersonnel(personnel);
      assert.strictEqual(sorted[0].first_name, 'Adam');
      assert.strictEqual(sorted[1].first_name, 'Mike');
      assert.strictEqual(sorted[2].first_name, 'Zoe');
    });
  });
});
