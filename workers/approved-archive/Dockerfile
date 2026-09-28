FROM node:22-bookworm-slim

ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY workers/approved-archive/package.json ./package.json
RUN npm install --omit=dev
COPY workers/approved-archive/worker.mjs ./worker.mjs
COPY src/assets/hod-stamp.png ./assets/hod-stamp.png
COPY src/assets/iqa-stamp.png ./assets/iqa-stamp.png

USER node
CMD ["npm", "start"]
