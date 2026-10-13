# IoT Device Management System - Client

物联网设备管理系统前端界面

## 功能特性

- **仪表板**: 实时设备状态概览
- **设备管理**: 设备列表、添加、编辑、删除
- **报警中心**: 实时报警处理和管理
- **工单管理**: 维护工单创建和跟踪
- **预测维护**: 设备健康度分析和预测
- **报表分析**: 数据可视化和统计分析
- **系统设置**: 用户配置和系统参数

## 技术栈

- Vue 3
- Element Plus (UI组件库)
- ECharts (数据可视化)
- Vite (构建工具)
- Axios (HTTP客户端)

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run dev
```

应用将在 http://localhost:8080 启动

### 构建生产版本

```bash
npm run build
```

构建后的文件将位于 `dist` 目录

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
src/
├── components/     # 公共组件
├── views/         # 页面组件
├── router/        # 路由配置
├── stores/        # 状态管理
└── assets/        # 静态资源
```

## API 代理

开发环境下，API 请求将通过 Vite 代理到后端服务 (默认 http://localhost:3000)

## 浏览器兼容性

- Chrome >= 87
- Firefox >= 78
- Safari >= 14
- Edge >= 87

## 部署

构建后的静态文件可以部署到任何 Web 服务器，如 Nginx、Apache 等。

## 许可证

MIT