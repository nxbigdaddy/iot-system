<template>
  <div class="reports-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>报表分析</h3>
          <div>
            <el-date-picker
              v-model="reportDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              @change="onDateRangeChange"
            />
            <el-button type="primary" @click="generateReport" style="margin-left: 10px;">生成报表</el-button>
          </div>
        </div>
      </template>

      <!-- 报表类型选择 -->
      <el-tabs v-model="activeTab" @tab-change="onTabChange" class="report-tabs">
        <el-tab-pane label="设备概览" name="overview">
          <div class="report-section">
            <el-row :gutter="20">
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <div class="stat-icon bg-blue">
                      <el-icon><Monitor /></el-icon>
                    </div>
                    <div class="stat-info">
                      <p class="stat-number">{{ deviceStats.total }}</p>
                      <p class="stat-label">设备总数</p>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <div class="stat-icon bg-green">
                      <el-icon><Connection /></el-icon>
                    </div>
                    <div class="stat-info">
                      <p class="stat-number">{{ deviceStats.online }}</p>
                      <p class="stat-label">在线设备</p>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <div class="stat-icon bg-orange">
                      <el-icon><Warning /></el-icon>
                    </div>
                    <div class="stat-info">
                      <p class="stat-number">{{ alarmStats.total }}</p>
                      <p class="stat-label">报警总数</p>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <div class="stat-icon bg-purple">
                      <el-icon><Document /></el-icon>
                    </div>
                    <div class="stat-info">
                      <p class="stat-number">{{ workOrderStats.total }}</p>
                      <p class="stat-label">工单总数</p>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>

          <el-row :gutter="20" class="chart-row">
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>设备状态分布</span>
                </template>
                <div ref="deviceStatusChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>报警级别分布</span>
                </template>
                <div ref="alarmLevelChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="报警分析" name="alarms">
          <el-row :gutter="20" class="chart-row">
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>报警趋势统计</span>
                </template>
                <div ref="alarmTrendChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>按设备统计</span>
                </template>
                <div ref="alarmByDeviceChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="工单分析" name="workorders">
          <el-row :gutter="20" class="chart-row">
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>工单状态分布</span>
                </template>
                <div ref="workOrderStatusChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>工单类型分布</span>
                </template>
                <div ref="workOrderTypeChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="维护分析" name="maintenance">
          <el-row :gutter="20" class="chart-row">
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>维护成本统计</span>
                </template>
                <div ref="maintenanceCostChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>维护频率统计</span>
                </template>
                <div ref="maintenanceFreqChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>

      <!-- 导出按钮 -->
      <div class="export-section">
        <el-button type="primary" @click="exportReport">导出报表</el-button>
        <el-button @click="printReport">打印报表</el-button>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import moment from 'moment'
import { 
  Monitor, Connection, Warning, Document, 
  Download, Printer 
} from '@element-plus/icons-vue'

