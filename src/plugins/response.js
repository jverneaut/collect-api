import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';

function toPublicError(error, request) {
  if (error.validation) {
    return {
      statusCode: 400,
      payload: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        statusCode: 409,
        payload: {
          code: 'CONFLICT',
          message: 'Resource already exists',
          details: { target: error.meta?.target },
        },
      };
    }
    if (error.code === 'P2021' || error.code === 'P2022') {
      return {
        statusCode: 500,
        payload: {
          code: 'DATABASE_SCHEMA_OUTDATED',
          message: 'Database schema is out of date. Run `npm run db:migrate` and restart the server.',
          details: { prisma: { code: error.code, meta: error.meta } },
        },
      };
    }
    if (error.code === 'P2025') {
      return {
        statusCode: 404,
        payload: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      };
    }
    if (error.code === 'P2003') {
      return {
        statusCode: 409,
        payload: {
          code: 'CONFLICT',
          message: 'Operation violates a foreign key constraint',
          details: { field: error.meta?.field_name },
        },
      };
    }
  }

  if (error.statusCode && error.message) {
    return {
      statusCode: error.statusCode,
      payload: {
        code: error.code || 'HTTP_ERROR',
        message: error.message,
        details: error.details,
      },
    };
  }

  request.log.error({ error }, 'Unhandled error');
  return {
    statusCode: 500,
    payload: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' },
  };
}

export const responsePlugin = fp(async (app) => {
  app.decorateReply('ok', function ok(data, meta) {
    this.send({ ok: true, data, meta });
  });

  app.decorateReply('fail', function fail(error, statusCode = 400) {
    this.code(statusCode).send({ ok: false, error });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const publicError = toPublicError(error, request);
    reply.code(publicError.statusCode).send({ ok: false, error: publicError.payload });
  });
});
