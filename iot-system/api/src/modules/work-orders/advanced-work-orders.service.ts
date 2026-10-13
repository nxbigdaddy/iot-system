import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { MaintenanceLog } from '../maintenance-logs/entities/maintenance-log.entity';
import { WorkOrderMaterial } from '../work-order-materials/entities/work-order-material.entity';
import { Material } from '../materials/entities/material.entity';
import { NotificationService } from '../notifications/notifications.service';
import { DeviceMonitoringService } from '../devices/device-monitoring.service';
import { AdvancedPredictiveMaintenanceService } from '../predictive-maintenance/advanced-predictive-maintenance.service';

export interface WorkOrderAssignment {
  workOrderId: number;
  userId: number;
  assignedAt: Date;
  assignmentReason: string;
}

export interface WorkOrderCompletion {
  workOrderId: number;
  completionData: {
    startTime: Date;
    endTime: Date;
    technicianId: number;
    materialsUsed: Array<{
      materialId: number;
      quantityUsed: number;
      cost: number;
    }>;
    maintenanceNotes: string;
    photos?: string[]; // 维护照片
    status: 'completed' | 'pending_review' | 'needs_attention';
  };
}

export interface WorkOrderMetrics {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  averageCompletionTime: number; // 平均完成时间（小时）
  efficiencyRate: number; // 效率比率
}

@Injectable()
export class AdvancedWorkOrdersService {
  private logger = new Logger(AdvancedWorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private workOrdersRepository: Repository<WorkOrder>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(MaintenanceLog)
    private maintenanceLogsRepository: Repository<MaintenanceLog>,
    @InjectRepository(WorkOrderMaterial)
    private workOrderMaterialsRepository: Repository<WorkOrderMaterial>,
    @InjectRepository(Material)
    private materialsRepository: Repository<Material>,
    private notificationService: NotificationService,
    private deviceMonitoringService: DeviceMonitoringService,
    private predictiveMaintenanceService: AdvancedPredictiveMaintenanceService,
  ) {}

  /**
   * 创建工单
   */
  async createWorkOrder(workOrderData: Partial<WorkOrder>) {
    const device = await this.devicesRepository.findOne({ 
      where: { id: workOrderData.device_id } 
    });
    
    if (!device) {
      throw new Error(`Device with id ${workOrderData.device_id} not found`);
    }

    // 如果指定了负责人，验证用户是否存在
    if (workOrderData.assigned_user_id) {
      const user = await this.usersRepository.findOne({ 
        where: { id: workOrderData.assigned_user_id } 
      });
      
      if (!user) {
        throw new Error(`User with id ${workOrderData.assigned_user_id} not found`);
      }
    }

    const workOrder = this.workOrdersRepository.create({
      ...workOrderData,
      status: workOrderData.status || 'pending',
      created_at: workOrderData.created_at || new Date(),
      updated_at: new Date()
    });

    const savedWorkOrder = await this.workOrdersRepository.save(workOrder);

    // 发送通知给负责人
    if (workOrder.assigned_user_id) {
      const assignedUser = await this.usersRepository.findOne({ 
        where: { id: workOrder.assigned_user_id } 
      });
      
      if (assignedUser) {
        try {
          await this.notificationService.sendWeChatNotification(
            assignedUser,
            `新工单分配 - ${device.name}`,
            `您有一个新的工单需要处理：\n${workOrder.title}\n设备：${device.name}\n优先级：${workOrder.priority}\n请尽快处理！`
          );
          
          // 同时发送邮件通知
          await this.notificationService.sendEmailNotification(
            assignedUser.email,
            `新工单分配 - ${device.name}`,
            `您有一个新的工单需要处理：\n\n工单标题：${workOrder.title}\n设备：${device.name}\n优先级：${workOrder.priority}\n创建时间：${workOrder.created_at}\n\n请尽快处理！`
          );
        } catch (error) {
          this.logger.error(`Failed to send notification for work order ${savedWorkOrder.id}: ${error.message}`);
        }
      }
    }

    return savedWorkOrder;
  }

