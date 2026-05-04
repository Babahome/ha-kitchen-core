# Image de base fournie par Home Assistant
ARG BUILD_FROM
FROM $BUILD_FROM

# Installer Node.js
RUN apk add --no-cache nodejs npm

# Copier les fichiers
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .

RUN mkdir -p /data
EXPOSE 8099

CMD ["node", "server.js"]
