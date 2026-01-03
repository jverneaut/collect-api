import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function assertDevOnly() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databaseUrl = process.env.DATABASE_URL || '';

  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed in production (NODE_ENV=production).');
  }

  if (!databaseUrl.startsWith('file:') && process.env.SEED_ALLOW_NON_SQLITE !== 'true') {
    throw new Error(
      'Refusing to run seed on non-SQLite DATABASE_URL. Set SEED_ALLOW_NON_SQLITE=true to override.'
    );
  }
}

function iso(date) {
  return new Date(date).toISOString();
}

async function upsertDomainWithUrls(prisma, { host, displayName }) {
  const canonicalUrl = `https://${host}`;
  const domain = await prisma.domain.upsert({
    where: { host },
    update: { displayName },
    create: { host, canonicalUrl, displayName },
  });

  const urls = [
    { path: '/', type: 'HOMEPAGE', isCanonical: true },
    { path: '/about', type: 'ABOUT', isCanonical: false },
    { path: '/pricing', type: 'PRICING', isCanonical: false },
    { path: '/contact', type: 'CONTACT', isCanonical: false },
  ];

  const createdUrls = [];
  for (const url of urls) {
    const normalizedUrl = `${canonicalUrl}${url.path === '/' ? '/' : url.path}`;
    const created = await prisma.url.upsert({
      where: { normalizedUrl },
      update: { type: url.type, isCanonical: url.isCanonical },
      create: {
        domainId: domain.id,
        path: url.path,
        normalizedUrl,
        type: url.type,
        isCanonical: url.isCanonical,
      },
    });
    createdUrls.push(created);
  }

  return { domain, urls: createdUrls };
}

async function ensureTaxonomies(prisma, { categories, technologies }) {
  for (const item of categories) {
    await prisma.category.upsert({
      where: { slug: item.slug },
      update: { name: item.name, description: item.description },
      create: { slug: item.slug, name: item.name, description: item.description },
    });
  }

  for (const item of technologies) {
    await prisma.technology.upsert({
      where: { slug: item.slug },
      update: { name: item.name, websiteUrl: item.websiteUrl },
      create: { slug: item.slug, name: item.name, websiteUrl: item.websiteUrl },
    });
  }
}

