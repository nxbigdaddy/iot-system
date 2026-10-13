<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside width="200px" class="sidebar">
      <div class="logo">
        <h3>IoT管理系统</h3>
      </div>
      <el-menu
        :default-active="$route.path"
        router
        class="sidebar-menu"
        background-color="#545c64"
        text-color="#fff"
        active-text-color="#ffd04b"
      >
        <el-menu-item index="/dashboard">
          <el-icon><House /></el-icon>
          <span>仪表板</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <span>设备管理</span>
        </el-menu-item>
        <el-sub-menu index="alarms">
          <template #title>
            <el-icon><Bell /></el-icon>
            <span>报警中心</span>
          </template>
          <el-menu-item index="/alarms/list">报警列表</el-menu-item>
          <el-menu-item index="/alarms/rules">报警规则</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="maintenance">
          <template #title>
            <el-icon><Management /></el-icon>
            <span>维护管理</span>
          </template>
          <el-menu-item index="/workorders">工单管理</el-menu-item>
          <el-menu-item index="/maintenance/schedules">维护计划</el-menu-item>
          <el-menu-item index="/maintenance/logs">维护日志</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/materials">
          <el-icon><Box /></el-icon>
          <span>物料管理</span>
        </el-menu-item>
        <el-menu-item index="/dtu">
          <el-icon><Connection /></el-icon>
          <span>DTU管理</span>
        </el-menu-item>
        <el-menu-item index="/simcards">
          <el-icon><Iphone /></el-icon>
          <span>物联网卡</span>
        </el-menu-item>
        <el-menu-item index="/reports">
          <el-icon><PieChart /></el-icon>
          <span>报表分析</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container>
      <el-header class="main-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentRouteName }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleUserCommand">
            <span class="el-dropdown-link">
              <el-avatar :size="30" :src="userAvatar" />
              {{ currentUser.username }} <el-icon><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人资料</el-dropdown-item>
                <el-dropdown-item command="settings">系统设置</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>

      <el-footer class="main-footer">
        <div class="footer-content">
          <span>物联网设备管理系统 © 2023</span>
          <span>版本: 1.0.0</span>
        </div>
      </el-footer>
    </el-container>
  </el-container>
</template>

<script>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  House, Monitor, Bell, Management, Box, 
  Connection, Iphone, PieChart, User, ArrowDown 
} from '@element-plus/icons-vue'

export default {
  name: 'Layout',
  components: {
    House, Monitor, Bell, Management, Box, 
    Connection, Iphone, PieChart, User, ArrowDown
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    
    const currentUser = JSON.parse(localStorage.getItem('user')) || {}
    
    const currentRouteName = computed(() => {
      const routeMap = {
        '/dashboard': '仪表板',
        '/devices': '设备管理',
        '/alarms/list': '报警列表',
        '/alarms/rules': '报警规则',
        '/workorders': '工单管理',
        '/maintenance/schedules': '维护计划',
        '/maintenance/logs': '维护日志',
        '/materials': '物料管理',
        '/dtu': 'DTU管理',
        '/simcards': '物联网卡',
        '/reports': '报表分析',
        '/users': '用户管理'
      }
      return routeMap[route.path] || '未知页面'
    })

    const userAvatar = 'https://cube.elemecdn.com/0/88/03b0d39583f4c964e6c35b8b982ef.png' // 默认头像

    const handleUserCommand = (command) => {
      switch(command) {
        case 'profile':
          router.push('/profile')
          break
        case 'settings':
          router.push('/settings')
          break
        case 'logout':
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          router.push('/login')
          break
      }
    }

    return {
      currentUser,
      currentRouteName,
      userAvatar,
      handleUserCommand
    }
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background-color: #545c64;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #4a525d;
  color: white;
}

.sidebar-menu {
  border: none;
  height: calc(100% - 60px);
}

.main-header {
  background-color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0,21,41,.08);
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
}

.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.main-content {
  margin-top: 20px;
  background-color: #f0f2f5;
  min-height: calc(100vh - 120px);
}

.main-footer {
  background-color: white;
  padding: 10px 20px;
  border-top: 1px solid #e6e6e6;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  color: #999;
}

@media (max-width: 768px) {
  .sidebar {
    width: 64px;
  }
  
  .sidebar-menu :deep(.el-menu-item span) {
    display: none;
  }
  
  .sidebar-menu :deep(.el-sub-menu .el-sub-menu__title span) {
    display: none;
  }
}
</style>