import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Material } from './entities/material.entity';
import { WorkOrderMaterial } from '../work-order-materials/entities/work-order-material.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { ERPIntegrationService } from './erp-integration.service';

export interface InventoryTransaction {
  id?: number;
  materialId: number;
  type: 'in' | 'out' | 'adjustment'; // 入库、出库、调整
  quantity: number;
  unitCost: number;
  totalCost: number;
  orderId?: number; // 关联工单ID
  projectId?: number; // 关联项目ID
  notes: string;
  userId: number;
  createdAt: Date;
}

export interface StockLevelAlert {
  materialId: number;
  materialName: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  status: 'normal' | 'warning' | 'critical'; // 正常、警告、严重
}

export interface MaterialRequisition {
  id?: number;
  materialId: number;
  quantityRequired: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reason: string;
  requestedBy: number;
  approvedBy?: number;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
  requestedAt: Date;
  fulfilledAt?: Date;
}

@Injectable()
export class AdvancedMaterialsService {
  private logger = new Logger(AdvancedMaterialsService.name);

  constructor(
    @InjectRepository(Material)
    private materialsRepository: Repository<Material>,
    @InjectRepository(WorkOrderMaterial)
    private workOrderMaterialsRepository: Repository<WorkOrderMaterial>,
    @InjectRepository(WorkOrder)
    private workOrdersRepository: Repository<WorkOrder>,
    private erpIntegrationService: ERPIntegrationService,
  ) {}

  /**
   * 创建物料
   */
  async createMaterial(materialData: Partial<Material>) {
    const material = this.materialsRepository.create({
      ...materialData,
      current_stock: materialData.current_stock || 0,
      min_stock: materialData.min_stock || 0,
      max_stock: materialData.max_stock || 1000,
      status: materialData.status || 'active',
      created_at: new Date(),
      updated_at: new Date()
    });

    const savedMaterial = await this.materialsRepository.save(material);

    // 同步到ERP系统
    try {
      await this.erpIntegrationService.syncMaterialToERP(savedMaterial);
    } catch (error) {
      this.logger.error(`Failed to sync material to ERP: ${error.message}`);
      // 记录错误但不影响本地创建
    }

    return savedMaterial;
  }

  /**
   * 更新库存
   */
  async updateStock(
    materialId: number, 
    quantity: number, 
    transactionType: 'in' | 'out' | 'adjustment',
    userId: number,
    orderId?: number,
    notes: string = 'Inventory update'
  ) {
    const material = await this.materialsRepository.findOne({ where: { id: materialId } });
    if (!material) {
      throw new Error(`Material with id ${materialId} not found`);
    }

    // 计算新库存量
    let newQuantity: number;
    switch (transactionType) {
      case 'in':
        newQuantity = (material.current_stock || 0) + quantity;
        break;
      case 'out':
        newQuantity = Math.max(0, (material.current_stock || 0) - quantity);
        break;
      case 'adjustment':
        newQuantity = quantity;
        break;
      default:
        throw new Error(`Invalid transaction type: ${transactionType}`);
    }

    // 更新物料库存
    material.current_stock = newQuantity;
    material.updated_at = new Date();

    // 检查是否低于最小库存
    if (newQuantity < (material.min_stock || 0)) {
      this.logger.warn(`Material ${material.name} stock is low: ${newQuantity}`);
    }

    const updatedMaterial = await this.materialsRepository.save(material);

    // 创建库存交易记录
    const transaction: InventoryTransaction = {
      materialId,
      type: transactionType,
      quantity,
      unitCost: material.unit_price || 0,
      totalCost: (material.unit_price || 0) * quantity,
      orderId,
      notes,
      userId,
      createdAt: new Date()
    };

    // 同步到ERP系统
    try {
      await this.erpIntegrationService.updateStockInERP(materialId, newQuantity);
    } catch (error) {
      this.logger.error(`Failed to update stock in ERP: ${error.message}`);
    }

    return { material: updatedMaterial, transaction };
  }

