<template>
  <div class="devices-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>设备管理</h3>
          <el-button type="primary" @click="showAddDeviceDialog">添加设备</el-button>
        </div>
      </template>

      <!-- 搜索和筛选 -->
      <div class="filter-section">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-input 
              v-model="queryParams.search" 
              placeholder="设备名称/序列号" 
              clearable
              @keyup.enter="loadDevices"
            />
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="queryParams.status" 
              placeholder="设备状态" 
              clearable
              @change="loadDevices"
            >
              <el-option label="运行中" value="active" />
              <el-option label="维护中" value="maintenance" />
              <el-option label="已停用" value="decommissioned" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="queryParams.deviceType" 
              placeholder="设备类型" 
              clearable
              @change="loadDevices"
            >
              <el-option label="传感器" value="sensor" />
              <el-option label="控制器" value="controller" />
              <el-option label="执行器" value="actuator" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="loadDevices">搜索</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 设备列表 -->
      <el-table 
        :data="devices" 
        v-loading="loading"
        style="width: 100%; margin-top: 20px;"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="设备名称" width="150">
          <template #default="{ row }">
            <el-link type="primary" @click="viewDeviceDetail(row)">
              {{ row.name }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="device_type" label="设备类型" width="120" />
        <el-table-column prop="manufacturer" label="制造商" width="120" />
        <el-table-column prop="serial_number" label="序列号" width="150" />
        <el-table-column label="连接状态" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="getConnectionStatusType(row.connection_status)"
              size="small"
            >
              {{ getConnectionStatusText(row.connection_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="设备状态" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="getStatusType(row.status)"
              size="small"
            >
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="150" />
        <el-table-column prop="last_heartbeat" label="最后心跳" width="150">
          <template #default="{ row }">
            {{ row.last_heartbeat ? formatDate(row.last_heartbeat) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDeviceDetail(row)">查看</el-button>
            <el-button size="small" type="primary" @click="editDevice(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteDevice(row.id)">删除</el-button>
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

    <!-- 添加/编辑设备对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      v-model="dialogVisible" 
      width="600px"
      :before-close="handleClose"
    >
      <el-form 
        :model="deviceForm" 
        :rules="deviceRules" 
        ref="deviceFormRef"
        label-width="120px"
      >
        <el-form-item label="设备名称" prop="name">
          <el-input v-model="deviceForm.name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备类型" prop="device_type">
          <el-select v-model="deviceForm.device_type" placeholder="请选择设备类型" style="width: 100%">
            <el-option label="传感器" value="sensor" />
            <el-option label="控制器" value="controller" />
            <el-option label="执行器" value="actuator" />
          </el-select>
        </el-form-item>
        <el-form-item label="制造商" prop="manufacturer">
          <el-input v-model="deviceForm.manufacturer" placeholder="请输入制造商" />
        </el-form-item>
        <el-form-item label="型号" prop="model">
          <el-input v-model="deviceForm.model" placeholder="请输入型号" />
        </el-form-item>
        <el-form-item label="序列号" prop="serial_number">
          <el-input v-model="deviceForm.serial_number" placeholder="请输入序列号" />
        </el-form-item>
        <el-form-item label="安装日期" prop="installation_date">
          <el-date-picker
            v-model="deviceForm.installation_date"
            type="date"
            placeholder="选择安装日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="保修到期" prop="warranty_expiry">
          <el-date-picker
            v-model="deviceForm.warranty_expiry"
            type="date"
            placeholder="选择保修到期日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="位置" prop="location">
          <el-input v-model="deviceForm.location" placeholder="请输入设备位置" />
        </el-form-item>
        <el-form-item label="维护周期(月)" prop="maintenance_interval_months">
          <el-input-number 
            v-model="deviceForm.maintenance_interval_months" 
            :min="1" 
            :max="120"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="设备状态" prop="status">
          <el-select v-model="deviceForm.status" placeholder="请选择设备状态" style="width: 100%">
            <el-option label="运行中" value="active" />
            <el-option label="维护中" value="maintenance" />
            <el-option label="已停用" value="decommissioned" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="deviceForm.description" 
            type="textarea" 
            :rows="3"
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleClose">取消</el-button>
          <el-button type="primary" @click="saveDevice">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 设备详情对话框 -->
    <el-dialog 
      title="设备详情" 
      v-model="detailDialogVisible" 
      width="800px"
      top="5vh"
    >
      <div v-if="selectedDevice" class="device-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="设备ID">{{ selectedDevice.id }}</el-descriptions-item>
          <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ selectedDevice.device_type }}</el-descriptions-item>
          <el-descriptions-item label="制造商">{{ selectedDevice.manufacturer }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ selectedDevice.model }}</el-descriptions-item>
          <el-descriptions-item label="序列号">{{ selectedDevice.serial_number }}</el-descriptions-item>
          <el-descriptions-item label="安装日期">
            {{ selectedDevice.installation_date ? formatDate(selectedDevice.installation_date) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="保修到期">
            {{ selectedDevice.warranty_expiry ? formatDate(selectedDevice.warranty_expiry) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="位置">{{ selectedDevice.location }}</el-descriptions-item>
          <el-descriptions-item label="维护周期">
            {{ selectedDevice.maintenance_interval_months }}个月
          </el-descriptions-item>
          <el-descriptions-item label="连接状态">
            <el-tag :type="getConnectionStatusType(selectedDevice.connection_status)">
              {{ getConnectionStatusText(selectedDevice.connection_status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="设备状态">
            <el-tag :type="getStatusType(selectedDevice.status)">
              {{ getStatusText(selectedDevice.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最后心跳">
            {{ selectedDevice.last_heartbeat ? formatDate(selectedDevice.last_heartbeat) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(selectedDevice.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDate(selectedDevice.updated_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">
            {{ selectedDevice.description || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 实时数据卡片 -->
        <el-divider>实时数据</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-card class="data-card">
              <div class="data-title">温度</div>
              <div class="data-value">24.5°C</div>
              <div class="data-status">正常</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="data-card">
              <div class="data-title">湿度</div>
              <div class="data-value">65%</div>
              <div class="data-status">正常</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="data-card">
              <div class="data-title">压力</div>
              <div class="data-value">1.2 MPa</div>
              <div class="data-status">正常</div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import moment from 'moment'

export default {
  name: 'Devices',
  setup() {
    // 响应式数据
    const devices = ref([])
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const total = ref(0)
    
    const queryParams = reactive({
      search: '',
      status: '',
      deviceType: ''
    })
    
    const dialogVisible = ref(false)
    const detailDialogVisible = ref(false)
    const dialogTitle = ref('')
    const deviceFormRef = ref(null)
    
    const deviceForm = reactive({
      id: null,
      name: '',
      device_type: '',
      manufacturer: '',
      model: '',
      serial_number: '',
      installation_date: '',
      warranty_expiry: '',
      location: '',
      maintenance_interval_months: 6,
      status: 'active',
      description: ''
    })
    
    const deviceRules = {
      name: [
        { required: true, message: '请输入设备名称', trigger: 'blur' }
      ],
      device_type: [
        { required: true, message: '请选择设备类型', trigger: 'change' }
      ],
      manufacturer: [
        { required: true, message: '请输入制造商', trigger: 'blur' }
      ],
      serial_number: [
        { required: true, message: '请输入序列号', trigger: 'blur' }
      ]
    }
    
    const selectedDevice = ref(null)

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
            model: 'SITRANS DS',
            serial_number: 'TS0012023001',
            installation_date: '2023-01-15',
            warranty_expiry: '2026-01-15',
            location: '生产线A-工位1',
            maintenance_interval_months: 6,
            status: 'active',
            connection_status: 'connected',
            last_heartbeat: '2023-10-15T10:30:00Z',
            description: '高温环境温度监测',
            created_at: '2023-01-10T09:00:00Z',
            updated_at: '2023-10-01T14:20:00Z'
          },
          {
            id: 2,
            name: '压力控制器-PC002',
            device_type: 'controller',
            manufacturer: '施耐德',
            model: 'Modicon M221',
            serial_number: 'PC0022023002',
            installation_date: '2023-02-20',
            warranty_expiry: '2026-02-20',
            location: '生产线B-控制柜2',
            maintenance_interval_months: 12,
            status: 'active',
            connection_status: 'connected',
            last_heartbeat: '2023-10-15T10:28:00Z',
            description: '气压控制系统',
            created_at: '2023-02-15T11:30:00Z',
            updated_at: '2023-09-15T16:45:00Z'
          },
          {
            id: 3,
            name: '电机执行器-ME003',
            device_type: 'actuator',
            manufacturer: 'ABB',
            model: 'M3BP 132S',
            serial_number: 'ME0032023003',
            installation_date: '2023-03-10',
            warranty_expiry: '2026-03-10',
            location: '装配线C-驱动单元',
            maintenance_interval_months: 3,
            status: 'maintenance',
            connection_status: 'disconnected',
            last_heartbeat: '2023-10-10T08:15:00Z',
            description: '精密驱动装置',
            created_at: '2023-03-05T10:15:00Z',
            updated_at: '2023-10-14T09:30:00Z'
          }
        ]
        
        total.value = devices.value.length
      } catch (error) {
        console.error('Error loading devices:', error)
        ElMessage.error('加载设备列表失败')
      } finally {
        loading.value = false
      }
    }

    const showAddDeviceDialog = () => {
      dialogTitle.value = '添加设备'
      Object.keys(deviceForm).forEach(key => {
        if (key !== 'id') deviceForm[key] = key === 'maintenance_interval_months' ? 6 : ''
      })
      dialogVisible.value = true
    }

    const editDevice = (row) => {
      dialogTitle.value = '编辑设备'
      Object.keys(deviceForm).forEach(key => {
        deviceForm[key] = row[key]
      })
      deviceForm.id = row.id
      dialogVisible.value = true
    }

    const viewDeviceDetail = (row) => {
      selectedDevice.value = { ...row }
      detailDialogVisible.value = true
    }

    const saveDevice = async () => {
      try {
        await deviceFormRef.value.validate()
        
        // 模拟保存操作
        await new Promise(resolve => setTimeout(resolve, 500))
        
        ElMessage.success(deviceForm.id ? '设备更新成功' : '设备添加成功')
        dialogVisible.value = false
        loadDevices() // 重新加载列表
      } catch (error) {
        console.error('Error saving device:', error)
        ElMessage.error('保存设备失败')
      }
    }

    const deleteDevice = async (id) => {
      try {
        await ElMessageBox.confirm(
          '此操作将永久删除该设备, 是否继续?',
          '提示',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 模拟删除操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('设备删除成功')
        loadDevices() // 重新加载列表
      } catch (error) {
        console.error('Error deleting device:', error)
        if (error !== 'cancel') {
          ElMessage.error('删除设备失败')
        }
      }
    }

    const resetFilters = () => {
      queryParams.search = ''
      queryParams.status = ''
      queryParams.deviceType = ''
      loadDevices()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      loadDevices()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadDevices()
    }

    const handleClose = () => {
      dialogVisible.value = false
    }

    const formatDate = (date) => {
      if (!date) return '-'
      return moment(date).format('YYYY-MM-DD HH:mm:ss')
    }

    const getConnectionStatusType = (status) => {
      switch (status) {
        case 'connected': return 'success'
        case 'disconnected': return 'danger'
        case 'error': return 'warning'
        default: return 'info'
      }
    }

    const getConnectionStatusText = (status) => {
      switch (status) {
        case 'connected': return '已连接'
        case 'disconnected': return '断开连接'
        case 'error': return '连接错误'
        default: return '未知'
      }
    }

    const getStatusType = (status) => {
      switch (status) {
        case 'active': return 'success'
        case 'maintenance': return 'warning'
        case 'decommissioned': return 'info'
        default: return 'info'
      }
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'active': return '运行中'
        case 'maintenance': return '维护中'
        case 'decommissioned': return '已停用'
        default: return '未知'
      }
    }

    // 生命周期钩子
    onMounted(() => {
      loadDevices()
    })

    return {
      devices,
      loading,
      currentPage,
      pageSize,
      total,
      queryParams,
      dialogVisible,
      detailDialogVisible,
      dialogTitle,
      deviceFormRef,
      deviceForm,
      deviceRules,
      selectedDevice,
      loadDevices,
      showAddDeviceDialog,
      editDevice,
      viewDeviceDetail,
      saveDevice,
      deleteDevice,
      resetFilters,
      handleSizeChange,
      handleCurrentChange,
      handleClose,
      formatDate,
      getConnectionStatusType,
      getConnectionStatusText,
      getStatusType,
      getStatusText
    }
  }
}
</script>

<style scoped>
.devices-container {
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

.filter-section {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

.data-card {
  text-align: center;
  padding: 20px;
}

.data-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 10px;
}

.data-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 5px;
}

.data-status {
  font-size: 12px;
  color: #67C23A;
}
</style>