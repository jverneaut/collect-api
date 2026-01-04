import { writeFile, mkdir } from "fs/promises";
import path from "path";

function stripWww(host) {
  return host?.toLowerCase()?.startsWith("www.")
    ? host.slice(4).toLowerCase()
    : host?.toLowerCase();
}

function guessUrlType(rawType) {
  const value = String(rawType || "").toLowerCase();
  const table = {
    homepage: "HOMEPAGE",
    home: "HOMEPAGE",
    index: "HOMEPAGE",
    about: "ABOUT",
    "about-us": "ABOUT",
    contact: "CONTACT",
    "contact-us": "CONTACT",
    pricing: "PRICING",
    blog: "BLOG",
    careers: "CAREERS",
    jobs: "CAREERS",
    docs: "DOCS",
    documentation: "DOCS",
    terms: "TERMS",
    privacy: "PRIVACY",
  };
  return table[value] || "OTHER";
}

function normalizePagesResult(result) {
  const pages = Array.isArray(result)
    ? result
    : Array.isArray(result?.pages)
      ? result.pages
      : Array.isArray(result?.items)
        ? result.items
        : [];
  return pages
    .map((p) => ({
      url: p?.url || p?.href || p?.link,
      type: p?.type || p?.category || p?.pageType || p?.purpose,
    }))
    .filter((p) => typeof p.url === "string" && p.url.length > 0);
}

function clampConfidence(value) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const normalized = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, normalized));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTechnologiesResult(result) {
  const items = Array.isArray(result)
    ? result
    : Array.isArray(result?.technologies)
      ? result.technologies
      : Array.isArray(result?.items)
        ? result.items
        : [];
  return items
    .map((t) => {
      const name = t?.name || t?.technology || t?.slug || t?.id;
      const slug = slugify(t?.slug || t?.id || name);
      const websiteUrl = t?.websiteUrl || t?.website || t?.url;
      const confidence = clampConfidence(
        t?.confidence || t?.confidenceScore || t?.score,
      );
      if (!slug || !name) return null;
      return {
        slug,
        name: String(name),
        websiteUrl: websiteUrl ? String(websiteUrl) : null,
        confidence,
      };
    })
    .filter(Boolean);
}

function normalizeTechnologiesScope(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    ["per_url", "per-url", "perurl", "url", "urls", "all"].includes(normalized)
  )
    return "PER_URL";
  return "HOMEPAGE";
}

function isShopifyFromTechnologies(technologies) {
  return technologies.some(
    (t) =>
      t.slug === "shopify" || String(t.name).toLowerCase().includes("shopify"),
  );
}

function pickTechnologiesForPagesFinder(technologies, limit = 50) {
  const slugs = technologies.map((t) => t.slug).filter(Boolean);
  return slugs.slice(0, limit);
}

function extensionForContentType(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("png")) return "png";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  return "bin";
}

function safeStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

async function runWithLimit(limit, items, worker) {
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, 50));
  let index = 0;
  let active = 0;
  const results = [];

  return await new Promise((resolve, reject) => {
    const next = () => {
      if (index >= items.length && active === 0) return resolve(results);
      while (active < concurrency && index < items.length) {
        const currentIndex = index++;
        active++;
        Promise.resolve(worker(items[currentIndex], currentIndex))
          .then((value) => {
            results[currentIndex] = value;
            active--;
            next();
          })
          .catch(reject);
      }
    };
    next();
  });
}

