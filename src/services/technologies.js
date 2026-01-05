import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function extensionForContentType(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("svg")) return "svg";
  if (value.includes("png")) return "png";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  return "bin";
}

function normalizeText(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length ? normalized : null;
}

export function makeTechnologiesService(app) {
  return {
    async upsertTechnology(input, { signal } = {}) {
      const slug = normalizeText(input?.slug);
      const name = normalizeText(input?.name);
      if (!slug || !name) throw app.httpErrors.badRequest("Invalid technology payload");

      const websiteUrl = normalizeText(input?.websiteUrl);

      const technology = await app.prisma.technology.upsert({
        where: { slug },
        update: { name, websiteUrl: websiteUrl ?? undefined },
        create: { slug, name, websiteUrl: websiteUrl ?? undefined },
      });

      if (technology.iconPublicUrl) return technology;

      try {
        const icon = await app.mb.technologiesFinder.icon(name, {
          as: "uint8Array",
          signal,
        });

        const ext = extensionForContentType(icon.contentType);
        const storageKey = path.posix.join("technology-icons", `${slug}.${ext}`);
        const absolutePath = app.storage.toAbsolutePath(storageKey);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, icon.data);

        return await app.prisma.technology.update({
          where: { id: technology.id },
          data: {
            iconStorageKey: storageKey,
            iconPublicUrl: app.storage.toPublicUrl(storageKey),
            iconContentType: icon.contentType,
          },
        });
      } catch {
        return technology;
      }
    },
  };
}
