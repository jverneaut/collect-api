const CreateCategorySchema = {
  type: 'object',
  required: ['slug', 'name'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
  },
};

const UpdateCategorySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
  },
};

const CreateTechnologySchema = {
  type: 'object',
  required: ['slug', 'name'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    websiteUrl: { type: 'string' },
  },
};

const UpdateTechnologySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    websiteUrl: { type: 'string' },
  },
};

const IdParamSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1 } },
};

export async function taxonomyRoutes(app) {
  app.get('/categories', async (_request, reply) => {
    const items = await app.services.taxonomies.categories.list();
    reply.ok({ items });
  });

  app.post('/categories', { schema: { body: CreateCategorySchema } }, async (request, reply) => {
    const category = await app.services.taxonomies.categories.create(request.body);
    reply.code(201).ok(category);
  });

  app.get('/categories/:id', { schema: { params: IdParamSchema } }, async (request, reply) => {
    const category = await app.services.taxonomies.categories.get(request.params.id);
    if (!category) throw app.httpErrors.notFound('Category not found');
    reply.ok(category);
  });

  app.patch(
    '/categories/:id',
    { schema: { params: IdParamSchema, body: UpdateCategorySchema } },
    async (request, reply) => {
      const category = await app.services.taxonomies.categories.update(request.params.id, request.body);
    reply.ok(category);
    }
  );

  app.delete('/categories/:id', { schema: { params: IdParamSchema } }, async (request, reply) => {
    await app.services.taxonomies.categories.delete(request.params.id);
    reply.ok({ deleted: true });
  });

  app.get('/technologies', async (_request, reply) => {
    const items = await app.services.taxonomies.technologies.list();
    reply.ok({ items });
  });

  app.post('/technologies', { schema: { body: CreateTechnologySchema } }, async (request, reply) => {
    const technology = await app.services.taxonomies.technologies.create(request.body);
    reply.code(201).ok(technology);
  });

  app.get('/technologies/:id', { schema: { params: IdParamSchema } }, async (request, reply) => {
    const technology = await app.services.taxonomies.technologies.get(request.params.id);
    if (!technology) throw app.httpErrors.notFound('Technology not found');
    reply.ok(technology);
  });

  app.patch('/technologies/:id', { schema: { params: IdParamSchema, body: UpdateTechnologySchema } }, async (request, reply) => {
    const technology = await app.services.taxonomies.technologies.update(request.params.id, request.body);
    reply.ok(technology);
  });

  app.delete('/technologies/:id', { schema: { params: IdParamSchema } }, async (request, reply) => {
    await app.services.taxonomies.technologies.delete(request.params.id);
    reply.ok({ deleted: true });
  });
}
