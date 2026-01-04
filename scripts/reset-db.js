import { access, unlink } from 'fs/promises';
import path from 'path';

async function main() {
  const dbPath = path.resolve('prisma', 'dev.db');

  try {
    await access(dbPath);
  } catch {
    process.stdout.write(`No SQLite DB found at ${dbPath}\n`);
    return;
  }

  await unlink(dbPath);
  process.stdout.write(`Deleted SQLite DB at ${dbPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

