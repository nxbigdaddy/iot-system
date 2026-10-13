<template>
  <div class="settings-container">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <h3>系统设置</h3>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="settings-tabs">
        <el-tab-pane label="个人信息" name="profile">
          <el-form 
            :model="profileForm" 
            :rules="profileRules" 
            ref="profileFormRef"
            label-width="120px"
            style="max-width: 600px;"
          >
            <el-form-item label="头像">
              <el-upload
                class="avatar-uploader"
                action="/api/upload/avatar"
                :show-file-list="false"
                :on-success="handleAvatarSuccess"
                :before-upload="beforeAvatarUpload"
              >
                <img v-if="profileForm.avatar" :src="profileForm.avatar" class="avatar">
                <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
              </el-upload>
            </el-form-item>
            <el-form-item label="用户名" prop="username">
              <el-input v-model="profileForm.username" />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profileForm.email" />
            </el-form-item>
            <el-form-item label="联系电话" prop="phone">
              <el-input v-model="profileForm.phone" />
            </el-form-item>
            <el-form-item label="部门">
              <el-input v-model="profileForm.department" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveProfile">保存</el-button>
              <el-button @click="cancelProfile">取消</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="账户安全" name="security">
          <el-form 
            :model="securityForm" 
            :rules="securityRules" 
            ref="securityFormRef"
            label-width="120px"
            style="max-width: 600px;"
          >
            <el-form-item label="当前密码" prop="currentPassword">
              <el-input v-model="securityForm.currentPassword" type="YOUR_PASSWORD" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="securityForm.newPassword" type="YOUR_PASSWORD" show-password />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmNewPassword">
              <el-input v-model="securityForm.confirmNewPassword" type="YOUR_PASSWORD" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="changePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="系统参数" name="system">
          <el-form 
            :model="systemForm" 
            label-width="150px"
            style="max-width: 800px;"
          >
            <el-form-item label="报警通知开关">
              <el-switch v-model="systemForm.alarmNotification" />
            </el-form-item>
            <el-form-item label="邮件通知开关">
              <el-switch v-model="systemForm.emailNotification" />
            </el-form-item>
            <el-form-item label="短信通知开关">
              <el-switch v-model="systemForm.smsNotification" />
            </el-form-item>
            <el-form-item label="企业微信通知开关">
              <el-switch v-model="systemForm.wechatNotification" />
            </el-form-item>
            <el-form-item label="数据保留天数">
              <el-slider 
                v-model="systemForm.dataRetentionDays" 
                :min="7" 
                :max="365" 
                show-input
              />
            </el-form-item>
            <el-form-item label="自动备份间隔">
              <el-select v-model="systemForm.backupInterval" style="width: 200px;">
                <el-option label="每天" value="daily" />
                <el-option label="每周" value="weekly" />
                <el-option label="每月" value="monthly" />
              </el-select>
            </el-form-item>
            <el-form-item label="备份保留数量">
              <el-input-number v-model="systemForm.backupRetentionCount" :min="1" :max="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSystemSettings">保存设置</el-button>
              <el-button @click="resetSystemSettings">恢复默认</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="关于系统" name="about">
          <div class="about-content">
            <div class="system-info">
              <h3>物联网设备管理系统</h3>
              <p><strong>版本:</strong> v1.0.0</p>
              <p><strong>构建时间:</strong> 2023-10-15</p>
              <p><strong>开发者:</strong> IoT开发团队</p>
              <p><strong>技术支持:</strong> support@example.com</p>
            </div>
            
            <div class="features">
              <h4>系统功能</h4>
              <ul>
                <li>设备远程监控与管理</li>
                <li>实时数据采集与分析</li>
                <li>多级报警通知机制</li>
                <li>预测性维护算法</li>
                <li>工单管理流程</li>
                <li>物料库存管理</li>
                <li>数据可视化报表</li>
                <li>多租户权限控制</li>
              </ul>
            </div>
            
            <div class="tech-stack">
              <h4>技术栈</h4>
              <ul>
                <li>后端: NestJS, TypeScript, PostgreSQL</li>
                <li>前端: Vue 3, Element Plus, ECharts</li>
                <li>消息队列: MQTT, EMQX</li>
                <li>容器化: Docker, Docker Compose</li>
                <li>其他: Redis, InfluxDB</li>
              </ul>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

