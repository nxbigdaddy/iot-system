import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { MaintenanceLog } from '../maintenance-logs/entities/maintenance-log.entity';
import { WorkOrderMaterial } from '../work-order-materials/entities/work-order-material.entity';
import { Material } from '../materials/entities/material.entity';
import { NotificationService } from '../notifications/notifications.service';
import { PredictiveMaintenanceService } from '../predictive-maintenance/predictive-maintenance.service';

@Injectable()
export class WorkOrdersService {
  private logger = new Logger(WorkOrdersService.name);

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
    private predictiveMaintenanceService: PredictiveMaintenanceService,
  ) {}

  // 获取工单列表
  async findAll(tenantId: number, filters: {
    status?: string;
    priority?: string;
    deviceId?: number;
    assignedUserId?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}) {
    const queryBuilder = this.workOrdersRepository.createQueryBuilder('work_order')
      .leftJoinAndSelect('work_order.device', 'device')
      .leftJoinAndSelect('work_order.assigned_user', 'assigned_user')
      .leftJoinAndSelect('work_order.created_user', 'created_user')
      .where('work_order.tenant_id = :tenantId', { tenantId });

    if (filters.status) {
      queryBuilder.andWhere('work_order.status = :status', { status: filters.status });
    }
    
    if (filters.priority) {
      queryBuilder.andWhere('work_order.priority = :priority', { priority: filters.priority });
    }
    
    if (filters.deviceId) {
      queryBuilder.andWhere('work_order.device_id = :deviceId', { deviceId: filters.deviceId });
    }
    
    if (filters.assignedUserId) {
      queryBuilder.andWhere('work_order.assigned_user_id = :assignedUserId', { assignedUserId: filters.assignedUserId });
    }
    
    if (filters.dateFrom) {
      queryBuilder.andWhere('work_order.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    
    if (filters.dateTo) {
      queryBuilder.andWhere('work_order.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    queryBuilder.orderBy('work_order.created_at', 'DESC');

    return await queryBuilder.getMany();
  }

  // 获取单个工单
  async findOne(id: number, tenantId: number) {
    return this.workOrdersRepository.createQueryBuilder('work_order')
      .leftJoinAndSelect('work_order.device', 'device')
      .leftJoinAndSelect('work_order.assigned_user', 'assigned_user')
      .leftJoinAndSelect('work_order.created_user', 'created_user')
      .leftJoinAndSelect('work_order.maintenance_logs', 'maintenance_logs')
      .where('work_order.id = :id', { id })
      .andWhere('work_order.tenant_id = :tenantId', { tenantId })
      .getOne();
  }

  // 创建工单
  async create(workOrderData: Partial<WorkOrder>) {
    const device = await this.devicesRepository.findOne({ 
      where: { id: workOrderData.device_id } 
    });
    
    if (!device) {
      throw new Error('Device not found');
    }

    // 如果指定了负责人，验证用户是否存在
    if (workOrderData.assigned_user_id) {
      const user = await this.usersRepository.findOne({ 
        where: { id: workOrderData.assigned_user_id } 
      });
      
      if (!user) {
        throw new Error('Assigned user not found');
      }
    }

    const workOrder = this.workOrdersRepository.create(workOrderData);
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
        } catch (error) {
          this.logger.error(`Failed to send notification: ${error.message}`);
        }
      }
    }

    return savedWorkOrder;
  }

  // 更新工单状态
  async updateStatus(id: number, status: string, userId: number) {
    const workOrder = await this.workOrdersRepository.findOne({ where: { id } });
    
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    // 验证状态转换是否有效
    const validTransitions = {
      'pending': ['assigned', 'cancelled'],
      'assigned': ['in_progress', 'pending', 'cancelled'],
      'in_progress': ['completed', 'pending', 'assigned'],
      'completed': ['closed'],
      'cancelled': [],
      'closed': []
    };

    if (!validTransitions[workOrder.status]?.includes(status)) {
      throw new Error(`Invalid status transition: ${workOrder.status} -> ${status}`);
    }

    // 如果是开始处理，记录开始时间
    if (status === 'in_progress' && !workOrder.actual_start_time) {
      workOrder.actual_start_time = new Date();
    }
    
    // 如果是完成，记录结束时间
    if (status === 'completed' && !workOrder.actual_end_time) {
      workOrder.actual_end_time = new Date();
    }

    workOrder.status = status;
    workOrder.updated_at = new Date();

    const updatedWorkOrder = await this.workOrdersRepository.save(workOrder);

    // 发送状态变更通知
    await this.notifyStatusChange(updatedWorkOrder);

    return updatedWorkOrder;
  }

  // 分配工单给用户
  async assignToUser(workOrderId: number, userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const workOrder = await this.workOrdersRepository.findOne({ where: { id: workOrderId } });
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    workOrder.assigned_user_id = userId;
    workOrder.status = 'assigned';
    workOrder.updated_at = new Date();

    const updatedWorkOrder = await this.workOrdersRepository.save(workOrder);

    // 发送分配通知
    try {
      await this.notificationService.sendWeChatNotification(
        user,
        `新工单分配`,
        `工单 "${workOrder.title}" 已分配给您，请及时处理。`
      );
    } catch (error) {
      this.logger.error(`Failed to send assignment notification: ${error.message}`);
    }

    return updatedWorkOrder;
  }

  // 添加工单材料
  async addMaterials(workOrderId: number, materials: Array<{materialId: number, quantity: number}>) {
    const workOrder = await this.workOrdersRepository.findOne({ where: { id: workOrderId } });
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    const results = [];

    for (const item of materials) {
      const material = await this.materialsRepository.findOne({ 
        where: { id: item.materialId, tenant_id: workOrder.tenant_id } 
      });
      
      if (!material) {
        results.push({ 
          material_id: item.materialId, 
          success: false, 
          error: 'Material not found or unauthorized' 
        });
        continue;
      }

      // 检查库存是否充足
      if ((material.current_stock || 0) < item.quantity) {
        results.push({ 
          material_id: item.materialId, 
          success: false, 
          error: `Insufficient stock. Available: ${material.current_stock}, Required: ${item.quantity}` 
        });
        continue;
      }

      // 创建工单材料关联记录
      const workOrderMaterial = new WorkOrderMaterial();
      workOrderMaterial.work_order_id = workOrderId;
      workOrderMaterial.material_id = item.materialId;
      workOrderMaterial.quantity_used = item.quantity;
      
      await this.workOrderMaterialsRepository.save(workOrderMaterial);

      // 更新库存
      await this.materialsRepository.update(item.materialId, {
        current_stock: (material.current_stock || 0) - item.quantity
      });

      // 同步到ERP
      try {
        // 实现ERP库存同步逻辑
      } catch (error) {
        this.logger.error(`Failed to sync stock to ERP: ${error.message}`);
      }

      results.push({ 
        material_id: item.materialId, 
        success: true, 
        quantity_used: item.quantity 
      });
    }

    return results;
  }

  // 获取工单统计信息
  async getWorkOrderStats(tenantId: number) {
    const totalOrders = await this.workOrdersRepository.count({ where: { tenant_id: tenantId } });
    const pendingOrders = await this.workOrdersRepository.count({ 
      where: { tenant_id: tenantId, status: 'pending' } 
    });
    const inProgressOrders = await this.workOrdersRepository.count({ 
      where: { tenant_id: tenantId, status: 'in_progress' } 
    });
    const completedOrders = await this.workOrdersRepository.count({ 
      where: { tenant_id: tenantId, status: 'completed' } 
    });

    // 平均处理时间（仅针对已完成工单）
    const completedWorkOrders = await this.workOrdersRepository.find({
      where: { tenant_id: tenantId, status: 'completed' },
      select: ['actual_start_time', 'actual_end_time']
    });

    let avgProcessingTime = 0;
    if (completedWorkOrders.length > 0) {
      const totalTime = completedWorkOrders.reduce((sum, order) => {
        if (order.actual_start_time && order.actual_end_time) {
          return sum + (new Date(order.actual_end_time).getTime() - new Date(order.actual_start_time).getTime());
        }
        return sum;
      }, 0);
      
      avgProcessingTime = totalTime / completedWorkOrders.length / (1000 * 60 * 60); // 转换为小时
    }

    return {
      total: totalOrders,
      pending: pendingOrders,
      in_progress: inProgressOrders,
      completed: completedOrders,
      average_processing_time_hours: parseFloat(avgProcessingTime.toFixed(2)),
      completion_rate: totalOrders > 0 ? parseFloat(((completedOrders / totalOrders) * 100).toFixed(2)) : 0
    };
  }

  // 生成维护日志
  async createMaintenanceLog(logData: Partial<MaintenanceLog>) {
    const workOrder = await this.workOrdersRepository.findOne({ 
      where: { id: logData.work_order_id } 
    });
    
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    const device = await this.devicesRepository.findOne({ 
      where: { id: logData.device_id } 
    });
    
    if (!device) {
      throw new Error('Device not found');
    }

    const technician = await this.usersRepository.findOne({ 
      where: { id: logData.technician_id } 
    });
    
    if (!technician) {
      throw new Error('Technician not found');
    }

    const log = this.maintenanceLogsRepository.create({
      ...logData,
      start_time: logData.start_time || new Date(),
      end_time: logData.end_time || new Date()
    });

    const savedLog = await this.maintenanceLogsRepository.save(log);

    // 更新设备健康度
    try {
      await this.predictiveMaintenanceService.calculateDeviceHealth(device.id);
    } catch (error) {
      this.logger.error(`Failed to update device health: ${error.message}`);
    }

    return savedLog;
  }

  // 获取工单相关的维护日志
  async getMaintenanceLogs(workOrderId: number) {
    return this.maintenanceLogsRepository.createQueryBuilder('log')
      .leftJoinAndSelect('log.technician', 'technician')
      .leftJoinAndSelect('log.work_order', 'work_order')
      .where('log.work_order_id = :workOrderId', { workOrderId })
      .orderBy('log.created_at', 'DESC')
      .getMany();
  }

  // 通知状态变更
  private async notifyStatusChange(workOrder: WorkOrder) {
    const device = await this.devicesRepository.findOne({ 
      where: { id: workOrder.device_id } 
    });
    
    if (!device) return;

    if (workOrder.assigned_user_id) {
      const assignedUser = await this.usersRepository.findOne({ 
        where: { id: workOrder.assigned_user_id } 
      });
      
      if (assignedUser) {
        try {
          await this.notificationService.sendEmailNotification(
            assignedUser.email,
            `工单状态变更 - ${device.name}`,
            `工单 "${workOrder.title}" 的状态已变更为 ${workOrder.status}。\n\n` +
            `设备：${device.name}\n` +
            `状态：${workOrder.status}\n` +
            `更新时间：${new Date().toLocaleString()}`
          );
        } catch (error) {
          this.logger.error(`Failed to send status change notification: ${error.message}`);
        }
      }
    }
  }
}