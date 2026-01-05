export function makeGraphqlSchema() {
  return /* GraphQL */ `
    scalar DateTime

    enum UrlType {
      HOMEPAGE
      ABOUT
      CONTACT
      PRICING
      BLOG
      CAREERS
      DOCS
      TERMS
      PRIVACY
      OTHER
    }

    enum CrawlStatus {
      PENDING
      RUNNING
      SUCCESS
      FAILED
    }

    enum CrawlRunStatus {
      PENDING
      RUNNING
      SUCCESS
      FAILED
    }

    enum CrawlRunReviewStatus {
      PENDING_REVIEW
      REVIEWED
    }

    enum TaskStatus {
      PENDING
      RUNNING
      SUCCESS
      FAILED
    }

    enum CrawlTaskType {
      SCREENSHOT
      TECHNOLOGIES
      SECTIONS
      CATEGORIES
      CONTENT
      COLORS
    }

    enum ScreenshotKind {
      FULL_PAGE
      VIEWPORT
    }

    type Domain {
      id: ID!
      host: String!
      canonicalUrl: String!
      displayName: String
      isPublished: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
      urlsCount: Int!
      homepageUrl: Url
      primaryCategory: Category
      categories: [Category!]!
      technologies: [Technology!]!
      homepageScreenshot: Screenshot
      profile: DomainProfile
      crawlRuns(limit: Int = 30, status: CrawlRunStatus): [CrawlRun!]!
      urls(type: UrlType, limit: Int = 50): [Url!]!
    }

    type CrawlRun {
      id: ID!
      domainId: ID!
      status: CrawlRunStatus!
      reviewStatus: CrawlRunReviewStatus!
      reviewedAt: DateTime
      isPublished: Boolean!
      publishedAt: DateTime
      tags: [String!]!
      jobId: String
      startedAt: DateTime
      finishedAt: DateTime
      error: String
      optionsJson: JSON
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type DomainProfile {
      domainId: ID!
      sourceCrawlId: ID
      name: String
      description: String
      primaryColorsJson: JSON
      styleTagsJson: JSON
      updatedAt: DateTime!
      createdAt: DateTime!
    }

    scalar JSON

    type Url {
      id: ID!
      domainId: ID!
      path: String!
      normalizedUrl: String!
      type: UrlType!
      isCanonical: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
      latestCrawl(status: CrawlStatus): UrlCrawl
      crawlInRun(runId: ID!): UrlCrawl
      crawls(limit: Int = 20): [UrlCrawl!]!
    }

    type UrlCrawl {
      id: ID!
      urlId: ID!
      crawlRunId: ID
      status: CrawlStatus!
      isPublished: Boolean!
      startedAt: DateTime
      finishedAt: DateTime
      crawledAt: DateTime
      httpStatus: Int
      finalUrl: String
      title: String
      metaDescription: String
      language: String
      contentHash: String
      error: String
      createdAt: DateTime!
      updatedAt: DateTime!
      tasks: [CrawlTask!]!
      screenshots: [Screenshot!]!
      sections: [SectionScreenshot!]!
      categories: [CrawlCategory!]!
      technologies: [CrawlTechnology!]!
    }

    type CrawlTask {
      id: ID!
      crawlId: ID!
      type: CrawlTaskType!
      status: TaskStatus!
      attempts: Int!
      lastAttemptAt: DateTime
      startedAt: DateTime
      finishedAt: DateTime
      error: String
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type Screenshot {
      id: ID!
      crawlId: ID!
      kind: ScreenshotKind!
      isPublished: Boolean!
      width: Int
      height: Int
      format: String
      storageKey: String
      publicUrl: String
      prominentColor: String
      createdAt: DateTime!
    }

    type SectionScreenshot {
      id: ID!
      crawlId: ID!
      index: Int!
      isPublished: Boolean!
      clip: JSON
      element: JSON
      format: String
      storageKey: String
      publicUrl: String
      createdAt: DateTime!
    }

    type Category {
      id: ID!
      slug: String!
      name: String!
      description: String
    }

    type Technology {
      id: ID!
      slug: String!
      name: String!
      websiteUrl: String
      iconPublicUrl: String
      iconContentType: String
    }

    type CrawlCategory {
      category: Category!
      confidence: Float
    }

    type CrawlTechnology {
      technology: Technology!
      confidence: Float
    }

    type DomainConnection {
      items: [Domain!]!
      nextCursor: String
    }

    type Query {
      domain(id: ID, host: String): Domain
      domains(limit: Int = 20, cursor: String, search: String): DomainConnection!
      url(id: ID!): Url
      crawl(id: ID!): UrlCrawl
      categories(limit: Int = 50): [Category!]!
      technologies(limit: Int = 50): [Technology!]!
    }
  `;
}