  /**
   * 自动分配工单到最合适的技术员
   */
  async autoAssignWorkOrder(workOrderId: number): Promise<WorkOrderAssignment> {
    const workOrder = await this.workOrdersRepository.findOne({ 
      where: { id: workOrderId },
      relations: ['device']
    });
    
    if (!workOrder) {
      throw new Error(`Work order with id ${workOrderId} not found`);
    }

    // 获取所有可用的技术员
    const availableTechnicians = await this.usersRepository.find({
      where: {
        role: 'technician',
        status: 'active'
      }
    });

    if (availableTechnicians.length === 0) {
      throw new Error('No available technicians found');
    }

    // 根据设备类型、优先级、工作负载等因素选择最适合的技术员
    let bestTechnician = availableTechnicians[0];
    let bestScore = -1;

    for (const technician of availableTechnicians) {
      const score = await this.calculateTechnicianScore(technician.id, workOrder);
      
      if (score > bestScore) {
        bestScore = score;
        bestTechnician = technician;
      }
    }

    // 分配工单
    workOrder.assigned_user_id = bestTechnician.id;
    workOrder.status = 'assigned';
    workOrder.updated_at = new Date();
    
    await this.workOrdersRepository.save(workOrder);

    // 发送分配通知
    try {
      await this.notificationService.sendWeChatNotification(
        bestTechnician,
        `新工单分配`,
        `工单 "${workOrder.title}" 已分配给您，请及时处理。`
      );
    } catch (error) {
      this.logger.error(`Failed to send assignment notification: ${error.message}`);
    }

    return {
      workOrderId,
      userId: bestTechnician.id,
      assignedAt: new Date(),
      assignmentReason: `Auto-assigned based on technician expertise and workload (score: ${bestScore.toFixed(2)})`
    };
  }

  /**
   * 计算技术员评分
   */
  private async calculateTechnicianScore(technicianId: number, workOrder: WorkOrder): Promise<number> {
    let score = 0;

    // 1. 专业技能匹配度 (0-30分)
    const techSkills = await this.getUserSkills(technicianId);
    const deviceType = workOrder.device?.device_type || 'general';
    
    if (techSkills.includes(deviceType) || techSkills.includes('all')) {
      score += 30;
    } else if (techSkills.some(skill => deviceType.includes(skill))) {
      score += 20;
    } else {
      score += 10; // 基础分
    }

    // 2. 当前工作负载 (0-25分)
    const currentWorkload = await this.getCurrentWorkload(technicianId);
    if (currentWorkload < 2) {
      score += 25; // 负载较轻
    } else if (currentWorkload < 5) {
      score += 15; // 负载中等
    } else {
      score += 5; // 负载较重
    }

    // 3. 优先级匹配 (0-20分)
    if (workOrder.priority === 'urgent') {
      // 优先分配给空闲或负载较轻的技术员
      if (currentWorkload < 3) {
        score += 20;
      } else {
        score += 10;
      }
    } else if (workOrder.priority === 'high') {
      if (currentWorkload < 4) {
        score += 15;
      } else {
        score += 5;
      }
    } else {
      score += 10; // 一般优先级
    }

    // 4. 历史表现 (0-25分)
    const performanceScore = await this.getTechnicianPerformance(technicianId);
    score += performanceScore;

    return score;
  }

  /**
   * 获取用户技能
   */
  private async getUserSkills(userId: number): Promise<string[]> {
    // 这里应该从用户技能表获取数据
    // 简化实现：返回模拟数据
    return ['general', 'mechanical', 'electrical'];
  }

  /**
   * 获取当前工作负载
   */
  private async getCurrentWorkload(technicianId: number): Promise<number> {
    const workload = await this.workOrdersRepository.count({
      where: {
        assigned_user_id: technicianId,
        status: 'in_progress'
      }
    });
    
    return workload;
  }

