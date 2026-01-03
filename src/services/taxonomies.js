export function makeTaxonomiesService(app) {
  return {
    categories: {
      list: async () => app.prisma.category.findMany({ orderBy: [{ slug: 'asc' }] }),
      create: async (data) => app.prisma.category.create({ data }),
      get: async (id) => app.prisma.category.findUnique({ where: { id } }),
      update: async (id, data) => app.prisma.category.update({ where: { id }, data }),
      delete: async (id) => app.prisma.category.delete({ where: { id } }),
    },
    technologies: {
      list: async () => app.prisma.technology.findMany({ orderBy: [{ slug: 'asc' }] }),
      create: async (data) => app.prisma.technology.create({ data }),
      get: async (id) => app.prisma.technology.findUnique({ where: { id } }),
      update: async (id, data) => app.prisma.technology.update({ where: { id }, data }),
      delete: async (id) => app.prisma.technology.delete({ where: { id } }),
    },
  };
}