export default {
  name: 'Reports',
  components: {
    Monitor, Connection, Warning, Document, Download, Printer
  },
  setup() {
    // 响应式数据
    const activeTab = ref('overview')
    const reportDateRange = ref([moment().subtract(30, 'days').format('YYYY-MM-DD'), moment().format('YYYY-MM-DD')])
    
    // 统计数据
    const deviceStats = ref({
      total: 156,
      online: 142,
      offline: 8,
      maintenance: 6
    })
    
    const alarmStats = ref({
      total: 847,
      info: 123,
      warning: 567,
      critical: 157
    })
    
    const workOrderStats = ref({
      total: 234,
      pending: 45,
      inProgress: 23,
      completed: 166
    })
    
    // 图表引用
    const deviceStatusChartRef = ref(null)
    const alarmLevelChartRef = ref(null)
    const alarmTrendChartRef = ref(null)
    const alarmByDeviceChartRef = ref(null)
    const workOrderStatusChartRef = ref(null)
    const workOrderTypeChartRef = ref(null)
    const maintenanceCostChartRef = ref(null)
    const maintenanceFreqChartRef = ref(null)
    
    // 图表实例
    let deviceStatusChart = null
    let alarmLevelChart = null
    let alarmTrendChart = null
    let alarmByDeviceChart = null
    let workOrderStatusChart = null
    let workOrderTypeChart = null
    let maintenanceCostChart = null
    let maintenanceFreqChart = null
    
    // 初始化图表
    const initCharts = () => {
      // 设备状态分布饼图
      if (deviceStatusChartRef.value) {
        deviceStatusChart = echarts.init(deviceStatusChartRef.value)
        const deviceStatusOption = {
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'horizontal',
            bottom: 0
          },
          series: [{
            name: '设备状态',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              formatter: '{b}: {d}%'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '14',
                fontWeight: 'bold'
              }
            },
            data: [
              { value: 142, name: '在线', itemStyle: { color: '#67C23A' } },
              { value: 8, name: '离线', itemStyle: { color: '#F56C6C' } },
              { value: 6, name: '维护中', itemStyle: { color: '#E6A23C' } }
            ]
          }]
        }
        deviceStatusChart.setOption(deviceStatusOption)
      }
      
      // 报警级别分布饼图
      if (alarmLevelChartRef.value) {
        alarmLevelChart = echarts.init(alarmLevelChartRef.value)
        const alarmLevelOption = {
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'horizontal',
            bottom: 0
          },
          series: [{
            name: '报警级别',
            type: 'pie',
            radius: ['40%', '70%'],
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              formatter: '{b}: {d}%'
            },
            data: [
              { value: 123, name: '信息', itemStyle: { color: '#909399' } },
              { value: 567, name: '警告', itemStyle: { color: '#E6A23C' } },
              { value: 157, name: '严重', itemStyle: { color: '#F56C6C' } }
            ]
          }]
        }
        alarmLevelChart.setOption(alarmLevelOption)
      }
      
      // 报警趋势统计线图
      if (alarmTrendChartRef.value) {
        alarmTrendChart = echarts.init(alarmTrendChartRef.value)
        const dates = []
        const infoData = []
        const warningData = []
        const criticalData = []
        
        // 生成30天的数据
        for (let i = 29; i >= 0; i--) {
          const date = moment().subtract(i, 'days').format('MM-DD')
          dates.push(date)
          infoData.push(Math.floor(Math.random() * 10))
          warningData.push(Math.floor(Math.random() * 20) + 10)
          criticalData.push(Math.floor(Math.random() * 5) + 1)
        }
        
        const alarmTrendOption = {
          tooltip: {
            trigger: 'axis'
          },
          legend: {
            data: ['信息', '警告', '严重']
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: dates
          },
          yAxis: {
            type: 'value'
          },
          series: [
            {
              name: '信息',
              type: 'line',
              stack: '报警',
              data: infoData,
              itemStyle: { color: '#909399' }
            },
            {
              name: '警告',
              type: 'line',
              stack: '报警',
              data: warningData,
              itemStyle: { color: '#E6A23C' }
            },
            {
              name: '严重',
              type: 'line',
              stack: '报警',
              data: criticalData,
              itemStyle: { color: '#F56C6C' }
            }
          ]
        }
        alarmTrendChart.setOption(alarmTrendOption)
      }
      
      // 按设备统计柱状图
      if (alarmByDeviceChartRef.value) {
        alarmByDeviceChart = echarts.init(alarmByDeviceChartRef.value)
        const alarmByDeviceOption = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'value'
          },
          yAxis: {
            type: 'category',
            data: ['设备A', '设备B', '设备C', '设备D', '设备E']
          },
          series: [
            {
              name: '报警数',
              type: 'bar',
              label: {
                show: true,
                position: 'right'
              },
              emphasis: {
                focus: 'series'
              },
              data: [120, 98, 76, 54, 32]
            }
          ]
        }
        alarmByDeviceChart.setOption(alarmByDeviceOption)
      }
      
      // 工单状态分布柱状图
      if (workOrderStatusChartRef.value) {
        workOrderStatusChart = echarts.init(workOrderStatusChartRef.value)
        const workOrderStatusOption = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'value'
          },
          yAxis: {
            type: 'category',
            data: ['待处理', '进行中', '已完成']
          },
          series: [
            {
              name: '工单数',
              type: 'bar',
              label: {
                show: true,
                position: 'right'
              },
              data: [45, 23, 166],
              itemStyle: {
                color: function(params) {
                  const colors = ['#909399', '#E6A23C', '#67C23A']
                  return colors[params.dataIndex]
                }
              }
            }
          ]
        }
        workOrderStatusChart.setOption(workOrderStatusOption)
      }
      
      // 工单类型分布饼图
      if (workOrderTypeChartRef.value) {
        workOrderTypeChart = echarts.init(workOrderTypeChartRef.value)
        const workOrderTypeOption = {
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'horizontal',
            bottom: 0
          },
          series: [{
            name: '工单类型',
            type: 'pie',
            radius: ['40%', '70%'],
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              formatter: '{b}: {d}%'
            },
            data: [
              { value: 89, name: '巡检', itemStyle: { color: '#409EFF' } },
              { value: 98, name: '维修', itemStyle: { color: '#E6A23C' } },
              { value: 47, name: '保养', itemStyle: { color: '#67C23A' } }
            ]
          }]
        }
        workOrderTypeChart.setOption(workOrderTypeOption)
      }
      
      // 维护成本统计柱状图
      if (maintenanceCostChartRef.value) {
        maintenanceCostChart = echarts.init(maintenanceCostChartRef.value)
        const months = []
        const costs = []
        
        for (let i = 0; i < 12; i++) {
          months.push(moment().month(i).format('MMM'))
          costs.push(Math.floor(Math.random() * 50000) + 20000)
        }
        
        const maintenanceCostOption = {
          tooltip: {
            trigger: 'axis',
            formatter: '¥{c}'
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: months
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: '¥{value}'
            }
          },
          series: [
            {
              name: '维护成本',
              type: 'bar',
              data: costs,
              itemStyle: { color: '#5470c6' }
            }
          ]
        }
        maintenanceCostChart.setOption(maintenanceCostOption)
      }
      
      // 维护频率统计雷达图
      if (maintenanceFreqChartRef.value) {
        maintenanceFreqChart = echarts.init(maintenanceFreqChartRef.value)
        const maintenanceFreqOption = {
          tooltip: {},
          radar: {
            indicator: [
              { name: '日常巡检', max: 100 },
              { name: '定期保养', max: 100 },
              { name: '故障维修', max: 100 },
              { name: '预防维护', max: 100 },
              { name: '紧急维修', max: 100 }
            ]
          },
          series: [{
            name: '维护频率',
            type: 'radar',
            data: [
              {
                value: [80, 70, 45, 60, 25],
                name: '维护频率',
                itemStyle: { color: '#e7bcf3' },
                areaStyle: { opacity: 0.4 }
              }
            ]
          }]
        }
        maintenanceFreqChart.setOption(maintenanceFreqOption)
      }
    }
    
    // 生成报表
    const generateReport = () => {
      ElMessage.success('报表已生成')
      // 这里会根据日期范围重新加载数据并更新图表
    }
    
    // 导出报表
    const exportReport = () => {
      ElMessage.success('正在导出报表...')
      // 这里会导出当前视图的数据到Excel或PDF
    }
    
    // 打印报表
    const printReport = () => {
      ElMessage.success('正在准备打印...')
      // 这里会打开打印预览
    }
    
    // 选项卡改变
    const onTabChange = (tabName) => {
      // 根据选项卡重新渲染相关图表
    }
    
    // 日期范围改变
    const onDateRangeChange = (value) => {
      // 根据新日期范围更新数据
      generateReport()
    }
    
    onMounted(() => {
      initCharts()
      
      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        if (deviceStatusChart) deviceStatusChart.resize()
        if (alarmLevelChart) alarmLevelChart.resize()
        if (alarmTrendChart) alarmTrendChart.resize()
        if (alarmByDeviceChart) alarmByDeviceChart.resize()
        if (workOrderStatusChart) workOrderStatusChart.resize()
        if (workOrderTypeChart) workOrderTypeChart.resize()
        if (maintenanceCostChart) maintenanceCostChart.resize()
        if (maintenanceFreqChart) maintenanceFreqChart.resize()
      })
    })
    
    onUnmounted(() => {
      // 销毁图表实例
      if (deviceStatusChart) deviceStatusChart.dispose()
      if (alarmLevelChart) alarmLevelChart.dispose()
      if (alarmTrendChart) alarmTrendChart.dispose()
      if (alarmByDeviceChart) alarmByDeviceChart.dispose()
      if (workOrderStatusChart) workOrderStatusChart.dispose()
      if (workOrderTypeChart) workOrderTypeChart.dispose()
      if (maintenanceCostChart) maintenanceCostChart.dispose()
      if (maintenanceFreqChart) maintenanceFreqChart.dispose()
      
      // 移除事件监听
      window.removeEventListener('resize', () => {})
    })
    
    return {
      activeTab,
      reportDateRange,
      deviceStats,
      alarmStats,
      workOrderStats,
      deviceStatusChartRef,
      alarmLevelChartRef,
      alarmTrendChartRef,
      alarmByDeviceChartRef,
      workOrderStatusChartRef,
      workOrderTypeChartRef,
      maintenanceCostChartRef,
      maintenanceFreqChartRef,
      generateReport,
      exportReport,
      printReport,
      onTabChange,
      onDateRangeChange
    }
  }
}
</script>

<style scoped>
.reports-container {
  padding: 20px;
}

.page-card {
  min-height: calc(100vh - 180px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.report-tabs {
  margin-top: 20px;
}

.report-section {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
}

.stat-content {
  display: flex;
  align-items: center;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
}

.stat-icon i {
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

.bg-purple {
  background-color: #9013FE;
}

.stat-info {
  flex: 1;
  text-align: left;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 5px 0;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.chart-row {
  margin-top: 20px;
}

.chart-card {
  height: 400px;
}

.chart-container {
  width: 100%;
  height: 340px;
}

.export-section {
  margin-top: 20px;
  padding: 20px 0;
  border-top: 1px solid #eee;
  text-align: center;
}
</style>