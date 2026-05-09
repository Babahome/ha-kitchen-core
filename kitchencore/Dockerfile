ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .

RUN mkdir -p /data
EXPOSE 8099
CMD ["node", "server.js"]
