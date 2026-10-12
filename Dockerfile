FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# De server heeft geen runtime-dependencies: alleen server/ en dist/ zijn nodig.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
# Software Bill of Materials (CycloneDX) van wat in dit image zit, voor scanners.
COPY sbom/app.cdx.json ./sbom/app.cdx.json
LABEL org.opencontainers.image.licenses="AGPL-3.0-only" \n      org.opencontainers.image.source="https://github.com/ProAdmin007/Groningen050Parkeren-Live"
# Historie voor de trendanalyse; koppel een volume om die te bewaren bij updates.
RUN mkdir -p data && chown node:node data
VOLUME /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/index.js"]