async function createOrUpdateCrawlBundle(prisma, bundle) {
  const crawledAt = bundle.crawledAt ? new Date(bundle.crawledAt) : null;

  const existing =
    crawledAt &&
    (await prisma.urlCrawl.findFirst({
      where: { urlId: bundle.urlId, crawledAt },
    }));

  if (existing) return existing;

  const crawl = await prisma.urlCrawl.create({
    data: {
      urlId: bundle.urlId,
      status: bundle.status,
      startedAt: bundle.startedAt ? new Date(bundle.startedAt) : new Date(),
      finishedAt: bundle.finishedAt ? new Date(bundle.finishedAt) : bundle.status === 'SUCCESS' ? new Date() : null,
      crawledAt,
      httpStatus: bundle.httpStatus,
      finalUrl: bundle.finalUrl,
      title: bundle.title,
      metaDescription: bundle.metaDescription ?? null,
      language: bundle.language ?? null,
      contentHash: bundle.contentHash ?? null,
      error: bundle.error ?? null,
      tasks: {
        create: [
          { type: 'SCREENSHOT', status: bundle.taskStatus?.SCREENSHOT ?? (bundle.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') },
          { type: 'TECHNOLOGIES', status: bundle.taskStatus?.TECHNOLOGIES ?? (bundle.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') },
          { type: 'CATEGORIES', status: bundle.taskStatus?.CATEGORIES ?? (bundle.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') },
          { type: 'CONTENT', status: bundle.taskStatus?.CONTENT ?? (bundle.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') },
          { type: 'COLORS', status: bundle.taskStatus?.COLORS ?? (bundle.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') },
        ],
      },
      screenshots:
        bundle.status === 'SUCCESS' && bundle.screenshot
          ? {
              create: [
                {
                  kind: bundle.screenshot.kind ?? 'FULL_PAGE',
                  width: bundle.screenshot.width ?? 1440,
                  height: bundle.screenshot.height ?? 9000,
                  format: bundle.screenshot.format ?? 'webp',
                  storageKey: bundle.screenshot.storageKey ?? `seed/${bundle.urlId}/${crawledAt?.toISOString() ?? 'unknown'}.webp`,
                  publicUrl: bundle.screenshot.publicUrl ?? null,
                },
              ],
            }
          : undefined,
    },
  });

  if (bundle.categories?.length) {
    for (const item of bundle.categories) {
      const category = await prisma.category.findUnique({ where: { slug: item.slug } });
      if (!category) continue;
      await prisma.crawlCategory.upsert({
        where: { crawlId_categoryId: { crawlId: crawl.id, categoryId: category.id } },
        update: { confidence: item.confidence },
        create: { crawlId: crawl.id, categoryId: category.id, confidence: item.confidence },
      });
    }
  }

  if (bundle.technologies?.length) {
    for (const item of bundle.technologies) {
      const technology = await prisma.technology.findUnique({ where: { slug: item.slug } });
      if (!technology) continue;
      await prisma.crawlTechnology.upsert({
        where: { crawlId_technologyId: { crawlId: crawl.id, technologyId: technology.id } },
        update: { confidence: item.confidence },
        create: { crawlId: crawl.id, technologyId: technology.id, confidence: item.confidence },
      });
    }
  }

  return crawl;
}

async function main() {
  assertDevOnly();

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    const taxonomy = {
      categories: [
        { slug: 'saas', name: 'SaaS', description: 'Software as a service' },
        { slug: 'productivity', name: 'Productivity', description: 'Tools to get work done' },
        { slug: 'fintech', name: 'Fintech', description: 'Financial technology' },
        { slug: 'ecommerce', name: 'E-commerce', description: 'Online stores and commerce' },
        { slug: 'portfolio', name: 'Portfolio', description: 'Personal and studio portfolios' },
        { slug: 'agency', name: 'Agency', description: 'Creative and digital agencies' },
        { slug: 'developer-tools', name: 'Developer Tools', description: 'APIs and dev platforms' },
        { slug: 'design-tools', name: 'Design Tools', description: 'Tools for designers' },
        { slug: 'education', name: 'Education', description: 'Learning and courses' },
        { slug: 'media', name: 'Media', description: 'Publishing and media' },
        { slug: 'community', name: 'Community', description: 'Communities and forums' },
        { slug: 'travel', name: 'Travel', description: 'Travel and hospitality' },
      ],
      technologies: [
        { slug: 'react', name: 'React', websiteUrl: 'https://react.dev' },
        { slug: 'nextjs', name: 'Next.js', websiteUrl: 'https://nextjs.org' },
        { slug: 'vue', name: 'Vue.js', websiteUrl: 'https://vuejs.org' },
        { slug: 'nuxt', name: 'Nuxt', websiteUrl: 'https://nuxt.com' },
        { slug: 'svelte', name: 'Svelte', websiteUrl: 'https://svelte.dev' },
        { slug: 'tailwindcss', name: 'Tailwind CSS', websiteUrl: 'https://tailwindcss.com' },
        { slug: 'shopify', name: 'Shopify', websiteUrl: 'https://www.shopify.com' },
        { slug: 'wordpress', name: 'WordPress', websiteUrl: 'https://wordpress.org' },
        { slug: 'webflow', name: 'Webflow', websiteUrl: 'https://webflow.com' },
        { slug: 'framer', name: 'Framer', websiteUrl: 'https://www.framer.com' },
        { slug: 'stripe', name: 'Stripe', websiteUrl: 'https://stripe.com' },
        { slug: 'vercel', name: 'Vercel', websiteUrl: 'https://vercel.com' },
        { slug: 'cloudflare', name: 'Cloudflare', websiteUrl: 'https://www.cloudflare.com' },
        { slug: 'google-analytics', name: 'Google Analytics', websiteUrl: 'https://analytics.google.com' },
        { slug: 'segment', name: 'Segment', websiteUrl: 'https://segment.com' },
      ],
    };

    await ensureTaxonomies(prisma, taxonomy);

    const base = new Date('2026-01-01T12:00:00.000Z');
    const oneYearAgo = new Date(base);
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
    const oneMonthAgo = new Date(base);
    oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
    const oneWeekAgo = new Date(base);
    oneWeekAgo.setUTCDate(oneWeekAgo.getUTCDate() - 7);

    const seeds = [
      { host: 'stripe.com', name: 'Stripe', categories: ['fintech', 'developer-tools'], technologies: ['react', 'nextjs', 'stripe'] },
      { host: 'linear.app', name: 'Linear', categories: ['productivity', 'saas'], technologies: ['react', 'nextjs', 'tailwindcss'] },
      { host: 'framer.com', name: 'Framer', categories: ['design-tools', 'saas'], technologies: ['react', 'nextjs', 'framer'] },
      { host: 'vercel.com', name: 'Vercel', categories: ['developer-tools', 'saas'], technologies: ['nextjs', 'vercel'] },
      { host: 'shopify.com', name: 'Shopify', categories: ['ecommerce', 'saas'], technologies: ['react', 'shopify'] },
      { host: 'webflow.com', name: 'Webflow', categories: ['design-tools', 'saas'], technologies: ['react', 'webflow'] },
      { host: 'notion.so', name: 'Notion', categories: ['productivity', 'saas'], technologies: ['react', 'nextjs'] },
      { host: 'figma.com', name: 'Figma', categories: ['design-tools', 'saas'], technologies: ['react'] },
      { host: 'airbnb.com', name: 'Airbnb', categories: ['travel', 'community'], technologies: ['react'] },
      { host: 'medium.com', name: 'Medium', categories: ['media', 'community'], technologies: ['react'] },
      { host: 'github.com', name: 'GitHub', categories: ['developer-tools', 'community'], technologies: ['react'] },
      { host: 'cloudflare.com', name: 'Cloudflare', categories: ['developer-tools'], technologies: ['react', 'cloudflare'] },
      { host: 'tailwindcss.com', name: 'Tailwind CSS', categories: ['developer-tools', 'education'], technologies: ['nextjs', 'tailwindcss'] },
      { host: 'sentry.io', name: 'Sentry', categories: ['developer-tools', 'saas'], technologies: ['react'] },
      { host: 'algolia.com', name: 'Algolia', categories: ['developer-tools', 'saas'], technologies: ['vue', 'nuxt'] },
      { host: 'intercom.com', name: 'Intercom', categories: ['saas'], technologies: ['react'] },
      { host: 'slack.com', name: 'Slack', categories: ['productivity', 'saas'], technologies: ['react'] },
      { host: 'loom.com', name: 'Loom', categories: ['productivity', 'saas'], technologies: ['react'] },
      { host: 'cal.com', name: 'Cal.com', categories: ['productivity', 'saas'], technologies: ['nextjs', 'tailwindcss'] },
      { host: 'raycast.com', name: 'Raycast', categories: ['productivity'], technologies: ['nextjs', 'tailwindcss'] },
      { host: 'gumroad.com', name: 'Gumroad', categories: ['ecommerce', 'saas'], technologies: ['react'] },
      { host: 'behance.net', name: 'Behance', categories: ['portfolio', 'community'], technologies: ['react'] },
      { host: 'dribbble.com', name: 'Dribbble', categories: ['portfolio', 'community'], technologies: ['react'] },
      { host: 'a16z.com', name: 'a16z', categories: ['media'], technologies: ['nextjs'] },
      { host: 'coursera.org', name: 'Coursera', categories: ['education'], technologies: ['react'] },
    ];

    for (const seed of seeds) {
      const { domain, urls } = await upsertDomainWithUrls(prisma, { host: seed.host, displayName: seed.name });

      await prisma.domainProfile.upsert({
        where: { domainId: domain.id },
        update: {
          name: seed.name,
          description: `Seed profile for ${domain.host}`,
          primaryColorsJson: JSON.stringify(['#111827', '#635BFF', '#F59E0B', '#10B981']),
          styleTagsJson: JSON.stringify(['modern', 'clean', 'typography', 'grid']),
        },
        create: {
          domainId: domain.id,
          sourceCrawlId: null,
          name: seed.name,
          description: `Seed profile for ${domain.host}`,
          primaryColorsJson: JSON.stringify(['#111827', '#635BFF', '#F59E0B', '#10B981']),
          styleTagsJson: JSON.stringify(['modern', 'clean', 'typography', 'grid']),
        },
      });

      const homepage = urls.find((u) => u.type === 'HOMEPAGE');
      const about = urls.find((u) => u.type === 'ABOUT');
      const pricing = urls.find((u) => u.type === 'PRICING');

      const toCategoryItems = (slugs, baseConfidence = 0.85) =>
        slugs.map((slug, idx) => ({ slug, confidence: Math.max(0.3, baseConfidence - idx * 0.12) }));
      const toTechItems = (slugs, baseConfidence = 0.9) =>
        slugs.map((slug, idx) => ({ slug, confidence: Math.max(0.3, baseConfidence - idx * 0.1) }));

      if (homepage) {
        await createOrUpdateCrawlBundle(prisma, {
          urlId: homepage.id,
          status: 'SUCCESS',
          crawledAt: iso(oneYearAgo),
          httpStatus: 200,
          finalUrl: homepage.normalizedUrl,
          title: `${seed.name} — Homepage (2025)`,
          metaDescription: `Seeded crawl for ${seed.name} homepage`,
          language: 'en',
          contentHash: `seed:${seed.host}:home:2025`,
          screenshot: { publicUrl: `https://cdn.collect.design/seed/${seed.host}/home-2025.webp` },
          categories: toCategoryItems(seed.categories, 0.78),
          technologies: toTechItems(seed.technologies, 0.85),
        });

        await createOrUpdateCrawlBundle(prisma, {
          urlId: homepage.id,
          status: 'SUCCESS',
          crawledAt: iso(oneMonthAgo),
          httpStatus: 200,
          finalUrl: homepage.normalizedUrl,
          title: `${seed.name} — Homepage (last month)`,
          metaDescription: `Seeded crawl for ${seed.name} homepage`,
          language: 'en',
          contentHash: `seed:${seed.host}:home:month`,
          screenshot: { publicUrl: `https://cdn.collect.design/seed/${seed.host}/home-month.webp` },
          categories: toCategoryItems(seed.categories, 0.88),
          technologies: toTechItems(seed.technologies, 0.9),
        });

        await createOrUpdateCrawlBundle(prisma, {
          urlId: homepage.id,
          status: 'SUCCESS',
          crawledAt: iso(base),
          httpStatus: 200,
          finalUrl: homepage.normalizedUrl,
          title: `${seed.name} — Homepage`,
          metaDescription: `Seeded crawl for ${seed.name} homepage`,
          language: 'en',
          contentHash: `seed:${seed.host}:home:now`,
          screenshot: { publicUrl: `https://cdn.collect.design/seed/${seed.host}/home-now.webp` },
          categories: toCategoryItems(seed.categories, 0.92),
          technologies: toTechItems(seed.technologies, 0.92),
        });
      }

      if (about) {
        await createOrUpdateCrawlBundle(prisma, {
          urlId: about.id,
          status: 'SUCCESS',
          crawledAt: iso(oneWeekAgo),
          httpStatus: 200,
          finalUrl: about.normalizedUrl,
          title: `${seed.name} — About`,
          metaDescription: `Seeded crawl for ${seed.name} about page`,
          language: 'en',
          contentHash: `seed:${seed.host}:about:week`,
          screenshot: { publicUrl: `https://cdn.collect.design/seed/${seed.host}/about.webp`, height: 5200 },
          categories: toCategoryItems(seed.categories, 0.75),
          technologies: toTechItems(seed.technologies, 0.85),
        });
      }

      if (pricing) {
        await createOrUpdateCrawlBundle(prisma, {
          urlId: pricing.id,
          status: 'PENDING',
          crawledAt: iso(base),
          httpStatus: null,
          finalUrl: null,
          title: null,
          metaDescription: null,
          language: null,
          contentHash: `seed:${seed.host}:pricing:now`,
          categories: [],
          technologies: [],
          taskStatus: {
            SCREENSHOT: 'PENDING',
            TECHNOLOGIES: 'PENDING',
            CATEGORIES: 'PENDING',
            CONTENT: 'PENDING',
            COLORS: 'PENDING',
          },
        });
      }
    }

    const result = {
      domains: await prisma.domain.count(),
      urls: await prisma.url.count(),
      crawls: await prisma.urlCrawl.count(),
      tasks: await prisma.crawlTask.count(),
      screenshots: await prisma.screenshot.count(),
      categories: await prisma.category.count(),
      technologies: await prisma.technology.count(),
    };

    // eslint-disable-next-line no-console
    console.log('Seed complete:', result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
