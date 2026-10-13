# 物联网设备管理系统部署文档

## 系统架构

本系统采用微服务架构，包括以下组件：
- API服务（NestJS）
- 前端服务（Vue.js）
- 数据库（PostgreSQL）
- MQTT代理（EMQX）
- 缓存（Redis）
- 时间序列数据库（InfluxDB）

## 部署方式

### 方式一：Docker Compose部署（推荐）

1. 确保已安装Docker和Docker Compose
2. 准备环境变量文件 `.env`
3. 运行以下命令：

```bash
# 启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api
```

### 方式二：独立部署

#### 后端API部署

1. 安装Node.js 16+
2. 配置数据库连接
3. 安装依赖并启动服务

```bash
cd api
npm install
npm run build
npm start
```

#### 前端部署

1. 安装Node.js 16+
2. 构建静态文件

```bash
cd client
npm install
npm run build
```

3. 使用Nginx等Web服务器部署dist目录

## 环境变量配置

创建 `.env` 文件：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=iot_system

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379

# MQTT配置
MQTT_BROKER_URL=mqtt://localhost:1883

# JWT配置
JWT_SECRET=your_jwt_secret_here

# 邮件服务配置
SENDGRID_API_KEY=YOUR_SECRET

# 企业微信Webhook
WECHAT_WEBHOOK_URL=your_wechat_webhook_url

# ERP集成配置
YONYOU_ERP_API_URL=https://api.yonyou.com
YONYOU_API_KEY=YOUR_SECRET
YONYOU_USERNAME=your_username
YONYOU_PASSWORD=YOUR_PASSWORD

# 阿里云短信配置
ALIBABA_ACCESS_KEY_ID=your_access_key_id
ALIBABA_ACCESS_KEY_SECRET=your_access_key_secret
SMS_SIGN_NAME=IoT系统
SMS_TEMPLATE_CODE=SMS_XXXXX

# 腾讯云语音配置
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=YOUR_SECRET
TENCENT_REGION=ap-beijing
```

## 系统初始化

1. 数据库初始化：执行 `database/schema.sql`
2. 创建初始用户
3. 配置MQTT代理
4. 设置通知渠道

## 监控与日志

- API服务日志：`docker-compose logs -f api`
- 数据库监控：通过PostgreSQL自带工具
- MQTT监控：EMQX Dashboard（http://localhost:18083）

## 安全配置

1. 修改默认密码
2. 配置HTTPS
3. 设置防火墙规则
4. 定期备份数据

## 性能调优

1. 数据库索引优化
2. Redis缓存策略
3. 负载均衡配置
4. 数据归档策略

## 备份与恢复

### 数据库备份

```bash
# 备份
docker exec iot_postgres pg_dump -U postgres iot_system > backup.sql

# 恢复
docker exec -i iot_postgres psql -U postgres -d iot_system < backup.sql
```

### 配置备份

备份以下内容：
- 数据库数据
- MQTT配置
- 系统配置文件
- 证书文件

## 故障排除

常见问题及解决方案：

1. 服务启动失败：检查日志输出
2. 数据库连接失败：验证连接配置
3. MQTT连接失败：检查网络和认证配置
4. 前端无法访问API：检查跨域配置

## 升级指南

1. 备份当前系统
2. 停止服务
3. 拉取最新代码
4. 执行升级脚本
5. 启动服务
6. 验证功能

## 联系支持

如有问题请联系技术支持团队。