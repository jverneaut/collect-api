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

    enum TaskStatus {
      PENDING
      RUNNING
      SUCCESS
      FAILED
    }

    enum CrawlTaskType {
      SCREENSHOT
      TECHNOLOGIES
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
      createdAt: DateTime!
      updatedAt: DateTime!
      urlsCount: Int!
      homepageUrl: Url
      primaryCategory: Category
      categories: [Category!]!
      technologies: [Technology!]!
      homepageScreenshot: Screenshot
      profile: DomainProfile
      urls(type: UrlType, limit: Int = 50): [Url!]!
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
      crawls(limit: Int = 20): [UrlCrawl!]!
    }

    type UrlCrawl {
      id: ID!
      urlId: ID!
      status: CrawlStatus!
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
      width: Int
      height: Int
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
    Url: {
      latestCrawl: async (url, args) =>
        app.services.crawls.getLatestCrawlForUrl(url.id, { status: args.status ?? undefined }),
      crawls: async (url, args) => {
        const result = await app.services.urls.listUrlCrawls(url.id, { limit: args.limit ?? 20 });
        return result.items;
      },
    },
    UrlCrawl: {
      tasks: async (crawl) => crawl.tasks ?? app.services.crawls.listTasks(crawl.id),
      screenshots: async (crawl) => crawl.screenshots ?? app.services.crawls.listScreenshots(crawl.id),
      categories: async (crawl) => crawl.categories ?? app.services.crawls.listCategories(crawl.id),
      technologies: async (crawl) => crawl.technologies ?? app.services.crawls.listTechnologies(crawl.id),
    },
    CrawlCategory: {
      category: (row) => row.category,
    },
    CrawlTechnology: {
      technology: (row) => row.technology,
    },
  };
}
