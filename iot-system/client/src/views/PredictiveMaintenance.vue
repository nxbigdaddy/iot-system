<template>
  <div class="predictive-maintenance-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>预测性维护</h3>
          <div>
            <el-button type="primary" @click="analyzeAllDevices">分析全部</el-button>
          </div>
        </div>
      </template>

      <!-- 风险等级统计 -->
      <el-row :gutter="20" class="risk-stats">
        <el-col :span="6">
          <el-card class="risk-card bg-green">
            <div class="risk-content">
              <div class="risk-icon">
                <el-icon><Check /></el-icon>
              </div>
              <div class="risk-info">
                <p class="risk-count">{{ riskStats.lowRisk }}</p>
                <p class="risk-label">低风险</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="risk-card bg-yellow">
            <div class="risk-content">
              <div class="risk-icon">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="risk-info">
                <p class="risk-count">{{ riskStats.mediumRisk }}</p>
                <p class="risk-label">中风险</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="risk-card bg-orange">
            <div class="risk-content">
              <div class="risk-icon">
                <el-icon><WarningFilled /></el-icon>
              </div>
              <div class="risk-info">
                <p class="risk-count">{{ riskStats.highRisk }}</p>
                <p class="risk-label">高风险</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="risk-card bg-red">
            <div class="risk-content">
              <div class="risk-icon">
                <el-icon><CircleClose /></el-icon>
              </div>
              <div class="risk-info">
                <p class="risk-count">{{ riskStats.criticalRisk }}</p>
                <p class="risk-label">紧急</p>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 搜索和筛选 -->
      <div class="filter-section">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-input 
              v-model="searchQuery" 
              placeholder="设备名称/序列号" 
              clearable
              @keyup.enter="searchDevices"
            >
              <template #append>
                <el-button @click="searchDevices"><el-icon><Search /></el-icon></el-button>
              </template>
            </el-input>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="riskFilter" 
              placeholder="风险等级" 
              clearable
              @change="filterByRisk"
            >
              <el-option label="低风险" value="low" />
              <el-option label="中风险" value="medium" />
              <el-option label="高风险" value="high" />
              <el-option label="紧急" value="critical" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="deviceTypeFilter" 
              placeholder="设备类型" 
              clearable
              @change="filterDevices"
            >
              <el-option label="传感器" value="sensor" />
              <el-option label="控制器" value="controller" />
              <el-option label="执行器" value="actuator" />
            </el-select>
          </el-col>
          <el-col :span="10">
            <el-button @click="resetFilters">重置</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 设备列表 -->
      <el-table 
        :data="filteredDevices" 
        v-loading="loading"
        style="width: 100%; margin-top: 20px;"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="设备名称" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="viewDeviceDetails(row)">
              {{ row.name }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="device_type" label="设备类型" width="120" />
        <el-table-column prop="manufacturer" label="制造商" width="120" />
        <el-table-column prop="serial_number" label="序列号" width="150" />
        <el-table-column label="健康度" width="120">
          <template #default="{ row }">
            <div class="health-score">
              <el-progress 
                :percentage="row.health_score || 0" 
                :color="getHealthColor(row.health_score || 0)"
                :stroke-width="10"
              />
              <span class="health-text">{{ row.health_score || 0 }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="风险等级" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="getRiskType(row.risk_level)"
              size="small"
            >
              {{ getRiskText(row.risk_level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="故障概率" width="100">
          <template #default="{ row }">
            <span :class="getProbabilityClass(row.probability || 0)">
              {{ (row.probability || 0) * 100 }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="predicted_failure_date" label="预计故障时间" width="150">
          <template #default="{ row }">
            {{ row.predicted_failure_date ? formatDate(row.predicted_failure_date) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="建议维护时间" width="150">
          <template #default="{ row }">
            {{ row.suggested_maintenance_date ? formatDate(row.suggested_maintenance_date) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDeviceDetails(row)">详情</el-button>
            <el-button size="small" type="primary" @click="generateMaintenanceOrder(row)">生成工单</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 设备详情对话框 -->
      <el-dialog 
        title="设备预测分析详情" 
        v-model="detailsDialogVisible" 
        width="900px"
        top="2vh"
      >
        <div v-if="selectedDevice" class="device-details">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
            <el-descriptions-item label="设备类型">{{ selectedDevice.device_type }}</el-descriptions-item>
            <el-descriptions-item label="制造商">{{ selectedDevice.manufacturer }}</el-descriptions-item>
            <el-descriptions-item label="序列号">{{ selectedDevice.serial_number }}</el-descriptions-item>
            <el-descriptions-item label="健康度">
              <el-progress 
                :percentage="selectedDevice.health_score || 0" 
                :color="getHealthColor(selectedDevice.health_score || 0)"
                :stroke-width="15"
              />
            </el-descriptions-item>
            <el-descriptions-item label="风险等级">
              <el-tag :type="getRiskType(selectedDevice.risk_level)">
                {{ getRiskText(selectedDevice.risk_level) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="故障概率">{{ (selectedDevice.probability || 0) * 100 }}%</el-descriptions-item>
            <el-descriptions-item label="预测置信度">{{ (selectedDevice.confidence || 0) * 100 }}%</el-descriptions-item>
            <el-descriptions-item label="预计故障时间">
              {{ selectedDevice.predicted_failure_date ? formatDate(selectedDevice.predicted_failure_date) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="建议维护时间">
              {{ selectedDevice.suggested_maintenance_date ? formatDate(selectedDevice.suggested_maintenance_date) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="上次分析时间">
              {{ formatDate(selectedDevice.last_analysis) }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 健康指标 -->
          <el-divider>健康指标详情</el-divider>
          <el-row :gutter="20">
            <el-col :span="8" v-for="indicator in selectedDevice.health_indicators" :key="indicator.name">
              <el-card class="indicator-card">
                <div class="indicator-header">
                  <h4>{{ indicator.name }}</h4>
                  <el-tag :type="getIndicatorStatus(indicator)">{{ getIndicatorStatusText(indicator) }}</el-tag>
                </div>
                <div class="indicator-value">{{ indicator.value }} {{ indicator.unit }}</div>
                <el-progress 
                  :percentage="calculateIndicatorPercentage(indicator)" 
                  :color="getIndicatorColor(indicator)"
                  :stroke-width="8"
                />
              </el-card>
            </el-col>
          </el-row>

          <!-- 维护建议 -->
          <el-divider>维护建议</el-divider>
          <el-table :data="selectedDevice.recommendations" style="width: 100%;">
            <el-table-column prop="action" label="建议措施" />
            <el-table-column prop="priority" label="优先级">
              <template #default="{ row }">
                <el-tag :type="getRecommendationPriorityType(row.priority)">{{ row.priority }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="urgency" label="紧急程度">
              <template #default="{ row }">
                <el-rate 
                  v-model="row.urgency" 
                  :max="5" 
                  disabled 
                  show-score 
                  score-template="{value}星"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-dialog>
    </el-card>
  </div>
</template>

<script>
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import moment from 'moment'
import { 
  Check, Warning, WarningFilled, CircleClose, 
  Search 
} from '@element-plus/icons-vue'

export default {
  name: 'PredictiveMaintenance',
  components: {
    Check, Warning, WarningFilled, CircleClose, Search
  },
  setup() {
    // 响应式数据
    const devices = ref([])
    const loading = ref(false)
    
    const searchQuery = ref('')
    const riskFilter = ref('')
    const deviceTypeFilter = ref('')
    
    const detailsDialogVisible = ref(false)
    const selectedDevice = ref(null)
    
    const riskStats = reactive({
      lowRisk: 0,
      mediumRisk: 0,
      highRisk: 0,
      criticalRisk: 0
    })

    // 计算属性
    const filteredDevices = computed(() => {
      let result = [...devices.value]
      
      // 按搜索关键词过滤
      if (searchQuery.value) {
        result = result.filter(device => 
          device.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          device.serial_number.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
      }
      
      // 按风险等级过滤
      if (riskFilter.value) {
        result = result.filter(device => device.risk_level === riskFilter.value)
      }
      
      // 按设备类型过滤
      if (deviceTypeFilter.value) {
        result = result.filter(device => device.device_type === deviceTypeFilter.value)
      }
      
      return result
    })

    // 方法
    const loadDevices = async () => {
      loading.value = true
      try {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // 模拟数据
        devices.value = [
          {
            id: 1,
            name: '温度传感器-TS001',
            device_type: 'sensor',
            manufacturer: '西门子',
            serial_number: 'TS0012023001',
            health_score: 85,
            risk_level: 'low',
            probability: 0.12,
            confidence: 0.85,
            predicted_failure_date: '2024-03-15T10:30:00Z',
            suggested_maintenance_date: '2023-12-01T09:00:00Z',
            last_analysis: '2023-10-15T08:00:00Z',
            health_indicators: [
              { name: '温度趋势', value: 24.5, unit: '°C', status: 'normal', threshold_min: 10, threshold_max: 80 },
              { name: '振动水平', value: 1.2, unit: 'mm/s', status: 'normal', threshold_min: 0, threshold_max: 5 },
              { name: '运行时间', value: 1850, unit: '小时', status: 'normal', threshold_min: 0, threshold_max: 8760 }
            ],
            recommendations: [
              { action: '定期校准温度传感器', priority: 'medium', urgency: 3 },
              { action: '检查线路连接', priority: 'low', urgency: 2 }
            ]
          },
          {
            id: 2,
            name: '压力控制器-PC002',
            device_type: 'controller',
            manufacturer: '施耐德',
            serial_number: 'PC0022023002',
            health_score: 65,
            risk_level: 'medium',
            probability: 0.35,
            confidence: 0.78,
            predicted_failure_date: '2023-12-20T14:00:00Z',
            suggested_maintenance_date: '2023-11-15T09:00:00Z',
            last_analysis: '2023-10-15T08:00:00Z',
            health_indicators: [
              { name: '压力波动', value: 1.1, unit: 'MPa', status: 'warning', threshold_min: 0.5, threshold_max: 1.5 },
              { name: '响应时间', value: 0.8, unit: '秒', status: 'normal', threshold_min: 0, threshold_max: 2 },
              { name: '运行时间', value: 2100, unit: '小时', status: 'normal', threshold_min: 0, threshold_max: 8760 }
            ],
            recommendations: [
              { action: '检查压力调节阀', priority: 'high', urgency: 4 },
              { action: '更换密封圈', priority: 'medium', urgency: 3 }
            ]
          },
          {
            id: 3,
            name: '电机执行器-ME003',
            device_type: 'actuator',
            manufacturer: 'ABB',
            serial_number: 'ME0032023003',
            health_score: 35,
            risk_level: 'high',
            probability: 0.72,
            confidence: 0.82,
            predicted_failure_date: '2023-11-10T16:00:00Z',
            suggested_maintenance_date: '2023-10-20T09:00:00Z',
            last_analysis: '2023-10-15T08:00:00Z',
            health_indicators: [
              { name: '振动幅度', value: 4.8, unit: 'mm/s', status: 'critical', threshold_min: 0, threshold_max: 3 },
              { name: '温度', value: 85.2, unit: '°C', status: 'warning', threshold_min: 10, threshold_max: 80 },
              { name: '电流', value: 12.5, unit: 'A', status: 'warning', threshold_min: 8, threshold_max: 15 }
            ],
            recommendations: [
              { action: '立即停机检查', priority: 'urgent', urgency: 5 },
              { action: '更换轴承', priority: 'high', urgency: 5 },
              { action: '检查冷却系统', priority: 'high', urgency: 4 }
            ]
          },
          {
            id: 4,
            name: '液位传感器-LS004',
            device_type: 'sensor',
            manufacturer: '横河',
            serial_number: 'LS0042023004',
            health_score: 92,
            risk_level: 'low',
            probability: 0.08,
            confidence: 0.91,
            predicted_failure_date: '2024-06-30T10:00:00Z',
            suggested_maintenance_date: '2024-01-15T09:00:00Z',
            last_analysis: '2023-10-15T08:00:00Z',
            health_indicators: [
              { name: '测量精度', value: 0.98, unit: '', status: 'excellent', threshold_min: 0.95, threshold_max: 1 },
              { name: '信号强度', value: -55, unit: 'dBm', status: 'excellent', threshold_min: -80, threshold_max: -30 },
              { name: '运行时间', value: 1200, unit: '小时', status: 'normal', threshold_min: 0, threshold_max: 8760 }
            ],
            recommendations: [
              { action: '常规检查', priority: 'low', urgency: 1 }
            ]
          }
        ]
        
        // 更新风险统计
        updateRiskStats()
      } catch (error) {
        console.error('Error loading devices:', error)
        ElMessage.error('加载设备数据失败')
      } finally {
        loading.value = false
      }
    }

    const updateRiskStats = () => {
      riskStats.lowRisk = devices.value.filter(d => d.risk_level === 'low').length
      riskStats.mediumRisk = devices.value.filter(d => d.risk_level === 'medium').length
      riskStats.highRisk = devices.value.filter(d => d.risk_level === 'high').length
      riskStats.criticalRisk = devices.value.filter(d => d.risk_level === 'critical').length
    }

    const getHealthColor = (score) => {
      if (score >= 80) return '#67C23A'  // 绿色
      if (score >= 60) return '#E6A23C'  // 黄色
      if (score >= 40) return '#F56C6C'  // 红色
      return '#F56C6C'  // 危险红色
    }

    const getRiskType = (riskLevel) => {
      switch (riskLevel) {
        case 'low': return 'success'
        case 'medium': return 'warning'
        case 'high': return 'danger'
        case 'critical': return 'danger'
        default: return 'info'
      }
    }

    const getRiskText = (riskLevel) => {
      switch (riskLevel) {
        case 'low': return '低风险'
        case 'medium': return '中风险'
        case 'high': return '高风险'
        case 'critical': return '紧急'
        default: return '未知'
      }
    }

    const getProbabilityClass = (probability) => {
      if (probability >= 0.7) return 'probability-high'
      if (probability >= 0.4) return 'probability-medium'
      return 'probability-low'
    }

    const formatDate = (date) => {
      if (!date) return '-'
      return moment(date).format('YYYY-MM-DD HH:mm:ss')
    }

    const viewDeviceDetails = (device) => {
      selectedDevice.value = { ...device }
      detailsDialogVisible.value = true
    }

    const generateMaintenanceOrder = (device) => {
      ElMessage.success(`已为 ${device.name} 生成维护工单`)
      // 这里实际会调用API创建工单
    }

    const analyzeAllDevices = async () => {
      loading.value = true
      try {
        // 模拟分析过程
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        ElMessage.success('所有设备分析完成')
        loadDevices() // 重新加载数据
      } catch (error) {
        console.error('Error analyzing devices:', error)
        ElMessage.error('分析设备失败')
      } finally {
        loading.value = false
      }
    }

    const searchDevices = () => {
      // 过滤已经在computed中处理
    }

    const filterByRisk = () => {
      // 过滤已经在computed中处理
    }

    const filterDevices = () => {
      // 过滤已经在computed中处理
    }

    const resetFilters = () => {
      searchQuery.value = ''
      riskFilter.value = ''
      deviceTypeFilter.value = ''
    }

    const getIndicatorStatus = (indicator) => {
      switch (indicator.status) {
        case 'excellent': return 'success'
        case 'normal': return 'success'
        case 'warning': return 'warning'
        case 'critical': return 'danger'
        default: return 'info'
      }
    }

    const getIndicatorStatusText = (indicator) => {
      switch (indicator.status) {
        case 'excellent': return '优秀'
        case 'normal': return '正常'
        case 'warning': return '警告'
        case 'critical': return '危险'
        default: return '未知'
      }
    }

    const calculateIndicatorPercentage = (indicator) => {
      if (indicator.threshold_max) {
        const percentage = ((indicator.value - (indicator.threshold_min || 0)) / 
                          ((indicator.threshold_max - (indicator.threshold_min || 0))) * 100)
        return Math.min(100, Math.max(0, percentage))
      }
      return 50 // 默认值
    }

    const getIndicatorColor = (indicator) => {
      switch (indicator.status) {
        case 'excellent':
        case 'normal': return '#67C23A'
        case 'warning': return '#E6A23C'
        case 'critical': return '#F56C6C'
        default: return '#909399'
      }
    }

    const getRecommendationPriorityType = (priority) => {
      switch (priority) {
        case 'low': return 'info'
        case 'medium': return 'warning'
        case 'high': return 'danger'
        case 'urgent': return 'danger'
        default: return 'info'
      }
    }

    // 生命周期钩子
    onMounted(() => {
      loadDevices()
    })

    return {
      devices,
      filteredDevices,
      loading,
      searchQuery,
      riskFilter,
      deviceTypeFilter,
      detailsDialogVisible,
      selectedDevice,
      riskStats,
      loadDevices,
      getHealthColor,
      getRiskType,
      getRiskText,
      getProbabilityClass,
      formatDate,
      viewDeviceDetails,
      generateMaintenanceOrder,
      analyzeAllDevices,
      searchDevices,
      filterByRisk,
      filterDevices,
      resetFilters,
      getIndicatorStatus,
      getIndicatorStatusText,
      calculateIndicatorPercentage,
      getIndicatorColor,
      getRecommendationPriorityType
    }
  }
}
</script>

<style scoped>
.predictive-maintenance-container {
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

.risk-stats {
  margin-bottom: 20px;
}

.risk-card {
  text-align: center;
  color: white;
}

.bg-green { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.bg-yellow { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.bg-orange { background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); }
.bg-red { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); }

.risk-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.risk-icon {
  font-size: 36px;
  margin-right: 15px;
}

.risk-info {
  text-align: left;
}

.risk-count {
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 5px 0;
}

.risk-label {
  font-size: 14px;
  opacity: 0.9;
  margin: 0;
}

.filter-section {
  margin-bottom: 20px;
}

.health-score {
  display: flex;
  align-items: center;
  gap: 10px;
}

.health-text {
  font-weight: bold;
  min-width: 40px;
}

.probability-low { color: #67C23A; }
.probability-medium { color: #E6A23C; }
.probability-high { color: #F56C6C; font-weight: bold; }

.device-details {
  max-height: 70vh;
  overflow-y: auto;
}

.indicator-card {
  margin-bottom: 15px;
}

.indicator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.indicator-value {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
  text-align: center;
}
</style>