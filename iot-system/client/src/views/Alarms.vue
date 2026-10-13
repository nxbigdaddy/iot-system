<template>
  <div class="alarms-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>报警中心</h3>
          <div>
            <el-button type="primary" @click="loadAlarms">刷新</el-button>
          </div>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-cards">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-red">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.total }}</p>
                <p class="stat-label">总报警</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-orange">
                <el-icon><WarningFilled /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.open }}</p>
                <p class="stat-label">未处理</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-yellow">
                <el-icon><Clock /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.today }}</p>
                <p class="stat-label">今日新增</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-blue">
                <el-icon><Check /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.resolved }}</p>
                <p class="stat-label">已解决</p>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 搜索和筛选 -->
      <div class="filter-section">
        <el-row :gutter="20">
          <el-col :span="4">
            <el-select 
              v-model="queryParams.status" 
              placeholder="报警状态" 
              clearable
              @change="loadAlarms"
            >
              <el-option label="未处理" value="open" />
              <el-option label="已确认" value="acknowledged" />
              <el-option label="已解决" value="resolved" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="queryParams.level" 
              placeholder="报警级别" 
              clearable
              @change="loadAlarms"
            >
              <el-option label="信息" value="info" />
              <el-option label="警告" value="warning" />
              <el-option label="严重" value="critical" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-input 
              v-model="queryParams.deviceName" 
              placeholder="设备名称" 
              clearable
              @keyup.enter="loadAlarms"
            />
          </el-col>
          <el-col :span="6">
            <el-date-picker
              v-model="dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              @change="handleDateChange"
            />
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="loadAlarms">搜索</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 报警列表 -->
      <el-table 
        :data="alarms" 
        v-loading="loading"
        style="width: 100%; margin-top: 20px;"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="device.name" label="设备名称" width="150" />
        <el-table-column prop="data_type" label="数据类型" width="120" />
        <el-table-column prop="rule.name" label="报警规则" width="150" />
        <el-table-column label="报警级别" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="getLevelType(row.alert_level)"
              size="small"
            >
              {{ getLevelText(row.alert_level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前值/阈值" width="120">
          <template #default="{ row }">
            {{ row.actual_value }} / {{ row.threshold_value }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="getStatusType(row.status)"
              size="small"
            >
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="发生时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="acknowledged_at" label="确认时间" width="160">
          <template #default="{ row }">
            {{ row.acknowledged_at ? formatDate(row.acknowledged_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewAlarmDetail(row)">查看</el-button>
            <el-button 
              v-if="row.status === 'open'" 
              size="small" 
              type="warning" 
              @click="acknowledgeAlarm(row.id)"
            >
              确认
            </el-button>
            <el-button 
              v-if="['open', 'acknowledged'].includes(row.status)" 
              size="small" 
              type="success" 
              @click="resolveAlarm(row.id)"
            >
              解决
            </el-button>
            <el-button 
              v-if="row.status === 'resolved'" 
              size="small" 
              @click="closeAlarm(row.id)"
            >
              关闭
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 报警详情对话框 -->
    <el-dialog 
      title="报警详情" 
      v-model="detailDialogVisible" 
      width="700px"
    >
      <div v-if="selectedAlarm" class="alarm-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报警ID">{{ selectedAlarm.id }}</el-descriptions-item>
          <el-descriptions-item label="报警级别">
            <el-tag :type="getLevelType(selectedAlarm.alert_level)">
              {{ getLevelText(selectedAlarm.alert_level) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="设备名称">{{ selectedAlarm.device.name }}</el-descriptions-item>
          <el-descriptions-item label="数据类型">{{ selectedAlarm.data_type }}</el-descriptions-item>
          <el-descriptions-item label="报警规则">{{ selectedAlarm.rule.name }}</el-descriptions-item>
          <el-descriptions-item label="当前值">{{ selectedAlarm.actual_value }}</el-descriptions-item>
          <el-descriptions-item label="阈值">{{ selectedAlarm.threshold_value }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedAlarm.status)">
              {{ getStatusText(selectedAlarm.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发生时间">
            {{ formatDate(selectedAlarm.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="确认时间">
            {{ selectedAlarm.acknowledged_at ? formatDate(selectedAlarm.acknowledged_at) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="解决时间">
            {{ selectedAlarm.resolved_at ? formatDate(selectedAlarm.resolved_at) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(selectedAlarm.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDate(selectedAlarm.updated_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="解决说明" :span="2">
            {{ selectedAlarm.resolution_notes || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import moment from 'moment'
import { Warning, WarningFilled, Clock, Check } from '@element-plus/icons-vue'

export default {
  name: 'Alarms',
  components: {
    Warning, WarningFilled, Clock, Check
  },
  setup() {
    // 响应式数据
    const alarms = ref([])
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const total = ref(0)
    
    const stats = reactive({
      total: 0,
      open: 0,
      today: 0,
      resolved: 0
    })
    
    const queryParams = reactive({
      status: '',
      level: '',
      deviceName: ''
    })
    
    const dateRange = ref([])
    
    const detailDialogVisible = ref(false)
    const selectedAlarm = ref(null)

    // 方法
    const loadAlarms = async () => {
      loading.value = true
      try {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // 模拟数据
        alarms.value = [
          {
            id: 1,
            device: { name: '温度传感器-TS001' },
            data_type: 'temperature',
            rule: { name: '温度过高报警' },
            alert_level: 'critical',
            actual_value: 95.5,
            threshold_value: 80.0,
            status: 'open',
            created_at: '2023-10-15T09:30:00Z',
            acknowledged_at: null,
            resolved_at: null,
            resolution_notes: null,
            updated_at: '2023-10-15T09:30:00Z'
          },
          {
            id: 2,
            device: { name: '压力控制器-PC002' },
            data_type: 'pressure',
            rule: { name: '压力过低报警' },
            alert_level: 'warning',
            actual_value: 0.6,
            threshold_value: 0.8,
            status: 'acknowledged',
            created_at: '2023-10-15T08:45:00Z',
            acknowledged_at: '2023-10-15T09:00:00Z',
            resolved_at: null,
            resolution_notes: null,
            updated_at: '2023-10-15T09:00:00Z'
          },
          {
            id: 3,
            device: { name: '电机执行器-ME003' },
            data_type: 'vibration',
            rule: { name: '振动过大报警' },
            alert_level: 'critical',
            actual_value: 4.8,
            threshold_value: 3.0,
            status: 'resolved',
            created_at: '2023-10-14T15:20:00Z',
            acknowledged_at: '2023-10-14T15:25:00Z',
            resolved_at: '2023-10-14T16:30:00Z',
            resolution_notes: '已更换轴承，振动恢复正常',
            updated_at: '2023-10-14T16:30:00Z'
          },
          {
            id: 4,
            device: { name: '液位传感器-LS004' },
            data_type: 'liquid_level',
            rule: { name: '液位过低报警' },
            alert_level: 'info',
            actual_value: 15.2,
            threshold_value: 20.0,
            status: 'closed',
            created_at: '2023-10-13T12:10:00Z',
            acknowledged_at: '2023-10-13T12:15:00Z',
            resolved_at: '2023-10-13T13:00:00Z',
            resolution_notes: '补充液体后恢复正常',
            updated_at: '2023-10-13T13:00:00Z'
          }
        ]
        
        total.value = alarms.value.length
        
        // 模拟统计信息
        stats.total = 24
        stats.open = 5
        stats.today = 8
        stats.resolved = 17
      } catch (error) {
        console.error('Error loading alarms:', error)
        ElMessage.error('加载报警列表失败')
      } finally {
        loading.value = false
      }
    }

    const loadStats = async () => {
      try {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 已在loadAlarms中设置统计信息
      } catch (error) {
        console.error('Error loading stats:', error)
      }
    }

    const acknowledgeAlarm = async (id) => {
      try {
        await ElMessageBox.confirm(
          '确认此报警，继续?',
          '提示',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 模拟确认操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('报警已确认')
        loadAlarms() // 重新加载列表
      } catch (error) {
        console.error('Error acknowledging alarm:', error)
        if (error !== 'cancel') {
          ElMessage.error('确认报警失败')
        }
      }
    }

    const resolveAlarm = async (id) => {
      try {
        await ElMessageBox.prompt('请输入解决说明:', '解决报警', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputPattern: /^[\s\S]{1,200}$/,
          inputErrorMessage: '解决说明不能为空且不超过200字符',
        }).then(({ value }) => {
          // 模拟解决操作
          return new Promise(resolve => setTimeout(resolve, 300))
        })
        
        ElMessage.success('报警已解决')
        loadAlarms() // 重新加载列表
      } catch (error) {
        console.error('Error resolving alarm:', error)
        if (error !== 'cancel') {
          ElMessage.error('解决报警失败')
        }
      }
    }

    const closeAlarm = async (id) => {
      try {
        await ElMessageBox.confirm(
          '关闭此报警，继续?',
          '提示',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 模拟关闭操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('报警已关闭')
        loadAlarms() // 重新加载列表
      } catch (error) {
        console.error('Error closing alarm:', error)
        if (error !== 'cancel') {
          ElMessage.error('关闭报警失败')
        }
      }
    }

    const viewAlarmDetail = (row) => {
      selectedAlarm.value = { ...row }
      detailDialogVisible.value = true
    }

    const resetFilters = () => {
      queryParams.status = ''
      queryParams.level = ''
      queryParams.deviceName = ''
      dateRange.value = []
      loadAlarms()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      loadAlarms()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadAlarms()
    }

    const handleDateChange = (value) => {
      // 处理日期范围变化
      loadAlarms()
    }

    const formatDate = (date) => {
      if (!date) return '-'
      return moment(date).format('YYYY-MM-DD HH:mm:ss')
    }

    const getLevelType = (level) => {
      switch (level) {
        case 'critical': return 'danger'
        case 'warning': return 'warning'
        case 'info': return 'info'
        default: return 'info'
      }
    }

    const getLevelText = (level) => {
      switch (level) {
        case 'critical': return '严重'
        case 'warning': return '警告'
        case 'info': return '信息'
        default: return '未知'
      }
    }

    const getStatusType = (status) => {
      switch (status) {
        case 'open': return 'danger'
        case 'acknowledged': return 'warning'
        case 'resolved': return 'success'
        case 'closed': return 'info'
        default: return 'info'
      }
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'open': return '未处理'
        case 'acknowledged': return '已确认'
        case 'resolved': return '已解决'
        case 'closed': return '已关闭'
        default: return '未知'
      }
    }

    // 生命周期钩子
    onMounted(() => {
      loadAlarms()
      loadStats()
    })

    return {
      alarms,
      loading,
      currentPage,
      pageSize,
      total,
      stats,
      queryParams,
      dateRange,
      detailDialogVisible,
      selectedAlarm,
      loadAlarms,
      loadStats,
      acknowledgeAlarm,
      resolveAlarm,
      closeAlarm,
      viewAlarmDetail,
      resetFilters,
      handleSizeChange,
      handleCurrentChange,
      handleDateChange,
      formatDate,
      getLevelType,
      getLevelText,
      getStatusType,
      getStatusText
    }
  }
}
</script>

<style scoped>
.alarms-container {
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

.stats-cards {
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

.bg-red {
  background-color: #F56C6C;
}

.bg-orange {
  background-color: #E6A23C;
}

.bg-yellow {
  background-color: #EFAE42;
}

.bg-blue {
  background-color: #409EFF;
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

.filter-section {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

.alarm-detail {
  max-height: 60vh;
  overflow-y: auto;
}
</style>