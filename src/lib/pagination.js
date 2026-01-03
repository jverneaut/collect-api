export function clampLimit(limit, { min = 1, max = 100, fallback = 20 } = {}) {
  const value = Number.isFinite(limit) ? limit : Number(limit);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(value, max));
}

export function encodeCursor(value) {
  if (!value) return null;
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  const json = Buffer.from(cursor, 'base64url').toString('utf8');
  return JSON.parse(json);
}

export function makeCreatedAtCursorWhere(cursor) {
  if (!cursor) return {};
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime()) || !cursor.id) return {};

  return {
    OR: [
      { createdAt: { lt: createdAt } },
      {
        AND: [{ createdAt }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