  /**
   * 获取技术员表现评分
   */
  private async getTechnicianPerformance(technicianId: number): Promise<number> {
    // 计算该技术员的历史完成工单的平均满意度
    const completedOrders = await this.workOrdersRepository.find({
      where: {
        assigned_user_id: technicianId,
        status: 'completed'
      },
      take: 20 // 最近20个工单
    });
    
    if (completedOrders.length === 0) {
      return 10; // 新手基础分
    }
    
    // 简化计算：基于完成时间是否在预期时间内
    let performanceScore = 0;
    for (const order of completedOrders) {
      if (order.actual_end_time && order.scheduled_date) {
        const scheduledDuration = new Date(order.scheduled_date).getTime() - new Date(order.created_at).getTime();
        const actualDuration = new Date(order.actual_end_time).getTime() - new Date(order.created_at).getTime();
        
        if (actualDuration <= scheduledDuration * 1.1) { // 在计划时间10%以内完成
          performanceScore += 1.5;
        } else if (actualDuration <= scheduledDuration * 1.3) { // 在计划时间30%以内完成
          performanceScore += 1;
        } else {
          performanceScore += 0.5; // 超时完成
        }
      }
    }
    
    return Math.min(25, Math.round(performanceScore / completedOrders.length * 25));
  }

  /**
   * 开始工单处理
   */
  async startWorkOrder(workOrderId: number, userId: number) {
    const workOrder = await this.workOrdersRepository.findOne({ where: { id: workOrderId } });
    
    if (!workOrder) {
      throw new Error(`Work order with id ${workOrderId} not found`);
    }

    if (workOrder.assigned_user_id !== userId) {
      throw new Error(`Work order ${workOrderId} is not assigned to user ${userId}`);
    }

    if (workOrder.status !== 'assigned' && workOrder.status !== 'pending') {
      throw new Error(`Cannot start work order with status: ${workOrder.status}`);
    }

    workOrder.status = 'in_progress';
    workOrder.actual_start_time = new Date();
    workOrder.updated_at = new Date();

    const updatedWorkOrder = await this.workOrdersRepository.save(workOrder);

    // 创建维护日志
    const maintenanceLog = new MaintenanceLog();
    maintenanceLog.device_id = workOrder.device_id;
    maintenanceLog.work_order_id = workOrder.id;
    maintenanceLog.technician_id = userId;
    maintenanceLog.maintenance_type = workOrder.order_type;
    maintenanceLog.start_time = workOrder.actual_start_time;
    maintenanceLog.description = `开始处理工单: ${workOrder.title}`;

    await this.maintenanceLogsRepository.save(maintenanceLog);

    return updatedWorkOrder;
  }

