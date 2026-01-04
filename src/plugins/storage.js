import fp from 'fastify-plugin';
import staticPlugin from '@fastify/static';
import { mkdir } from 'fs/promises';
import path from 'path';

export const storagePlugin = fp(async (app) => {
  const storageDir = path.resolve(process.cwd(), app.config.STORAGE_DIR);
  const publicPath = app.config.STORAGE_PUBLIC_PATH;

  await mkdir(storageDir, { recursive: true });

  await app.register(staticPlugin, {
    root: storageDir,
    prefix: publicPath.endsWith('/') ? publicPath : `${publicPath}/`,
    decorateReply: false,
  });

  app.decorate('storage', {
    dir: storageDir,
    publicPath,
    toPublicUrl: (storageKey) => `${publicPath.replace(/\/$/, '')}/${storageKey}`.replace(/\/\//g, '/'),
    toAbsolutePath: (storageKey) => path.join(storageDir, storageKey),
  });
});
