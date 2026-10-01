FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/server/package.json apps/server/package.json
RUN cd apps/server && npm install --omit=dev
COPY apps/server/src ./apps/server/src
COPY apps/player ./apps/player
EXPOSE 3000
CMD ["npm","start"]
