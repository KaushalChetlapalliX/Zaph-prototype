export type CategoryRecord = {
  description?: string | null;
  icon?: string | null;
  id: string;
  name: string;
};

export type CanonicalCategory = {
  description: string;
  duplicateIds: string[];
  icon: string;
  id: string;
  name: string;
};

export type AssignedCategoryLookup = Record<
  string,
  {
    icon: string;
    id: string;
    name: string;
    sourceIds: string[];
  }
>;

type Candidate = {
  description: string;
  icon: string;
  id: string;
  index: number;
  name: string;
};

function normalizeCategory(
  row: CategoryRecord,
  index: number,
): Candidate | null {
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;

  return {
    description: String(row.description ?? "").trim(),
    icon: String(row.icon ?? "").trim(),
    id,
    index,
    name,
  };
}

function candidateScore(candidate: Candidate): number {
  let score = 0;
  if (candidate.icon) score += 2;
  if (candidate.description) score += 1;
  return score;
}

function preferCandidate(left: Candidate, right: Candidate): Candidate {
  const leftScore = candidateScore(left);
  const rightScore = candidateScore(right);
  if (rightScore > leftScore) return right;
  if (rightScore < leftScore) return left;
  return right.index < left.index ? right : left;
}

export function buildCanonicalCategoryMap(
  rows: CategoryRecord[],
): Map<string, CanonicalCategory> {
  const grouped = new Map<
    string,
    {
      best: Candidate;
      duplicateIds: Set<string>;
    }
  >();

  rows.forEach((row, index) => {
    const normalized = normalizeCategory(row, index);
    if (!normalized) return;

    const existing = grouped.get(normalized.name);
    if (!existing) {
      grouped.set(normalized.name, {
        best: normalized,
        duplicateIds: new Set([normalized.id]),
      });
      return;
    }

    existing.best = preferCandidate(existing.best, normalized);
    existing.duplicateIds.add(normalized.id);
  });

  const canonical = new Map<string, CanonicalCategory>();
  for (const [name, group] of grouped.entries()) {
    canonical.set(name, {
      description: group.best.description,
      duplicateIds: Array.from(group.duplicateIds),
      icon: group.best.icon,
      id: group.best.id,
      name,
    });
  }

  return canonical;
}

export function buildAssignedCategoryLookup(
  assignedRows: CategoryRecord[],
  allRowsForNames: CategoryRecord[],
): AssignedCategoryLookup {
  const canonicalByName = buildCanonicalCategoryMap(allRowsForNames);
  const lookup: AssignedCategoryLookup = {};

  assignedRows.forEach((row, index) => {
    const normalized = normalizeCategory(row, index);
    if (!normalized) return;

    const canonical = canonicalByName.get(normalized.name);
    lookup[normalized.id] = {
      icon: canonical?.icon || normalized.icon,
      id: canonical?.id ?? normalized.id,
      name: canonical?.name ?? normalized.name,
      sourceIds: canonical?.duplicateIds.length
        ? canonical.duplicateIds
        : [normalized.id],
    };
  });

  return lookup;
}
