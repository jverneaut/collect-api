import fp from 'fastify-plugin';
import { PagesFinder } from '@jverneaut/mb-pages-finder';
import { Screenshotter } from '@jverneaut/mb-screenshotter';
import { TechnologiesFinder } from '@jverneaut/mb-technologies-finder';

export const mbPlugin = fp(async (app) => {
  app.decorate('mb', {
    pagesFinder: new PagesFinder(),
    screenshotter: new Screenshotter(),
    technologiesFinder: new TechnologiesFinder(),
  });
});

