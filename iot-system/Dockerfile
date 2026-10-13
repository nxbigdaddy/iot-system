# 多阶段构建 - API服务
FROM node:16-alpine AS api-build

WORKDIR /app/api
COPY api/package*.json ./
RUN npm install

COPY api/ .
RUN npm run build

# 多阶段构建 - 客户端
FROM node:16-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install

COPY client/ .
RUN npm run build

# 生产环境 - API服务
FROM node:16-alpine AS api-prod

WORKDIR /app/api
COPY api/package*.json ./
RUN npm install --only=production

COPY --from=api-build /app/api/dist ./dist
COPY api/src ./src

EXPOSE 3000

CMD ["node", "dist/main.js"]

# 生产环境 - Nginx用于前端
FROM nginx:alpine AS client-prod

COPY --from=client-build /app/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]