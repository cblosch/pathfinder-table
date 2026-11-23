# Pathfinder Table: a small Node server with no build step.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# The only dependency is the optional Anthropic SDK (for AI map reading and
# handout text). It installs if it can; the app runs without it.
RUN npm ci --omit=dev || npm install --omit=dev --no-optional
COPY server.js ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=3000 PF_TABLE_DATA=/data/games
# Games are saved as JSON files here: mount a persistent volume on /data.
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
