<template>
  <div class="dashboard-container">
    <!-- 顶部导航 -->
    <el-header class="dashboard-header">
      <div class="header-left">
        <h2>设备管理系统</h2>
      </div>
      <div class="header-right">
        <el-dropdown @command="handleUserCommand">
          <span class="el-dropdown-link">
            {{ currentUser.username }} <el-icon><arrow-down /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人资料</el-dropdown-item>
              <el-dropdown-item command="settings">设置</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <!-- 主体内容 -->
    <el-container>
      <!-- 侧边栏 -->
      <el-aside width="200px" class="sidebar">
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
          <el-menu-item index="/alarms">
            <el-icon><Bell /></el-icon>
            <span>报警中心</span>
          </el-menu-item>
          <el-menu-item index="/workorders">
            <el-icon><Document /></el-icon>
            <span>工单管理</span>
          </el-menu-item>
          <el-menu-item index="/predictive-maintenance">
            <el-icon><Management /></el-icon>
            <span>预测维护</span>
          </el-menu-item>
          <el-menu-item index="/reports">
            <el-icon><PieChart /></el-icon>
            <span>报表分析</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 内容区 -->
      <el-main class="dashboard-main">
        <div class="dashboard-overview">
          <el-row :gutter="20">
            <el-col :span="6">
              <el-card class="overview-card">
                <div class="card-content">
                  <div class="card-icon bg-blue">
                    <el-icon><Monitor /></el-icon>
                  </div>
                  <div class="card-info">
                    <p class="card-number">{{ overview.total_devices }}</p>
                    <p class="card-label">设备总数</p>
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="overview-card">
                <div class="card-content">
                  <div class="card-icon bg-green">
                    <el-icon><Connection /></el-icon>
                  </div>
                  <div class="card-info">
                    <p class="card-number">{{ overview.online_devices }}</p>
                    <p class="card-label">在线设备</p>
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="overview-card">
                <div class="card-content">
                  <div class="card-icon bg-orange">
                    <el-icon><Warning /></el-icon>
                  </div>
                  <div class="card-info">
                    <p class="card-number">{{ overview.recent_alarms }}</p>
                    <p class="card-label">今日告警</p>
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="overview-card">
                <div class="card-content">
                  <div class="card-icon bg-red">
                    <el-icon><Document /></el-icon>
                  </div>
                  <div class="card-info">
                    <p class="card-number">{{ overview.recent_work_orders }}</p>
                    <p class="card-label">待处理工单</p>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <el-row :gutter="20" class="dashboard-charts">
          <el-col :span="16">
            <el-card class="chart-card">
              <template #header>
                <span>设备健康度趋势</span>
              </template>
              <div ref="healthChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="chart-card">
              <template #header>
                <span>设备状态分布</span>
              </template>
              <div ref="statusChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" class="dashboard-alerts">
          <el-col :span="12">
            <el-card class="alert-card">
              <template #header>
                <span>高优先级告警</span>
              </template>
              <el-table :data="alerts.high_priority_alarms" style="width: 100%">
                <el-table-column prop="device.name" label="设备" width="150" />
                <el-table-column prop="data_type" label="类型" width="100" />
                <el-table-column prop="actual_value" label="数值" width="100" />
                <el-table-column prop="created_at" label="时间" width="150">
                  <template #default="{ row }">
                    {{ formatDate(row.created_at) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card class="alert-card">
              <template #header>
                <span>即将到期维护</span>
              </template>
              <el-table :data="upcomingMaintenances" style="width: 100%">
                <el-table-column prop="device.name" label="设备" width="150" />
                <el-table-column prop="title" label="维护任务" width="200" />
                <el-table-column prop="scheduled_date" label="计划日期" width="120">
                  <template #default="{ row }">
                    {{ formatDate(row.scheduled_date) }}
                  </template>
                </el-table-column>
                <el-table-column prop="priority" label="优先级" width="100" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import moment from 'moment'
import axios from 'axios'

export default {
  name: 'Dashboard',
  setup() {
    const router = useRouter()
    
    // 当前用户信息
    const currentUser = JSON.parse(localStorage.getItem('user')) || {}
    
    // 仪表板数据
    const overview = reactive({
      total_devices: 0,
      online_devices: 0,
      recent_alarms: 0,
      recent_work_orders: 0
    })
    
    const alerts = reactive({
      high_priority_alarms: []
    })
    
    const upcomingMaintenances = ref([])
    
    // 图表引用
    const healthChartRef = ref(null)
    const statusChartRef = ref(null)
    
    // 图表实例
    let healthChart = null
    let statusChart = null
    
    // 初始化图表
    const initCharts = () => {
      // 健康度趋势图
      if (healthChartRef.value) {
        healthChart = echarts.init(healthChartRef.value)
        const healthOption = {
          title: {
            text: '设备健康度趋势',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis'
          },
          xAxis: {
            type: 'category',
            data: ['1月', '2月', '3月', '4月', '5月', '6月']
          },
          yAxis: {
            type: 'value',
            min: 0,
            max: 100
          },
          series: [{
            name: '健康度',
            data: [85, 88, 90, 87, 92, 89],
            type: 'line',
            smooth: true,
            itemStyle: {
              color: '#5470c6'
            }
          }]
        }
        healthChart.setOption(healthOption)
      }
      
      // 状态分布图
      if (statusChartRef.value) {
        statusChart = echarts.init(statusChartRef.value)
        const statusOption = {
          title: {
            text: '设备状态分布',
            left: 'center'
          },
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'vertical',
            left: 'left'
          },
          series: [{
            name: '设备状态',
            type: 'pie',
            radius: '50%',
            data: [
              { value: 335, name: '运行中' },
              { value: 679, name: '维护中' },
              { value: 1548, name: '已停用' }
            ],
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        }
        statusChart.setOption(statusOption)
      }
    }
    
    // 格式化日期
    const formatDate = (date) => {
      return moment(date).format('YYYY-MM-DD HH:mm:ss')
    }
    
    // 加载仪表板数据
    const loadDashboardData = async () => {
      try {
        const response = await axios.get('/api/dashboard/overview', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        
        const data = response.data
        
        // 更新概览数据
        Object.assign(overview, data.overview)
        Object.assign(alerts, data.alerts)
        
        // 更新即将到期的维护任务
        // 这里需要从API获取即将到期的维护任务
        upcomingMaintenances.value = []
      } catch (error) {
        console.error('Error loading dashboard data:', error)
        ElMessage.error('加载仪表板数据失败')
      }
    }
    
    // 处理用户命令
    const handleUserCommand = (command) => {
      switch (command) {
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
          ElMessage.success('已退出登录')
          break
      }
    }
    
    onMounted(async () => {
      await loadDashboardData()
      initCharts()
      
      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        if (healthChart) healthChart.resize()
        if (statusChart) statusChart.resize()
      })
    })
    
    onUnmounted(() => {
      // 销毁图表实例
      if (healthChart) healthChart.dispose()
      if (statusChart) statusChart.dispose()
      
      // 移除事件监听
      window.removeEventListener('resize', () => {})
    })
    
    return {
      currentUser,
      overview,
      alerts,
      upcomingMaintenances,
      healthChartRef,
      statusChartRef,
      formatDate,
      handleUserCommand
    }
  }
}
</script>

<style scoped>
.dashboard-container {
  height: 100vh;
  overflow: hidden;
}

.dashboard-header {
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0,21,41,.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.header-left h2 {
  margin: 0;
  color: #1890ff;
}

.el-dropdown-link {
  cursor: pointer;
  color: #409eff;
}

.sidebar {
  background-color: #545c64;
}

.sidebar-menu {
  border: none;
  height: calc(100vh - 60px);
}

.dashboard-main {
  background-color: #f0f2f5;
  padding: 20px;
}

.dashboard-overview {
  margin-bottom: 20px;
}

.overview-card {
  text-align: center;
}

.card-content {
  display: flex;
  align-items: center;
}

.card-icon {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
}

.card-icon i {
  font-size: 24px;
  color: white;
}

.bg-blue {
  background-color: #409EFF;
}

.bg-green {
  background-color: #67C23A;
}

.bg-orange {
  background-color: #E6A23C;
}

.bg-red {
  background-color: #F56C6C;
}

.card-info {
  flex: 1;
  text-align: left;
}

.card-number {
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  color: #303133;
}

.card-label {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.dashboard-charts {
  margin-bottom: 20px;
}

.chart-card {
  height: 400px;
}

.chart-container {
  width: 100%;
  height: 340px;
}

.dashboard-alerts {
  margin-bottom: 20px;
}

.alert-card {
  height: 400px;
}

.alert-card :deep(.el-card__header) {
  padding: 12px 20px;
}

.alert-card :deep(.el-card__body) {
  height: calc(100% - 56px);
  overflow-y: auto;
}
</style>