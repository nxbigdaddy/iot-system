<template>
  <div class="work-orders-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>工单管理</h3>
          <div>
            <el-button type="primary" @click="showAddWorkOrderDialog">创建工单</el-button>
            <el-button @click="loadWorkOrders">刷新</el-button>
          </div>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-cards">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-blue">
                <el-icon><Document /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.total }}</p>
                <p class="stat-label">总工单</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-orange">
                <el-icon><Timer /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.pending }}</p>
                <p class="stat-label">待处理</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-green">
                <el-icon><Odometer /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.inProgress }}</p>
                <p class="stat-label">进行中</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon bg-purple">
                <el-icon><CircleCheck /></el-icon>
              </div>
              <div class="stat-info">
                <p class="stat-number">{{ stats.completed }}</p>
                <p class="stat-label">已完成</p>
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
              placeholder="工单状态" 
              clearable
              @change="loadWorkOrders"
            >
              <el-option label="待处理" value="pending" />
              <el-option label="已分配" value="assigned" />
              <el-option label="进行中" value="in_progress" />
              <el-option label="已完成" value="completed" />
              <el-option label="已关闭" value="closed" />
              <el-option label="已取消" value="cancelled" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="queryParams.priority" 
              placeholder="优先级" 
              clearable
              @change="loadWorkOrders"
            >
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
              <el-option label="紧急" value="urgent" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select 
              v-model="queryParams.type" 
              placeholder="工单类型" 
              clearable
              @change="loadWorkOrders"
            >
              <el-option label="巡检" value="inspection" />
              <el-option label="维修" value="repair" />
              <el-option label="保养" value="maintenance" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-input 
              v-model="queryParams.deviceName" 
              placeholder="设备名称" 
              clearable
              @keyup.enter="loadWorkOrders"
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
        </el-row>
        <el-row :gutter="20" style="margin-top: 10px;">
          <el-col :span="24">
            <el-button type="primary" @click="loadWorkOrders">搜索</el-button>
            <el-button @click="resetFilters">重置</el-button>
            <el-button @click="exportWorkOrders">导出</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 工单列表 -->
      <el-table 
        :data="workOrders" 
        v-loading="loading"
        style="width: 100%; margin-top: 20px;"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="工单标题" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="viewWorkOrderDetail(row)">
              {{ row.title }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="device.name" label="设备名称" width="150" />
        <el-table-column prop="order_type" label="工单类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ getOrderTypeText(row.order_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="80">
          <template #default="{ row }">
            <el-tag 
              :type="getPriorityType(row.priority)"
              size="small"
            >
              {{ getPriorityText(row.priority) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag 
              :type="getStatusType(row.status)"
              size="small"
            >
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assigned_user.username" label="负责人" width="120" />
        <el-table-column prop="scheduled_date" label="计划日期" width="120">
          <template #default="{ row }">
            {{ row.scheduled_date ? formatDate(row.scheduled_date) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="actual_start_time" label="开始时间" width="160">
          <template #default="{ row }">
            {{ row.actual_start_time ? formatDate(row.actual_start_time) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="actual_end_time" label="结束时间" width="160">
          <template #default="{ row }">
            {{ row.actual_end_time ? formatDate(row.actual_end_time) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewWorkOrderDetail(row)">查看</el-button>
            <el-button size="small" type="primary" @click="editWorkOrder(row)">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" type="default">
                更多 <el-icon><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="assignWorkOrder(row)" :disabled="row.status !== 'pending'">
                    分配
                  </el-dropdown-item>
                  <el-dropdown-item @click="startWorkOrder(row)" :disabled="row.status !== 'assigned'">
                    开始处理
                  </el-dropdown-item>
                  <el-dropdown-item @click="completeWorkOrder(row)" :disabled="row.status !== 'in_progress'">
                    完成
                  </el-dropdown-item>
                  <el-dropdown-item @click="cancelWorkOrder(row)" :disabled="!['pending', 'assigned'].includes(row.status)">
                    取消
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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

    <!-- 添加/编辑工单对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      v-model="dialogVisible" 
      width="700px"
      :before-close="handleClose"
    >
      <el-form 
        :model="workOrderForm" 
        :rules="workOrderRules" 
        ref="workOrderFormRef"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="工单标题" prop="title">
              <el-input v-model="workOrderForm.title" placeholder="请输入工单标题" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工单类型" prop="order_type">
              <el-select v-model="workOrderForm.order_type" placeholder="请选择工单类型" style="width: 100%">
                <el-option label="巡检" value="inspection" />
                <el-option label="维修" value="repair" />
                <el-option label="保养" value="maintenance" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备" prop="device_id">
              <el-select v-model="workOrderForm.device_id" placeholder="请选择设备" style="width: 100%">
                <el-option 
                  v-for="device in devices" 
                  :key="device.id" 
                  :label="device.name" 
                  :value="device.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级" prop="priority">
              <el-select v-model="workOrderForm.priority" placeholder="请选择优先级" style="width: 100%">
                <el-option label="低" value="low" />
                <el-option label="中" value="medium" />
                <el-option label="高" value="high" />
                <el-option label="紧急" value="urgent" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="负责人" prop="assigned_user_id">
              <el-select v-model="workOrderForm.assigned_user_id" placeholder="请选择负责人" style="width: 100%">
                <el-option 
                  v-for="user in users" 
                  :key="user.id" 
                  :label="user.username" 
                  :value="user.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计划日期" prop="scheduled_date">
              <el-date-picker
                v-model="workOrderForm.scheduled_date"
                type="datetime"
                placeholder="选择计划日期"
                format="YYYY-MM-DD HH:mm"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="工单描述" prop="description">
          <el-input 
            v-model="workOrderForm.description" 
            type="textarea" 
            :rows="4"
            placeholder="请输入工单详细描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleClose">取消</el-button>
          <el-button type="primary" @click="saveWorkOrder">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 工单详情对话框 -->
    <el-dialog 
      title="工单详情" 
      v-model="detailDialogVisible" 
      width="800px"
      top="5vh"
    >
      <div v-if="selectedWorkOrder" class="work-order-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="工单ID">{{ selectedWorkOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="工单标题">{{ selectedWorkOrder.title }}</el-descriptions-item>
          <el-descriptions-item label="工单类型">
            <el-tag>{{ getOrderTypeText(selectedWorkOrder.order_type) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="优先级">
            <el-tag :type="getPriorityType(selectedWorkOrder.priority)">
              {{ getPriorityText(selectedWorkOrder.priority) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="设备名称">{{ selectedWorkOrder.device.name }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ selectedWorkOrder.assigned_user?.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ selectedWorkOrder.created_user.username }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedWorkOrder.status)">
              {{ getStatusText(selectedWorkOrder.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="计划日期">
            {{ selectedWorkOrder.scheduled_date ? formatDate(selectedWorkOrder.scheduled_date) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">
            {{ selectedWorkOrder.actual_start_time ? formatDate(selectedWorkOrder.actual_start_time) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="结束时间">
            {{ selectedWorkOrder.actual_end_time ? formatDate(selectedWorkOrder.actual_end_time) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(selectedWorkOrder.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDate(selectedWorkOrder.updated_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="工单描述" :span="2">
            {{ selectedWorkOrder.description || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 维护日志 -->
        <el-divider>维护日志</el-divider>
        <el-timeline>
          <el-timeline-item 
            v-for="log in selectedWorkOrder.maintenance_logs" 
            :key="log.id"
            :timestamp="formatDate(log.created_at)"
            placement="top"
          >
            <el-card>
              <h4>{{ log.technician.username }}</h4>
              <p>{{ log.description }}</p>
              <p>开始时间: {{ formatDate(log.start_time) }}</p>
              <p>结束时间: {{ formatDate(log.end_time) }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import moment from 'moment'
import { 
  Document, Timer, Odometer, CircleCheck, 
  ArrowDown 
} from '@element-plus/icons-vue'

export default {
  name: 'WorkOrders',
  components: {
    Document, Timer, Odometer, CircleCheck, ArrowDown
  },
  setup() {
    // 响应式数据
    const workOrders = ref([])
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const total = ref(0)
    
    const stats = reactive({
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0
    })
    
    const queryParams = reactive({
      status: '',
      priority: '',
      type: '',
      deviceName: ''
    })
    
    const dateRange = ref([])
    
    const dialogVisible = ref(false)
    const detailDialogVisible = ref(false)
    const dialogTitle = ref('')
    const workOrderFormRef = ref(null)
    
    const workOrderForm = reactive({
      id: null,
      title: '',
      order_type: '',
      device_id: null,
      priority: 'medium',
      assigned_user_id: null,
      scheduled_date: '',
      description: ''
    })
    
    const workOrderRules = {
      title: [
        { required: true, message: '请输入工单标题', trigger: 'blur' }
      ],
      order_type: [
        { required: true, message: '请选择工单类型', trigger: 'change' }
      ],
      device_id: [
        { required: true, message: '请选择设备', trigger: 'change' }
      ],
      priority: [
        { required: true, message: '请选择优先级', trigger: 'change' }
      ]
    }
    
    const selectedWorkOrder = ref(null)
    
    // 模拟数据
    const devices = ref([
      { id: 1, name: '温度传感器-TS001' },
      { id: 2, name: '压力控制器-PC002' },
      { id: 3, name: '电机执行器-ME003' },
      { id: 4, name: '液位传感器-LS004' }
    ])
    
    const users = ref([
      { id: 1, username: '张三' },
      { id: 2, username: '李四' },
      { id: 3, username: '王五' },
      { id: 4, username: '赵六' }
    ])

    // 方法
    const loadWorkOrders = async () => {
      loading.value = true
      try {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // 模拟数据
        workOrders.value = [
          {
            id: 1,
            title: '温度传感器定期保养',
            order_type: 'maintenance',
            device: { name: '温度传感器-TS001' },
            priority: 'medium',
            assigned_user: { username: '张三' },
            created_user: { username: '管理员' },
            status: 'in_progress',
            scheduled_date: '2023-10-20T09:00:00Z',
            actual_start_time: '2023-10-20T09:15:00Z',
            actual_end_time: null,
            description: '对温度传感器进行定期校准和清洁维护',
            created_at: '2023-10-18T10:00:00Z',
            updated_at: '2023-10-20T09:15:00Z',
            maintenance_logs: [
              {
                id: 1,
                technician: { username: '张三' },
                description: '开始设备检查',
                start_time: '2023-10-20T09:15:00Z',
                end_time: '2023-10-20T09:30:00Z',
                created_at: '2023-10-20T09:30:00Z'
              }
            ]
          },
          {
            id: 2,
            title: '压力控制器故障维修',
            order_type: 'repair',
            device: { name: '压力控制器-PC002' },
            priority: 'high',
            assigned_user: { username: '李四' },
            created_user: { username: '管理员' },
            status: 'pending',
            scheduled_date: '2023-10-21T14:00:00Z',
            actual_start_time: null,
            actual_end_time: null,
            description: '压力控制器响应异常，需要现场检修',
            created_at: '2023-10-19T15:30:00Z',
            updated_at: '2023-10-19T15:30:00Z',
            maintenance_logs: []
          },
          {
            id: 3,
            title: '电机执行器季度巡检',
            order_type: 'inspection',
            device: { name: '电机执行器-ME003' },
            priority: 'low',
            assigned_user: { username: '王五' },
            created_user: { username: '管理员' },
            status: 'completed',
            scheduled_date: '2023-10-15T10:00:00Z',
            actual_start_time: '2023-10-15T10:05:00Z',
            actual_end_time: '2023-10-15T11:30:00Z',
            description: '季度例行巡检，检查电机运行状态',
            created_at: '2023-10-10T09:00:00Z',
            updated_at: '2023-10-15T11:30:00Z',
            maintenance_logs: [
              {
                id: 2,
                technician: { username: '王五' },
                description: '完成巡检，设备运行正常',
                start_time: '2023-10-15T10:05:00Z',
                end_time: '2023-10-15T11:30:00Z',
                created_at: '2023-10-15T11:30:00Z'
              }
            ]
          }
        ]
        
        total.value = workOrders.value.length
        
        // 模拟统计信息
        stats.total = 45
        stats.pending = 12
        stats.inProgress = 8
        stats.completed = 25
      } catch (error) {
        console.error('Error loading work orders:', error)
        ElMessage.error('加载工单列表失败')
      } finally {
        loading.value = false
      }
    }

    const showAddWorkOrderDialog = () => {
      dialogTitle.value = '创建工单'
      Object.keys(workOrderForm).forEach(key => {
        if (key !== 'id') workOrderForm[key] = key === 'priority' ? 'medium' : null
      })
      dialogVisible.value = true
    }

    const editWorkOrder = (row) => {
      dialogTitle.value = '编辑工单'
      Object.keys(workOrderForm).forEach(key => {
        workOrderForm[key] = row[key]
      })
      workOrderForm.id = row.id
      dialogVisible.value = true
    }

    const viewWorkOrderDetail = (row) => {
      selectedWorkOrder.value = { ...row }
      detailDialogVisible.value = true
    }

    const saveWorkOrder = async () => {
      try {
        await workOrderFormRef.value.validate()
        
        // 模拟保存操作
        await new Promise(resolve => setTimeout(resolve, 500))
        
        ElMessage.success(workOrderForm.id ? '工单更新成功' : '工单创建成功')
        dialogVisible.value = false
        loadWorkOrders() // 重新加载列表
      } catch (error) {
        console.error('Error saving work order:', error)
        ElMessage.error('保存工单失败')
      }
    }

    const assignWorkOrder = async (row) => {
      try {
        const { value } = await ElMessageBox.prompt('请选择负责人:', '分配工单', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputType: 'select',
          inputValue: row.assigned_user?.id || '',
          inputOptions: users.value.map(user => ({ label: user.username, value: user.id }))
        })
        
        // 模拟分配操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('工单分配成功')
        loadWorkOrders() // 重新加载列表
      } catch (error) {
        console.error('Error assigning work order:', error)
        if (error !== 'cancel') {
          ElMessage.error('分配工单失败')
        }
      }
    }

    const startWorkOrder = async (row) => {
      try {
        await ElMessageBox.confirm(
          '确认开始处理此工单?',
          '提示',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 模拟开始操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('工单已开始处理')
        loadWorkOrders() // 重新加载列表
      } catch (error) {
        console.error('Error starting work order:', error)
        if (error !== 'cancel') {
          ElMessage.error('开始处理工单失败')
        }
      }
    }

    const completeWorkOrder = async (row) => {
      try {
        await ElMessageBox.prompt('请输入完成说明:', '完成工单', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputPattern: /^[\s\S]{1,200}$/,
          inputErrorMessage: '完成说明不能为空且不超过200字符',
        }).then(async ({ value }) => {
          // 模拟完成操作
          await new Promise(resolve => setTimeout(resolve, 300))
          
          ElMessage.success('工单已完成')
          loadWorkOrders() // 重新加载列表
        })
      } catch (error) {
        console.error('Error completing work order:', error)
        if (error !== 'cancel') {
          ElMessage.error('完成工单失败')
        }
      }
    }

    const cancelWorkOrder = async (row) => {
      try {
        await ElMessageBox.confirm(
          '确认取消此工单?',
          '提示',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 模拟取消操作
        await new Promise(resolve => setTimeout(resolve, 300))
        
        ElMessage.success('工单已取消')
        loadWorkOrders() // 重新加载列表
      } catch (error) {
        console.error('Error cancelling work order:', error)
        if (error !== 'cancel') {
          ElMessage.error('取消工单失败')
        }
      }
    }

    const exportWorkOrders = () => {
      ElMessage.success('正在导出工单数据...')
      // 模拟导出操作
    }

    const resetFilters = () => {
      queryParams.status = ''
      queryParams.priority = ''
      queryParams.type = ''
      queryParams.deviceName = ''
      dateRange.value = []
      loadWorkOrders()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      loadWorkOrders()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadWorkOrders()
    }

    const handleClose = () => {
      dialogVisible.value = false
    }

    const handleDateChange = (value) => {
      // 处理日期范围变化
      loadWorkOrders()
    }

    const formatDate = (date) => {
      if (!date) return '-'
      return moment(date).format('YYYY-MM-DD HH:mm:ss')
    }

    const getPriorityType = (priority) => {
      switch (priority) {
        case 'low': return 'info'
        case 'medium': return 'warning'
        case 'high': return 'danger'
        case 'urgent': return 'danger'
        default: return 'info'
      }
    }

    const getPriorityText = (priority) => {
      switch (priority) {
        case 'low': return '低'
        case 'medium': return '中'
        case 'high': return '高'
        case 'urgent': return '紧急'
        default: return '未知'
      }
    }

    const getStatusType = (status) => {
      switch (status) {
        case 'pending': return 'info'
        case 'assigned': return 'warning'
        case 'in_progress': return 'primary'
        case 'completed': return 'success'
        case 'closed': return 'default'
        case 'cancelled': return 'danger'
        default: return 'info'
      }
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'pending': return '待处理'
        case 'assigned': return '已分配'
        case 'in_progress': return '进行中'
        case 'completed': return '已完成'
        case 'closed': return '已关闭'
        case 'cancelled': return '已取消'
        default: return '未知'
      }
    }

    const getOrderTypeText = (type) => {
      switch (type) {
        case 'inspection': return '巡检'
        case 'repair': return '维修'
        case 'maintenance': return '保养'
        default: return '未知'
      }
    }

    // 生命周期钩子
    onMounted(() => {
      loadWorkOrders()
    })

    return {
      workOrders,
      loading,
      currentPage,
      pageSize,
      total,
      stats,
      queryParams,
      dateRange,
      dialogVisible,
      detailDialogVisible,
      dialogTitle,
      workOrderFormRef,
      workOrderForm,
      workOrderRules,
      selectedWorkOrder,
      devices,
      users,
      loadWorkOrders,
      showAddWorkOrderDialog,
      editWorkOrder,
      viewWorkOrderDetail,
      saveWorkOrder,
      assignWorkOrder,
      startWorkOrder,
      completeWorkOrder,
      cancelWorkOrder,
      exportWorkOrders,
      resetFilters,
      handleSizeChange,
      handleCurrentChange,
      handleClose,
      handleDateChange,
      formatDate,
      getPriorityType,
      getPriorityText,
      getStatusType,
      getStatusText,
      getOrderTypeText
    }
  }
}
</script>

<style scoped>
.work-orders-container {
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

.bg-blue {
  background-color: #409EFF;
}

.bg-orange {
  background-color: #E6A23C;
}

.bg-green {
  background-color: #67C23A;
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

.filter-section {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

.work-order-detail {
  max-height: 70vh;
  overflow-y: auto;
}
</style>