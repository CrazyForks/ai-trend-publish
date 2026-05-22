FROM denoland/deno:2.3.7

WORKDIR /app

ENV DENO_DIR=/deno-dir
ENV TRENDPUBLISH_RUNTIME=docker
ENV TRENDPUBLISH_CONFIG=/app/config/trendpublish.config.ts

COPY deno.json deno.lock ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY trendpublish.config.example.ts ./trendpublish.config.example.ts
COPY trendpublish.config.docker.example.ts ./trendpublish.config.docker.example.ts
COPY trendpublish.config.cloudflare.ts ./trendpublish.config.cloudflare.ts
COPY wrangler.jsonc ./wrangler.jsonc

RUN deno cache src/index.ts src/apps/weixin-relay/server.ts scripts/run.workflow.ts scripts/doctor.ts scripts/preview.weixin.ts
RUN mkdir -p /app/config /app/src/temp \
  && ln -s /app/src /app/config/src \
  && chown -R deno:deno /app /deno-dir

USER deno

EXPOSE 8000

CMD ["deno", "task", "start"]
