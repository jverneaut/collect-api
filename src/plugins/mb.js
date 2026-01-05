import fp from 'fastify-plugin';
import { ColorsExtractor } from '@jverneaut/mb-colors-extractor';
import { PagesFinder } from '@jverneaut/mb-pages-finder';
import { Screenshotter } from '@jverneaut/mb-screenshotter';
import { TechnologiesFinder } from '@jverneaut/mb-technologies-finder';

export const mbPlugin = fp(async (app) => {
  app.decorate('mb', {
    colorsExtractor: new ColorsExtractor(),
    pagesFinder: new PagesFinder(),
    screenshotter: new Screenshotter(),
    technologiesFinder: new TechnologiesFinder(),
  });
});
