FROM node:20-alpine

RUN apk add --no-cache nmap nmap-scripts

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 5050
CMD ["npm", "start"]