export default {
  name: 'Settings',
  components: {
    Plus
  },
  setup() {
    const activeTab = ref('profile')
    
    // 个人信息表单
    const profileForm = reactive({
      avatar: '',
      username: 'admin',
      email: 'admin@example.com',
      phone: '13800138000',
      department: '技术部'
    })
    
    const profileRules = {
      username: [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { min: 3, max: 15, message: '用户名长度应在3-15个字符之间', trigger: 'blur' }
      ],
      email: [
        { required: true, message: '请输入邮箱地址', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
      ],
      phone: [
        { required: true, message: '请输入联系电话', trigger: 'blur' },
        { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
      ]
    }
    
    const profileFormRef = ref(null)
    
    // 安全设置表单
    const securityForm = reactive({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: ''
    })
    
    const securityRules = {
      currentPassword: [
        { required: true, message: '请输入当前密码', trigger: 'blur' }
      ],
      newPassword: [
        { required: true, message: '请输入新密码', trigger: 'blur' },
        { min: 6, message: '密码长度至少为6位', trigger: 'blur' }
      ],
      confirmNewPassword: [
        { required: true, message: '请确认新密码', trigger: 'blur' },
        { 
          validator: (rule, value, callback) => {
            if (value !== securityForm.newPassword) {
              callback(new Error('两次输入的密码不一致'))
            } else {
              callback()
            }
          }, 
          trigger: 'blur' 
        }
      ]
    }
    
    const securityFormRef = ref(null)
    
    // 系统设置表单
    const systemForm = reactive({
      alarmNotification: true,
      emailNotification: true,
      smsNotification: false,
      wechatNotification: true,
      dataRetentionDays: 90,
      backupInterval: 'daily',
      backupRetentionCount: 7
    })
    
    // 方法
    const handleAvatarSuccess = (response, file) => {
      profileForm.avatar = URL.createObjectURL(file.raw)
    }
    
    const beforeAvatarUpload = (file) => {
      const isJPG = file.type === 'image/jpeg' || file.type === 'image/png'
      const isLt2M = file.size / 1024 / 1024 < 2
      
      if (!isJPG) {
        ElMessage.error('头像图片只能是 JPG 或 PNG 格式!')
      }
      if (!isLt2M) {
        ElMessage.error('头像图片大小不能超过 2MB!')
      }
      return isJPG && isLt2M
    }
    
    const saveProfile = async () => {
      try {
        await profileFormRef.value.validate()
        
        // 模拟保存操作
        await new Promise(resolve => setTimeout(resolve, 500))
        
        ElMessage.success('个人信息保存成功')
      } catch (error) {
        console.error('Error saving profile:', error)
        ElMessage.error('保存失败')
      }
    }
    
    const cancelProfile = () => {
      // 重置表单到初始状态
      Object.assign(profileForm, {
        avatar: '',
        username: 'admin',
        email: 'admin@example.com',
        phone: '13800138000',
        department: '技术部'
      })
    }
    
    const changePassword = async () => {
      try {
        await securityFormRef.value.validate()
        
        if (securityForm.newPassword !== securityForm.confirmNewPassword) {
          ElMessage.error('两次输入的密码不一致')
          return
        }
        
        // 模拟密码修改操作
        await new Promise(resolve => setTimeout(resolve, 500))
        
        ElMessage.success('密码修改成功')
        
        // 重置表单
        Object.assign(securityForm, {
          currentPassword: '',
          newPassword: '',
          confirmNewPassword: ''
        })
      } catch (error) {
        console.error('Error changing password:', error)
        ElMessage.error('密码修改失败')
      }
    }
    
    const saveSystemSettings = async () => {
      try {
        // 模拟保存系统设置
        await new Promise(resolve => setTimeout(resolve, 500))
        
        ElMessage.success('系统设置保存成功')
      } catch (error) {
        console.error('Error saving system settings:', error)
        ElMessage.error('保存失败')
      }
    }
    
    const resetSystemSettings = () => {
      // 恢复默认设置
      Object.assign(systemForm, {
        alarmNotification: true,
        emailNotification: true,
        smsNotification: false,
        wechatNotification: true,
        dataRetentionDays: 90,
        backupInterval: 'daily',
        backupRetentionCount: 7
      })
      
      ElMessage.success('已恢复默认设置')
    }
    
    onMounted(() => {
      // 加载用户信息
      // 这里可以从API获取当前用户信息
    })
    
    return {
      activeTab,
      profileForm,
      profileRules,
      profileFormRef,
      securityForm,
      securityRules,
      securityFormRef,
      systemForm,
      handleAvatarSuccess,
      beforeAvatarUpload,
      saveProfile,
      cancelProfile,
      changePassword,
      saveSystemSettings,
      resetSystemSettings
    }
  }
}
</script>

<style scoped>
.settings-container {
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

.settings-tabs {
  margin-top: 20px;
}

.avatar-uploader .el-upload {
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: var(--el-transition-duration-fast);
}

.avatar-uploader .el-upload:hover {
  border-color: var(--el-color-primary);
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 178px;
  height: 178px;
  text-align: center;
}

.avatar {
  width: 178px;
  height: 178px;
  display: block;
}

.about-content {
  max-width: 800px;
}

.system-info h3 {
  margin-top: 0;
  color: #303133;
}

.system-info p {
  color: #606266;
  margin: 5px 0;
}

.features ul, .tech-stack ul {
  padding-left: 20px;
}

.features li, .tech-stack li {
  margin: 8px 0;
  color: #606266;
}
</style>