export function makeGraphqlResolvers(app) {
  const getDomainHomepageUrl = async (ctx, domainId) => {
    if (ctx.domainHomepageUrlCache.has(domainId)) return ctx.domainHomepageUrlCache.get(domainId);
    const value = await app.services.domains.getHomepageUrl(domainId);
    ctx.domainHomepageUrlCache.set(domainId, value);
    return value;
  };

  const getDomainDerived = async (ctx, domainId) => {
    if (ctx.domainDerivedCache.has(domainId)) return ctx.domainDerivedCache.get(domainId);
    const value = await app.services.domains.getDerivedFromHomepage(domainId, { preferStatus: 'SUCCESS' });
    ctx.domainDerivedCache.set(domainId, value);
    return value;
  };

  const getDomainUrlsCount = async (ctx, domainId) => {
    if (ctx.domainUrlsCountCache.has(domainId)) return ctx.domainUrlsCountCache.get(domainId);
    const value = await app.prisma.url.count({ where: { domainId } });
    ctx.domainUrlsCountCache.set(domainId, value);
    return value;
  };

  return {
    JSON: {
      __parseValue: (v) => v,
      __serialize: (v) => v,
      __parseLiteral: (ast) => ast.value,
    },
    DateTime: {
      __parseValue: (v) => v,
      __serialize: (v) => v,
      __parseLiteral: (ast) => ast.value,
    },
    Query: {
      domain: async (_root, args) => {
        if (args.id) return app.services.domains.getDomainEntity(args.id);
        if (args.host) return app.services.domains.getDomainByHost(args.host);
        return null;
      },
      domains: async (_root, args) => {
        const result = await app.services.domains.listDomains({
          limit: args.limit ?? 20,
          cursor: args.cursor,
          search: args.search,
          includeHomepage: false,
        });
        return { items: result.items, nextCursor: result.nextCursor };
      },
      url: async (_root, args) => app.services.urls.getUrlById(args.id),
      crawl: async (_root, args) => app.services.crawls.getCrawlById(args.id),
      categories: async (_root, args) => {
        const items = await app.services.taxonomies.categories.list();
        return items.slice(0, Math.max(1, Math.min(args.limit ?? 50, 200)));
      },
      technologies: async (_root, args) => {
        const items = await app.services.taxonomies.technologies.list();
        return items.slice(0, Math.max(1, Math.min(args.limit ?? 50, 200)));
      },
    },
    Domain: {
      urlsCount: async (domain, _args, ctx) =>
        typeof domain.urlsCount === 'number' ? domain.urlsCount : getDomainUrlsCount(ctx, domain.id),
      homepageUrl: async (domain, _args, ctx) => getDomainHomepageUrl(ctx, domain.id),
      primaryCategory: async (domain, _args, ctx) => (await getDomainDerived(ctx, domain.id)).primaryCategory,
      categories: async (domain, _args, ctx) => (await getDomainDerived(ctx, domain.id)).categories,
      technologies: async (domain, _args, ctx) => (await getDomainDerived(ctx, domain.id)).technologies,
      homepageScreenshot: async (domain, _args, ctx) => (await getDomainDerived(ctx, domain.id)).screenshot,
      profile: async (domain) => app.services.domains.getProfile(domain.id),
      crawlRuns: async (domain, args) =>
        app.prisma.crawlRun.findMany({
          where: { domainId: domain.id, ...(args.status ? { status: args.status } : {}) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: Math.max(1, Math.min(args.limit ?? 30, 200)),
        }),
      urls: async (domain, args) =>
        app.services.urls.listUrlsForDomain(domain.id, {
          type: args.type ?? undefined,
          limit: args.limit ?? 50,
        }),
    },
    DomainProfile: {
      primaryColorsJson: (profile) => {
        if (!profile.primaryColorsJson) return null;
        try {
          return JSON.parse(profile.primaryColorsJson);
        } catch {
          return profile.primaryColorsJson;
        }
      },
      styleTagsJson: (profile) => {
        if (!profile.styleTagsJson) return null;
        try {
          return JSON.parse(profile.styleTagsJson);
        } catch {
          return profile.styleTagsJson;
        }
      },
    },
    CrawlRun: {
      optionsJson: (crawlRun) => {
        if (!crawlRun.optionsJson) return null;
        try {
          return JSON.parse(crawlRun.optionsJson);
        } catch {
          return crawlRun.optionsJson;
        }
      },
      tags: (crawlRun) => {
        if (!crawlRun.tagsJson) return [];
        try {
          const parsed = JSON.parse(crawlRun.tagsJson);
          return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
        } catch {
          return [];
        }
      },
    },
    Url: {
      latestCrawl: async (url, args) =>
        app.services.crawls.getLatestCrawlForUrl(url.id, { status: args.status ?? undefined }),
      crawlInRun: async (url, args) =>
        app.prisma.urlCrawl.findFirst({
          where: { urlId: url.id, crawlRunId: args.runId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            tasks: true,
            screenshots: { orderBy: [{ createdAt: 'desc' }] },
            sections: { orderBy: [{ index: 'asc' }] },
            categories: { include: { category: true } },
            technologies: { include: { technology: true } },
          },
        }),
      crawls: async (url, args) => {
        const result = await app.services.urls.listUrlCrawls(url.id, { limit: args.limit ?? 20 });
        return result.items;
      },
    },
    UrlCrawl: {
      tasks: async (crawl) => crawl.tasks ?? app.services.crawls.listTasks(crawl.id),
      screenshots: async (crawl) => crawl.screenshots ?? app.services.crawls.listScreenshots(crawl.id),
      sections: async (crawl) => crawl.sections ?? app.services.crawls.listSections(crawl.id),
      categories: async (crawl) => crawl.categories ?? app.services.crawls.listCategories(crawl.id),
      technologies: async (crawl) => crawl.technologies ?? app.services.crawls.listTechnologies(crawl.id),
    },
    SectionScreenshot: {
      clip: (row) => {
        if (!row.clipJson) return null;
        try {
          return JSON.parse(row.clipJson);
        } catch {
          return row.clipJson;
        }
      },
      element: (row) => {
        if (!row.elementJson) return null;
        try {
          return JSON.parse(row.elementJson);
        } catch {
          return row.elementJson;
        }
      },
    },
    CrawlCategory: {
      category: (row) => row.category,
    },
    CrawlTechnology: {
      technology: (row) => row.technology,
    },
  };
}
