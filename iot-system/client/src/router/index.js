import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/components/Layout.vue'
import Login from '@/views/Login.vue'
import Dashboard from '@/views/Dashboard.vue'
import Devices from '@/views/Devices.vue'
import Alarms from '@/views/Alarms.vue'
import WorkOrders from '@/views/WorkOrders.vue'
import PredictiveMaintenance from '@/views/PredictiveMaintenance.vue'
import Reports from '@/views/Reports.vue'
import Settings from '@/views/Settings.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: Dashboard,
        meta: { title: '仪表板', requiresAuth: true }
      },
      {
        path: '/devices',
        name: 'Devices',
        component: Devices,
        meta: { title: '设备管理', requiresAuth: true }
      },
      {
        path: '/alarms',
        name: 'Alarms',
        component: Alarms,
        meta: { title: '报警中心', requiresAuth: true }
      },
      {
        path: '/workorders',
        name: 'WorkOrders',
        component: WorkOrders,
        meta: { title: '工单管理', requiresAuth: true }
      },
      {
        path: '/predictive-maintenance',
        name: 'PredictiveMaintenance',
        component: PredictiveMaintenance,
        meta: { title: '预测维护', requiresAuth: true }
      },
      {
        path: '/reports',
        name: 'Reports',
        component: Reports,
        meta: { title: '报表分析', requiresAuth: true }
      },
      {
        path: '/settings',
        name: 'Settings',
        component: Settings,
        meta: { title: '系统设置', requiresAuth: true }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = YOUR_SECRET'token')
  const title = to.meta.title || 'IoT管理系统'
  
  document.title = title
  
  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!token) {
      next('/login')
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router