  /**
   * 批量更新库存
   */
  async batchUpdateStock(updates: Array<{
    materialId: number;
    quantity: number;
    transactionType: 'in' | 'out' | 'adjustment';
    userId: number;
    orderId?: number;
    notes?: string;
  }>) {
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateStock(
          update.materialId,
          update.quantity,
          update.transactionType,
          update.userId,
          update.orderId,
          update.notes || 'Batch update'
        );
        
        results.push({ 
          materialId: update.materialId, 
          success: true, 
          newStock: result.material.current_stock,
          transaction: result.transaction
        });
      } catch (error) {
        results.push({ 
          materialId: update.materialId, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * 获取库存交易历史
   */
  async getInventoryTransactions(
    materialId: number, 
    startDate?: Date, 
    endDate?: Date,
    limit: number = 100
  ) {
    // 这里应该有一个库存交易记录表，我们简化实现
    // 实际应用中需要创建专门的交易记录实体
    const query = this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .leftJoin('wom.work_order', 'work_order')
      .select([
        'wom.created_at as date',
        'material.name as material_name',
        'wom.quantity_used as quantity',
        'material.unit_price as unit_price',
        'wom.cost as total_cost',
        'work_order.title as work_order_title',
        '"out" as transaction_type'
      ])
      .where('material.id = :materialId', { materialId });

    if (startDate && endDate) {
      query.andWhere('wom.created_at BETWEEN :start AND :end', { start: startDate, end: endDate });
    }

    query.orderBy('wom.created_at', 'DESC').limit(limit);

    return await query.getRawMany();
  }

  /**
   * 获取库存预警
   */
  async getStockLevelAlerts(): Promise<StockLevelAlert[]> {
    const materials = await this.materialsRepository.find({
      where: {
        status: 'active'
      }
    });

    const alerts: StockLevelAlert[] = [];

    for (const material of materials) {
      const currentStock = material.current_stock || 0;
      const minStock = material.min_stock || 0;
      const maxStock = material.max_stock || 1000;

      let status: 'normal' | 'warning' | 'critical' = 'normal';

      if (currentStock === 0) {
        status = 'critical';
      } else if (currentStock <= minStock) {
        status = 'warning';
      } else if (currentStock <= minStock * 2) {
        status = 'normal'; // 但仍需关注
      }

      if (status !== 'normal' || currentStock === 0) {
        alerts.push({
          materialId: material.id,
          materialName: material.name,
          currentStock,
          minStock,
          maxStock,
          status
        });
      }
    }

    return alerts;
  }

  /**
   * 生成补货建议
   */
  async generateReplenishmentSuggestions() {
    const materials = await this.materialsRepository.find({
      where: { status: 'active' }
    });

    const suggestions = [];

    for (const material of materials) {
      const currentStock = material.current_stock || 0;
      const minStock = material.min_stock || 0;
      const maxStock = material.max_stock || 1000;

      // 如果库存低于最小值，建议补货到最大值
      if (currentStock < minStock) {
        const quantityToOrder = maxStock - currentStock;
        
        suggestions.push({
          materialId: material.id,
          materialName: material.name,
          currentStock,
          minStock,
          maxStock,
          suggestedOrderQuantity: quantityToOrder,
          priority: currentStock === 0 ? 'urgent' : 'high',
          estimatedCost: quantityToOrder * (material.unit_price || 0)
        });
      }
    }

    return suggestions;
  }

  /**
   * 创建物料申请
   */
  async createRequisition(requisitionData: Omit<MaterialRequisition, 'id' | 'status' | 'requestedAt'>): Promise<MaterialRequisition> {
    const material = await this.materialsRepository.findOne({ where: { id: requisitionData.materialId } });
    if (!material) {
      throw new Error(`Material with id ${requisitionData.materialId} not found`);
    }

    const requisition: MaterialRequisition = {
      ...requisitionData,
      id: Date.now(), // 实际应用中应该是数据库自增ID
      status: 'pending',
      requestedAt: new Date()
    };

    // 这里应该保存到专门的申请表
    // 简化实现，返回对象
    this.logger.log(`Created material requisition for material ${requisition.materialId}`);

    return requisition;
  }

  /**
   * 审批物料申请
   */
  async approveRequisition(requisitionId: number, approvedBy: number) {
    // 实际应用中，这里会更新申请表的状态
    // 简化实现，返回模拟结果
    this.logger.log(`Approved requisition ${requisitionId} by user ${approvedBy}`);

    return {
      requisitionId,
      approvedBy,
      approvedAt: new Date(),
      status: 'approved'
    };
  }

  /**
   * 获取物料使用统计
   */
  async getMaterialUsageStats(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 获取工单中使用的物料统计
    const usageStats = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'material.id as material_id',
        'material.name as material_name',
        'material.unit as unit',
        'SUM(wom.quantity_used) as total_used',
        'AVG(wom.cost) as avg_cost_per_unit',
        'COUNT(DISTINCT wo.id) as used_in_orders',
        'MIN(wo.created_at) as first_used',
        'MAX(wo.created_at) as last_used'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('wom.created_at >= :startDate', { startDate })
      .groupBy('material.id, material.name, material.unit')
      .orderBy('total_used', 'DESC')
      .getRawMany();

    // 计算库存周转率
    const turnoverRates = usageStats.map(stat => ({
      ...stat,
      inventoryTurnoverRate: (stat.total_used / ((stat.avg_cost_per_unit * stat.total_used) / 2)) // 简化的周转率计算
    }));

    return turnoverRates;
  }

  /**
   * 获取物料成本分析
   */
  async getMaterialCostAnalysis(tenantId: number, startDate: Date, endDate: Date) {
    const costData = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'material.category as category',
        'SUM(wom.quantity_used * wom.cost) as total_cost',
        'SUM(wom.quantity_used) as total_quantity',
        'AVG(wom.cost) as avg_unit_cost',
        'COUNT(DISTINCT wo.id) as work_orders_affected'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('wom.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy('material.category')
      .getRawMany();

    // 计算总成本和占比
    const totalCost = costData.reduce((sum, item) => sum + parseFloat(item.total_cost || '0'), 0);

    const detailedAnalysis = costData.map(item => ({
      ...item,
      percentageOfTotal: totalCost > 0 ? parseFloat(((parseFloat(item.total_cost) / totalCost) * 100).toFixed(2)) : 0
    }));

    return {
      period: { startDate, endDate },
      totalCost,
      categories: detailedAnalysis
    };
  }

  /**
   * 获取物料供应商分析
   */
  async getSupplierAnalysis(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const supplierData = await this.materialsRepository
      .createQueryBuilder('material')
      .leftJoin('material.used_in_work_orders', 'wom') // 假设有关系
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'material.supplier as supplier',
        'COUNT(material.id) as material_count',
        'SUM(material.current_stock * material.unit_price) as total_inventory_value',
        'AVG(material.unit_price) as avg_unit_price',
        'MIN(material.current_stock) as min_stock_level',
        'MAX(material.current_stock) as max_stock_level'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('material.created_at >= :startDate', { startDate })
      .groupBy('material.supplier')
      .getRawMany();

    return supplierData;
  }

  /**
   * 预测物料需求
   */
  async predictMaterialDemand(materialId: number, forecastDays: number = 90) {
    const material = await this.materialsRepository.findOne({ where: { id: materialId } });
    if (!material) {
      throw new Error(`Material with id ${materialId} not found`);
    }

    // 获取历史使用数据
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const historicalUsage = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .select([
        "DATE_TRUNC('day', wom.created_at) as date",
        'SUM(wom.quantity_used) as daily_usage'
      ])
      .where('material.id = :materialId', { materialId })
      .andWhere('wom.created_at >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', wom.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    if (historicalUsage.length === 0) {
      return {
        materialId,
        forecastDays,
        predictedUsage: 0,
        confidence: 0.3,
        recommendation: 'Insufficient historical data for accurate prediction'
      };
    }

    // 计算平均每日使用量
    const totalUsage = historicalUsage.reduce((sum, day) => sum + parseFloat(day.daily_usage || '0'), 0);
    const avgDailyUsage = totalUsage / historicalUsage.length;

    // 预测未来需求
    const predictedUsage = avgDailyUsage * forecastDays;

    // 计算置信度（基于数据点数量）
    const confidence = Math.min(0.95, 0.3 + (historicalUsage.length / 100));

    return {
      materialId,
      forecastDays,
      predictedUsage: parseFloat(predictedUsage.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      recommendation: predictedUsage > (material.current_stock || 0) ? 
        'Consider replenishing stock' : 'Current stock is sufficient'
    };
  }

  /**
   * 批量物料需求预测
   */
  async batchPredictMaterialDemand(materialIds: number[], forecastDays: number = 90) {
    const predictions = [];

    for (const materialId of materialIds) {
      try {
        const prediction = await this.predictMaterialDemand(materialId, forecastDays);
        predictions.push(prediction);
      } catch (error) {
        this.logger.error(`Error predicting demand for material ${materialId}: ${error.message}`);
        predictions.push({
          materialId,
          forecastDays,
          predictedUsage: 0,
          confidence: 0,
          recommendation: `Error: ${error.message}`
        });
      }
    }

    return predictions;
  }

  /**
   * 获取物料生命周期分析
   */
  async getMaterialLifecycleAnalysis(materialId: number) {
    const material = await this.materialsRepository.findOne({ where: { id: materialId } });
    if (!material) {
      throw new Error(`Material with id ${materialId} not found`);
    }

    // 获取首次使用时间
    const firstUsage = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .select('MIN(wom.created_at) as first_used')
      .where('material.id = :materialId', { materialId })
      .getRawOne();

    // 获取最后一次使用时间
    const lastUsage = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .select('MAX(wom.created_at) as last_used')
      .where('material.id = :materialId', { materialId })
      .getRawOne();

    // 计算总使用量
    const totalUsage = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .select('SUM(wom.quantity_used) as total_used')
      .where('material.id = :materialId', { materialId })
      .getRawOne();

    // 计算平均使用频率
    const usageFrequency = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .select([
        'COUNT(*) as total_transactions',
        "AVG(EXTRACT(EPOCH FROM (wom.created_at - LAG(wom.created_at) OVER (ORDER BY wom.created_at)))) as avg_interval_seconds"
      ])
      .where('material.id = :materialId', { materialId })
      .getRawOne();

    return {
      material: {
        id: material.id,
        name: material.name,
        category: material.category,
        unit: material.unit,
        unitPrice: material.unit_price
      },
      lifecycle: {
        firstUsed: firstUsage?.first_used,
        lastUsed: lastUsage?.last_used,
        totalUsed: parseFloat(totalUsage?.total_used || '0'),
        totalTransactions: parseInt(usageFrequency?.total_transactions || '0'),
        avgUsageIntervalDays: usageFrequency?.avg_interval_seconds ? 
          parseFloat((parseFloat(usageFrequency.avg_interval_seconds) / (24 * 3600)).toFixed(2)) : null
      }
    };
  }

  /**
   * 获取库存优化建议
   */
  async getInventoryOptimizationSuggestions(tenantId: number) {
    const materials = await this.materialsRepository.find({
      where: { status: 'active' }
    });

    const suggestions = [];
    const now = new Date();

    for (const material of materials) {
      const currentStock = material.current_stock || 0;
      const minStock = material.min_stock || 0;
      const maxStock = material.max_stock || 1000;
      
      // 计算库存周转天数
      const turnoverData = await this.workOrderMaterialsRepository
        .createQueryBuilder('wom')
        .leftJoin('wom.material', 'material')
        .leftJoin('wom.work_order', 'wo')
        .leftJoin('wo.device', 'device')
        .select([
          'SUM(wom.quantity_used) as total_used',
          'MIN(wom.created_at) as first_used',
          'MAX(wom.created_at) as last_used'
        ])
        .where('material.id = :materialId', { materialId: material.id })
        .getRawOne();

      let daysOfStockOnHand = Infinity;
      if (turnoverData?.total_used && turnoverData?.first_used && turnoverData?.last_used) {
        const daysInPeriod = (new Date(turnoverData.last_used).getTime() - new Date(turnoverData.first_used).getTime()) / (1000 * 60 * 60 * 24);
        const dailyUsageRate = parseFloat(turnoverData.total_used) / daysInPeriod;
        daysOfStockOnHand = currentStock / dailyUsageRate;
      }

      // 生成优化建议
      let recommendation = '';
      let priority: 'low' | 'medium' | 'high' = 'low';

      if (currentStock === 0) {
        recommendation = 'Critical shortage - Immediate reorder required';
        priority = 'high';
      } else if (currentStock < minStock) {
        recommendation = `Below minimum threshold - Reorder ${minStock * 2 - currentStock} units`;
        priority = 'high';
      } else if (daysOfStockOnHand > 180) {
        // 库存过多，超过6个月用量
        recommendation = 'Excess inventory - Consider reducing order quantities';
        priority = 'medium';
      } else if (daysOfStockOnHand < 7) {
        // 库存不足，少于1周用量
        recommendation = 'Low inventory - Consider increasing safety stock';
        priority = 'high';
      } else {
        recommendation = 'Optimal inventory level';
      }

      suggestions.push({
        materialId: material.id,
        materialName: material.name,
        currentStock,
        minStock,
        maxStock,
        daysOfStockOnHand: isNaN(daysOfStockOnHand) ? 0 : Math.round(daysOfStockOnHand),
        recommendation,
        priority
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}