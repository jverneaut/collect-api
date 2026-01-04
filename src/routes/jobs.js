const JobParamsSchema = {
  type: 'object',
  required: ['jobId'],
  additionalProperties: false,
  properties: { jobId: { type: 'string', minLength: 1 } },
};

export async function jobsRoutes(app) {
  app.get(
    '/jobs/:jobId',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Get job status',
        params: JobParamsSchema,
      },
    },
    async (request, reply) => {
      const job = app.jobs.get(request.params.jobId);
      if (!job) throw app.httpErrors.notFound('Job not found');
      reply.ok(job);
    }
  );

  app.get(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'List jobs',
      },
    },
    async (_request, reply) => {
      reply.ok({ items: app.jobs.list() });
    }
  );
}