  /**
   * 完成工单
   */
  async completeWorkOrder(completionData: WorkOrderCompletion) {
    const { workOrderId, completionData: data } = completionData;
    
    const workOrder = await this.workOrdersRepository.findOne({ 
      where: { id: workOrderId },
      relations: ['device']
    });
    
    if (!workOrder) {
      throw new Error(`Work order with id ${workOrderId} not found`);
    }

    if (workOrder.status !== 'in_progress') {
      throw new Error(`Work order ${workOrderId} is not in progress`);
    }

    // 更新工单状态和时间
    workOrder.status = data.status === 'completed' ? 'completed' : 'pending_review';
    workOrder.actual_end_time = data.endTime;
    workOrder.updated_at = new Date();

    const updatedWorkOrder = await this.workOrdersRepository.save(workOrder);

    // 创建维护日志
    const maintenanceLog = new MaintenanceLog();
    maintenanceLog.device_id = workOrder.device_id;
    maintenanceLog.work_order_id = workOrder.id;
    maintenanceLog.technician_id = data.technicianId;
    maintenanceLog.maintenance_type = workOrder.order_type;
    maintenanceLog.start_time = data.startTime;
    maintenanceLog.end_time = data.endTime;
    maintenanceLog.description = data.maintenanceNotes;
    maintenanceLog.parts_replaced = JSON.stringify(data.materialsUsed.map(m => ({
      materialId: m.materialId,
      quantity: m.quantityUsed
    })));

    await this.maintenanceLogsRepository.save(maintenanceLog);

    // 更新物料使用情况
    for (const material of data.materialsUsed) {
      await this.consumeMaterial(workOrderId, material);
    }

    // 更新设备健康度
    try {
      await this.deviceMonitoringService.getRealTimeStatus(workOrder.device_id);
    } catch (error) {
      this.logger.error(`Failed to update device status after work order completion: ${error.message}`);
    }

    // 发送完成通知
    try {
      const technician = await this.usersRepository.findOne({ where: { id: data.technicianId } });
      const device = await this.devicesRepository.findOne({ where: { id: workOrder.device_id } });
      
      if (technician && device) {
        await this.notificationService.sendWeChatNotification(
          technician,
          `工单完成 - ${device.name}`,
          `工单 "${workOrder.title}" 已完成，感谢您的工作！`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send completion notification: ${error.message}`);
    }

    return updatedWorkOrder;
  }

  /**
   * 消耗物料
   */
  private async consumeMaterial(workOrderId: number, materialData: any) {
    // 创建工单物料关联记录
    const workOrderMaterial = new WorkOrderMaterial();
    workOrderMaterial.work_order_id = workOrderId;
    workOrderMaterial.material_id = materialData.materialId;
    workOrderMaterial.quantity_used = materialData.quantityUsed;
    workOrderMaterial.cost = materialData.cost;
    
    await this.workOrderMaterialsRepository.save(workOrderMaterial);

    // 更新库存
    const material = await this.materialsRepository.findOne({ 
      where: { id: materialData.materialId } 
    });
    
    if (material) {
      const newStock = Math.max(0, (material.current_stock || 0) - materialData.quantityUsed);
      material.current_stock = newStock;
      await this.materialsRepository.save(material);

      // 检查是否库存不足
      if (newStock < (material.min_stock || 0)) {
        this.logger.warn(`Material ${material.name} stock is low: ${newStock}`);
        // 可以触发补货通知
      }
    }
  }

  /**
   * 获取工单统计
   */
  async getWorkOrderStatistics(tenantId: number, daysBack: number = 30): Promise<WorkOrderMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 基础统计
    const total = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .getCount();

    const open = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status IN (:...statuses)', { statuses: ['pending', 'assigned', 'in_progress'] })
      .getCount();

    const inProgress = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status = :status', { status: 'in_progress' })
      .getCount();

    const completed = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status = :status', { status: 'completed' })
      .getCount();

    // 计算逾期工单
    const overdue = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status IN (:...statuses)', { statuses: ['pending', 'assigned', 'in_progress'] })
      .andWhere('work_order.scheduled_date < :now', { now: new Date() })
      .getCount();

    // 计算平均完成时间
    const avgCompletionTimeResult = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select('AVG(EXTRACT(EPOCH FROM (work_order.actual_end_time - work_order.actual_start_time)) / 3600)', 'avg_hours')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status = :status', { status: 'completed' })
      .andWhere('work_order.actual_start_time IS NOT NULL')
      .andWhere('work_order.actual_end_time IS NOT NULL')
      .getRawOne();

    const avgCompletionTime = avgCompletionTimeResult?.avg_hours ? parseFloat(avgCompletionTimeResult.avg_hours) : 0;

    // 计算效率比率（完成率）
    const efficiencyRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      open,
      inProgress,
      completed,
      overdue,
      averageCompletionTime: parseFloat(avgCompletionTime.toFixed(2)),
      efficiencyRate: parseFloat(efficiencyRate.toFixed(2))
    };
  }

  /**
   * 获取工单趋势
   */
  async getWorkOrderTrends(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const trends = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        "DATE(work_order.created_at) as date",
        "COUNT(*) as total",
        "COUNT(CASE WHEN work_order.status = 'completed' THEN 1 END) as completed",
        "COUNT(CASE WHEN work_order.status = 'in_progress' THEN 1 END) as in_progress",
        "COUNT(CASE WHEN work_order.priority = 'urgent' THEN 1 END) as urgent",
        "COUNT(CASE WHEN work_order.priority = 'high' THEN 1 END) as high"
      ])
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('DATE(work_order.created_at)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return trends.map(trend => ({
      date: trend.date,
      total: parseInt(trend.total),
      completed: parseInt(trend.completed),
      inProgress: parseInt(trend.in_progress),
      urgent: parseInt(trend.urgent),
      high: parseInt(trend.high)
    }));
  }

  /**
   * 获取技术人员绩效
   */
  async getTechnicianPerformanceMetrics(userId: number) {
    const completedOrders = await this.workOrdersRepository.find({
      where: {
        assigned_user_id: userId,
        status: 'completed'
      },
      order: {
        actual_end_time: 'DESC'
      },
      take: 50 // 最近50个工单
    });

    if (completedOrders.length === 0) {
      return {
        userId,
        totalCompleted: 0,
        averageCompletionTime: 0,
        onTimeRate: 0,
        satisfactionRating: 0
      };
    }

    // 计算平均完成时间
    let totalCompletionTime = 0;
    let onTimeCount = 0;
    
    for (const order of completedOrders) {
      if (order.actual_start_time && order.actual_end_time) {
        const completionTime = (order.actual_end_time.getTime() - order.actual_start_time.getTime()) / (1000 * 60 * 60); // 小时
        totalCompletionTime += completionTime;
        
        // 检查是否按时完成
        if (order.scheduled_date && order.actual_end_time <= order.scheduled_date) {
          onTimeCount++;
        }
      }
    }

    const avgTime = totalCompletionTime / completedOrders.length;
    const onTimeRate = (onTimeCount / completedOrders.length) * 100;

    return {
      userId,
      totalCompleted: completedOrders.length,
      averageCompletionTime: parseFloat(avgTime.toFixed(2)),
      onTimeRate: parseFloat(onTimeRate.toFixed(2)),
      satisfactionRating: 4.2 + Math.random() * 0.8 // 模拟满意度评分
    };
  }

  /**
   * 生成维护报告
   */
  async generateMaintenanceReport(deviceId: number, startDate: Date, endDate: Date) {
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new Error(`Device with id ${deviceId} not found`);
    }

    // 获取期间的工单
    const workOrders = await this.workOrdersRepository.find({
      where: {
        device_id: deviceId,
        created_at: Between(startDate, endDate)
      },
      relations: ['assigned_user', 'created_user']
    });

    // 获取维护日志
    const maintenanceLogs = await this.maintenanceLogsRepository.find({
      where: {
        device_id: deviceId,
        created_at: Between(startDate, endDate)
      },
      relations: ['technician']
    });

    // 获取使用的物料
    const materialsUsed = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wom.material', 'material')
      .select([
        'material.name as material_name',
        'material.unit as unit',
        'SUM(wom.quantity_used) as total_quantity',
        'SUM(wom.cost) as total_cost'
      ])
      .where('wo.device_id = :deviceId', { deviceId })
      .andWhere('wo.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy('material.name, material.unit')
      .getRawMany();

    // 计算设备可用性
    const downtimeHours = await this.calculateDowntime(deviceId, startDate, endDate);

    return {
      deviceInfo: {
        id: device.id,
        name: device.name,
        type: device.device_type,
        manufacturer: device.manufacturer,
        model: device.model
      },
      reportPeriod: {
        startDate,
        endDate
      },
      workOrderSummary: {
        total: workOrders.length,
        completed: workOrders.filter(wo => wo.status === 'completed').length,
        byType: this.groupBy(workOrders, 'order_type'),
        byPriority: this.groupBy(workOrders, 'priority')
      },
      maintenanceActivity: {
        totalLogs: maintenanceLogs.length,
        byTechnician: this.groupBy(maintenanceLogs, 'technician.username'),
        averageDuration: this.calculateAverageDuration(maintenanceLogs)
      },
      materialsConsumed: materialsUsed,
      costAnalysis: {
        totalMaterialCost: materialsUsed.reduce((sum, item) => sum + parseFloat(item.total_cost || '0'), 0),
        totalLaborCost: workOrders.length * 80 // 假设每工单80元人工成本
      },
      equipmentMetrics: {
        uptimeHours: 24 * this.calculateDaysDifference(endDate, startDate) - downtimeHours,
        downtimeHours,
        availabilityRate: 100 - (downtimeHours / (24 * this.calculateDaysDifference(endDate, startDate)) * 100)
      }
    };
  }

  /**
   * 计算停机时间
   */
  private async calculateDowntime(deviceId: number, startDate: Date, endDate: Date): Promise<number> {
    // 这里应该根据工单的实际开始/结束时间来计算设备停机时间
    // 简化实现：返回模拟值
    return 2.5; // 2.5小时
  }

  /**
   * 按字段分组
   */
  private groupBy(array: any[], key: string): any {
    return array.reduce((result, item) => {
      const keyValue = this.getNestedValue(item, key);
      if (!result[keyValue]) {
        result[keyValue] = 0;
      }
      result[keyValue]++;
      return result;
    }, {});
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 计算平均持续时间
   */
  private calculateAverageDuration(logs: any[]): number {
    if (logs.length === 0) return 0;
    
    const durations = logs
      .filter(log => log.start_time && log.end_time)
      .map(log => (new Date(log.end_time).getTime() - new Date(log.start_time).getTime()) / (1000 * 60 * 60)); // 小时
    
    if (durations.length === 0) return 0;
    
    const avg = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    return parseFloat(avg.toFixed(2));
  }

  /**
   * 计算日期差
   */
  private calculateDaysDifference(date1: Date, date2: Date): number {
    const timeDiff = Math.abs(date1.getTime() - date2.getTime());
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  /**
   * 批量处理工单
   */
  async batchProcessWorkOrders(workOrderIds: number[], action: 'start' | 'complete' | 'cancel', userId: number) {
    const results = [];
    
    for (const workOrderId of workOrderIds) {
      try {
        let result;
        
        switch (action) {
          case 'start':
            result = await this.startWorkOrder(workOrderId, userId);
            break;
          case 'complete':
            // 完成操作需要更多数据，这里简化处理
            result = await this.workOrdersRepository.update(workOrderId, { 
              status: 'completed',
              actual_end_time: new Date(),
              updated_at: new Date()
            });
            result = await this.workOrdersRepository.findOne({ where: { id: workOrderId } });
            break;
          case 'cancel':
            result = await this.workOrdersRepository.update(workOrderId, { 
              status: 'cancelled',
              updated_at: new Date()
            });
            result = await this.workOrdersRepository.findOne({ where: { id: workOrderId } });
            break;
          default:
            throw new Error(`Invalid action: ${action}`);
        }
        
        results.push({
          workOrderId,
          success: true,
          action,
          result
        });
      } catch (error) {
        results.push({
          workOrderId,
          success: false,
          action,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 优先级排序工单
   */
  async prioritizeWorkOrders(tenantId: number): Promise<WorkOrder[]> {
    // 获取所有待处理的工单
    const workOrders = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .leftJoin('work_order.assigned_user', 'assigned_user')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status IN (:...statuses)', { statuses: ['pending', 'assigned'] })
      .getMany();

    // 根据多个因素计算优先级分数
    const prioritizedOrders = workOrders.map(order => {
      let score = 0;
      
      // 优先级权重
      switch (order.priority) {
        case 'urgent': score += 100; break;
        case 'high': score += 70; break;
        case 'medium': score += 40; break;
        case 'low': score += 10; break;
      }
      
      // 设备重要性
      if (order.device?.device_type === 'critical') score += 50;
      
      // 截止日期临近度
      if (order.scheduled_date) {
        const daysUntilDue = (new Date(order.scheduled_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilDue <= 1) score += 60;
        else if (daysUntilDue <= 3) score += 40;
        else if (daysUntilDue <= 7) score += 20;
      }
      
      // 等待时间
      const daysWaiting = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysWaiting > 7) score += 30;
      else if (daysWaiting > 2) score += 15;
      
      // 预测性维护关联
      if (order.description?.toLowerCase().includes('predictive')) score += 25;
      
      return { ...order, priorityScore: score };
    });
    
    // 按优先级分数降序排列
    return prioritizedOrders.sort((a, b) => b.priorityScore - a.priorityScore).map(({ priorityScore, ...order }) => order);
  }
}