export function makeIngestionService(app) {
  return {
    async ingestDomain(domainId, options, { update, signal, crawlRunId } = {}) {
      const domain = await app.services.domains.getDomainEntity(domainId);
      if (!domain) throw app.httpErrors.notFound("Domain not found");

      const maxUrls = Math.max(1, Math.min(Number(options.maxUrls ?? 20), 200));
      const urlConcurrency = Math.max(
        1,
        Math.min(Number(options.urlConcurrency ?? 3), 20),
      );

      const technologiesScope = normalizeTechnologiesScope(
        options.technologies?.scope,
      );

      let discoveryTechnologies = [];
      let discoveryTechnologiesError = null;
      let isShopify =
        options.isShopify === true || options.isShopify === false
          ? options.isShopify
          : null;

      const shouldDetectTechnologiesForDiscovery =
        technologiesScope === "HOMEPAGE" || isShopify === null;
      if (shouldDetectTechnologiesForDiscovery) {
        update({ progress: { stage: "detecting_technologies_for_discovery" } });
        try {
          const raw = await app.mb.technologiesFinder.technologies(
            domain.canonicalUrl,
            {
              fast: true,
              recursive: false,
              maxDepth: 1,
              maxUrls: 3,
              timeoutMs: options.technologies?.timeoutMs ?? 60_000,
              signal,
            },
          );
          discoveryTechnologies = normalizeTechnologiesResult(raw);
        } catch (error) {
          discoveryTechnologiesError = error;
          if (isShopify === null) isShopify = false;
          update({
            progress: {
              stage: "detecting_technologies_for_discovery_failed",
              error:
                error?.message || "Failed to detect technologies for discovery",
            },
          });
        }

        if (isShopify === null && !discoveryTechnologiesError) {
          isShopify = isShopifyFromTechnologies(discoveryTechnologies);
        }
      }

      const technologiesForPagesFinder = pickTechnologiesForPagesFinder(
        discoveryTechnologies,
      );

      update({
        progress: {
          stage: "discovering_pages",
          isShopify,
          technologies: technologiesForPagesFinder.length,
        },
      });

      const pagesRaw = await app.mb.pagesFinder.pages(domain.canonicalUrl, {
        isShopify,
        technologies: technologiesForPagesFinder.length
          ? technologiesForPagesFinder
          : undefined,
        signal,
      });
      const pages = normalizePagesResult(pagesRaw);

      const filtered = pages
        .filter((p) => {
          const host = stripWww(new URL(p.url).host);
          return host === stripWww(domain.host);
        })
        .slice(0, maxUrls);

      update({
        progress: { stage: "upserting_urls", discoveredUrls: filtered.length },
      });

      const urls = [];
      for (const page of filtered) {
        const type = guessUrlType(page.type);
        const url = await app.services.urls.upsertUrlForDomain(domain.id, {
          url: page.url,
          type,
          isCanonical: type === "HOMEPAGE",
        });
        urls.push(url);
      }

      if (!urls.some((u) => u.type === "HOMEPAGE")) {
        const homepage = await app.services.urls.upsertUrlForDomain(domain.id, {
          url: domain.canonicalUrl,
          type: "HOMEPAGE",
          isCanonical: true,
        });
        if (!urls.some((u) => u.id === homepage.id)) urls.unshift(homepage);
      }

      update({ progress: { stage: "crawling_urls", urls: urls.length } });

      const homepageUrl = urls.find((u) => u.type === "HOMEPAGE") ?? null;

      let sharedTechnologyIdsBySlug = null;
      if (technologiesScope === "HOMEPAGE" && discoveryTechnologies.length) {
        sharedTechnologyIdsBySlug = await app.prisma.$transaction(
          async (tx) => {
            const map = new Map();
            for (const tech of discoveryTechnologies) {
              const technology = await tx.technology.upsert({
                where: { slug: tech.slug },
                update: {
                  name: tech.name,
                  websiteUrl: tech.websiteUrl ?? undefined,
                },
                create: {
                  slug: tech.slug,
                  name: tech.name,
                  websiteUrl: tech.websiteUrl ?? undefined,
                },
              });
              map.set(tech.slug, technology.id);
            }
            return map;
          },
        );
      }

      const precomputedTechnologiesByUrlId = new Map();
      if (
        technologiesScope === "PER_URL" &&
        homepageUrl &&
        discoveryTechnologies.length
      ) {
        precomputedTechnologiesByUrlId.set(
          homepageUrl.id,
          discoveryTechnologies,
        );
      }

      const results = await runWithLimit(urlConcurrency, urls, async (url) => {
        const tasks = [
          "SCREENSHOT",
          "TECHNOLOGIES",
          ...(url.type === "HOMEPAGE" ? ["SECTIONS"] : []),
        ];
        const crawl = await app.services.crawls.createCrawl(url.id, {
          tasks,
          crawlRunId,
        });

        await app.services.crawls.patchCrawl(crawl.id, {
          status: "RUNNING",
          startedAt: new Date().toISOString(),
        });

        const screenshotPromise = (async () => {
          await app.services.crawls.patchTask(crawl.id, "SCREENSHOT", {
            status: "RUNNING",
          });
          const { buffer, contentType } = await app.mb.screenshotter.screenshot(
            url.normalizedUrl,
            {
              format: options.screenshot?.format ?? "png",
              fullPage: options.screenshot?.fullPage ?? true,
              adblock: options.screenshot?.adblock ?? true,
              waitMs: options.screenshot?.waitMs ?? 500,
              timeoutMs: options.screenshot?.timeoutMs ?? 90_000,
              signal,
            },
          );

          const ext = extensionForContentType(contentType);
          const storageKey = path.posix.join(
            "screenshots",
            domain.host,
            `${crawl.id}.${ext}`,
          );
          const absolutePath = app.storage.toAbsolutePath(storageKey);
          await mkdir(path.dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, buffer);

          const screenshot = await app.prisma.screenshot.create({
            data: {
              crawlId: crawl.id,
              kind: "FULL_PAGE",
              format: ext,
              storageKey,
              publicUrl: app.storage.toPublicUrl(storageKey),
            },
          });

          await app.services.crawls.patchTask(crawl.id, "SCREENSHOT", {
            status: "SUCCESS",
          });
          return screenshot;
        })();

        const sectionsPromise =
          url.type === "HOMEPAGE"
            ? (async () => {
                await app.services.crawls.patchTask(crawl.id, "SECTIONS", {
                  status: "RUNNING",
                });

                const result = await app.mb.screenshotter.sections(
                  url.normalizedUrl,
                  {
                    format: options.screenshot?.format ?? "png",
                    fullPage: options.screenshot?.fullPage ?? true,
                    adblock: options.screenshot?.adblock ?? true,
                    waitMs: options.screenshot?.waitMs ?? 500,
                    timeoutMs: options.screenshot?.timeoutMs ?? 90_000,
                    signal,
                  },
                );

                const ext = extensionForContentType(result.contentType);
                const stored = [];

                for (const [fallbackIndex, section] of (
                  result.sections ?? []
                ).entries()) {
                  if (!section?.buffer?.length) continue;
                  const index = Number.isFinite(section.index)
                    ? section.index
                    : fallbackIndex;
                  const storageKey = path.posix.join(
                    "sections",
                    domain.host,
                    crawl.id,
                    `${index}.${ext}`,
                  );
                  const absolutePath = app.storage.toAbsolutePath(storageKey);
                  await mkdir(path.dirname(absolutePath), { recursive: true });
                  await writeFile(absolutePath, section.buffer);

                  stored.push({
                    crawlId: crawl.id,
                    index,
                    clipJson: safeStringify(section.clip),
                    elementJson: safeStringify(section.element),
                    format: ext,
                    storageKey,
                    publicUrl: app.storage.toPublicUrl(storageKey),
                  });
                }

                await app.services.crawls.setSections(crawl.id, {
                  items: stored,
                });

                await app.services.crawls.patchTask(crawl.id, "SECTIONS", {
                  status: "SUCCESS",
                });

                return stored.length;
              })()
            : null;

        const technologiesPromise = (async () => {
          await app.services.crawls.patchTask(crawl.id, "TECHNOLOGIES", {
            status: "RUNNING",
          });
          if (technologiesScope === "HOMEPAGE") {
            if (discoveryTechnologiesError) throw discoveryTechnologiesError;

            await app.prisma.$transaction(async (tx) => {
              await tx.crawlTechnology.deleteMany({
                where: { crawlId: crawl.id },
              });
              for (const tech of discoveryTechnologies) {
                const technologyId = sharedTechnologyIdsBySlug?.get(tech.slug);
                const resolvedTechnologyId =
                  technologyId ??
                  (
                    await tx.technology.upsert({
                      where: { slug: tech.slug },
                      update: {
                        name: tech.name,
                        websiteUrl: tech.websiteUrl ?? undefined,
                      },
                      create: {
                        slug: tech.slug,
                        name: tech.name,
                        websiteUrl: tech.websiteUrl ?? undefined,
                      },
                    })
                  ).id;

                await tx.crawlTechnology.create({
                  data: {
                    crawlId: crawl.id,
                    technologyId: resolvedTechnologyId,
                    confidence: tech.confidence ?? undefined,
                  },
                });
              }
            });

            await app.services.crawls.patchTask(crawl.id, "TECHNOLOGIES", {
              status: "SUCCESS",
            });
            return discoveryTechnologies.length;
          }

          const precomputed = precomputedTechnologiesByUrlId.get(url.id);
          const technologies =
            precomputed ??
            normalizeTechnologiesResult(
              await app.mb.technologiesFinder.technologies(url.normalizedUrl, {
                timeoutMs: options.technologies?.timeoutMs ?? 60_000,
                signal,
              }),
            );

          await app.prisma.$transaction(async (tx) => {
            await tx.crawlTechnology.deleteMany({
              where: { crawlId: crawl.id },
            });
            for (const tech of technologies) {
              const technology = await tx.technology.upsert({
                where: { slug: tech.slug },
                update: {
                  name: tech.name,
                  websiteUrl: tech.websiteUrl ?? undefined,
                },
                create: {
                  slug: tech.slug,
                  name: tech.name,
                  websiteUrl: tech.websiteUrl ?? undefined,
                },
              });
              await tx.crawlTechnology.create({
                data: {
                  crawlId: crawl.id,
                  technologyId: technology.id,
                  confidence: tech.confidence ?? undefined,
                },
              });
            }
          });

          await app.services.crawls.patchTask(crawl.id, "TECHNOLOGIES", {
            status: "SUCCESS",
          });
          return technologies.length;
        })();

        const promises = [screenshotPromise, technologiesPromise];
        if (sectionsPromise) promises.push(sectionsPromise);

        const [screenshotResult, technologiesResult, sectionsResult] =
          await Promise.allSettled(promises);

        const errors = [];
        const screenshotOk = screenshotResult.status === "fulfilled";
        const technologiesOk = technologiesResult.status === "fulfilled";
        const sectionsOk = sectionsPromise
          ? sectionsResult?.status === "fulfilled"
          : true;

        if (!screenshotOk) {
          errors.push(
            `screenshot: ${screenshotResult.reason?.message || "failed"}`,
          );
          await app.services.crawls.patchTask(crawl.id, "SCREENSHOT", {
            status: "FAILED",
            error: screenshotResult.reason?.message || "Screenshot failed",
          });
        }

        if (!technologiesOk) {
          errors.push(
            `technologies: ${technologiesResult.reason?.message || "failed"}`,
          );
          await app.services.crawls.patchTask(crawl.id, "TECHNOLOGIES", {
            status: "FAILED",
            error:
              technologiesResult.reason?.message ||
              "Technologies detection failed",
          });
        }

        if (sectionsPromise && !sectionsOk) {
          errors.push(`sections: ${sectionsResult.reason?.message || "failed"}`);
          await app.services.crawls.patchTask(crawl.id, "SECTIONS", {
            status: "FAILED",
            error:
              sectionsResult.reason?.message || "Sections screenshotting failed",
          });
        }

        const crawlStatus = screenshotOk ? "SUCCESS" : "FAILED";
        await app.services.crawls.patchCrawl(crawl.id, {
          status: crawlStatus,
          finishedAt: new Date().toISOString(),
          crawledAt: new Date().toISOString(),
          finalUrl: url.normalizedUrl,
          error: errors.length ? errors.join("; ") : undefined,
        });

        return { urlId: url.id, crawlId: crawl.id, status: crawlStatus };
      });

      update({ progress: { stage: "done", crawledUrls: results.length } });
      return {
        domainId: domain.id,
        urlsCreatedOrUpdated: urls.length,
        crawls: results,
      };
    },
  };
}
