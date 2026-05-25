import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from './runtime/env';
import { logError, logInfo } from './runtime/log';
import { sessionStore } from './runtime/sessionStore';
import { registerRoutes } from './api/routes';

async function startApiServer() {
    const app = Fastify({
        bodyLimit: 5 * 1024 * 1024,
        logger: false,
    });

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(cors, { origin: '*' });

    registerRoutes(app);

    // Dev-only browser test harness (validates the live RTC audio loop on :PORT/test).
    if (env.NODE_ENV !== 'production') {
        app.get('/test', async (_req, reply) => {
            reply
                .type('text/html')
                .send(readFileSync(join(process.cwd(), 'sources/test/harness.html'), 'utf8'));
        });
        logInfo('Dev test harness available at /test');
    }

    await app.listen({ host: env.HOST, port: env.PORT });
    logInfo(`happy-voice listening on http://${env.HOST}:${env.PORT}`);
}

async function run() {
    logInfo(`Booting happy-voice env=${env.NODE_ENV}`);

    setInterval(() => {
        sessionStore.pruneExpired();
    }, 5 * 60 * 1000).unref();

    await startApiServer();
}

run().catch((error) => {
    logError('Fatal startup error', error);
    process.exit(1);
});
