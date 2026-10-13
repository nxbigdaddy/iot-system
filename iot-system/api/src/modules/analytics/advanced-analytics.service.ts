import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, Raw } from 'typeorm';
import { SensorData } from '../sensors/entities/sensor-data.entity';
import { Device } from '../devices/entities/device.entity';
import { Alarm } from '../alarms/entities/alarm.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { DeviceHealth } from '../device-health/entities/device-health.entity';
import { Material } from '../materials/entities/material.entity';
import { WorkOrderMaterial } from '../work-order-materials/entities/work-order-material.entity';
import { MaintenanceLog } from '../maintenance-logs/entities/maintenance-log.entity';
import { AdvancedPredictiveMaintenanceService } from '../predictive-maintenance/advanced-predictive-maintenance.service';

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  quality_score?: number;
  metadata?: any;
}

export interface AggregatedData {
  period: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  count: number;
  sumValue: number;
}

export interface KpiMetrics {
  availability: number; // 可用性 (%)
  reliability: number; // 可靠性 (%)
  performance: number; // 性能 (%)
  quality: number; // 质量 (%)
  oee: number; // 整体设备效率 (%)
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
  parameters: Record<string, any>;
  chartType: 'line' | 'bar' | 'pie' | 'table' | 'gauge' | 'heatmap';
}

@Injectable()
export class AdvancedAnalyticsService {
  private logger = new Logger(AdvancedAnalyticsService.name);

  constructor(
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(Alarm)
    private alarmsRepository: Repository<Alarm>,
    @InjectRepository(WorkOrder)
    private workOrdersRepository: Repository<WorkOrder>,
    @InjectRepository(DeviceHealth)
    private deviceHealthRepository: Repository<DeviceHealth>,
    @InjectRepository(Material)
    private materialsRepository: Repository<Material>,
    @InjectRepository(WorkOrderMaterial)
    private workOrderMaterialsRepository: Repository<WorkOrderMaterial>,
    @InjectRepository(MaintenanceLog)
    private maintenanceLogsRepository: Repository<MaintenanceLog>,
    private predictiveMaintenanceService: AdvancedPredictiveMaintenanceService,
  ) {}

  /**
   * 获取时间序列数据
   */
  async getTimeSeriesData(
    deviceId: number,
    dataType: string,
    startDate: Date,
    endDate: Date,
    aggregation: 'raw' | 'minute' | 'hour' | 'day' | 'week' | 'month' = 'raw'
  ): Promise<TimeSeriesDataPoint[]> {
    let query = this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .where('sensor_data.device_id = :deviceId', { deviceId })
      .andWhere('sensor_data.data_type = :dataType', { dataType })
      .andWhere('sensor_data.data_timestamp BETWEEN :start AND :end', { 
        start: startDate, 
        end: endDate 
      })
      .orderBy('sensor_data.data_timestamp', 'ASC');

    if (aggregation !== 'raw') {
      // 根据聚合级别调整查询
      switch (aggregation) {
        case 'minute':
          query.addSelect('DATE_TRUNC(\'minute\', sensor_data.data_timestamp)', 'time_bucket')
               .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
               .addSelect('MIN(sensor_data.processed_value)', 'min_value')
               .addSelect('MAX(sensor_data.processed_value)', 'max_value')
               .addSelect('COUNT(*)', 'count')
               .addSelect('STDDEV(sensor_data.processed_value)', 'std_dev')
               .groupBy('time_bucket')
               .orderBy('time_bucket', 'ASC');
          break;
        case 'hour':
          query.addSelect('DATE_TRUNC(\'hour\', sensor_data.data_timestamp)', 'time_bucket')
               .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
               .addSelect('MIN(sensor_data.processed_value)', 'min_value')
               .addSelect('MAX(sensor_data.processed_value)', 'max_value')
               .addSelect('COUNT(*)', 'count')
               .addSelect('STDDEV(sensor_data.processed_value)', 'std_dev')
               .groupBy('time_bucket')
               .orderBy('time_bucket', 'ASC');
          break;
        case 'day':
          query.addSelect('DATE_TRUNC(\'day\', sensor_data.data_timestamp)', 'time_bucket')
               .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
               .addSelect('MIN(sensor_data.processed_value)', 'min_value')
               .addSelect('MAX(sensor_data.processed_value)', 'max_value')
               .addSelect('COUNT(*)', 'count')
               .addSelect('STDDEV(sensor_data.processed_value)', 'std_dev')
               .groupBy('time_bucket')
               .orderBy('time_bucket', 'ASC');
          break;
        case 'week':
          query.addSelect('DATE_TRUNC(\'week\', sensor_data.data_timestamp)', 'time_bucket')
               .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
               .addSelect('MIN(sensor_data.processed_value)', 'min_value')
               .addSelect('MAX(sensor_data.processed_value)', 'max_value')
               .addSelect('COUNT(*)', 'count')
               .addSelect('STDDEV(sensor_data.processed_value)', 'std_dev')
               .groupBy('time_bucket')
               .orderBy('time_bucket', 'ASC');
          break;
        case 'month':
          query.addSelect('DATE_TRUNC(\'month\', sensor_data.data_timestamp)', 'time_bucket')
               .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
               .addSelect('MIN(sensor_data.processed_value)', 'min_value')
               .addSelect('MAX(sensor_data.processed_value)', 'max_value')
               .addSelect('COUNT(*)', 'count')
               .addSelect('STDDEV(sensor_data.processed_value)', 'std_dev')
               .groupBy('time_bucket')
               .orderBy('time_bucket', 'ASC');
          break;
      }
    }

    const results = await query.getRawMany();

    if (aggregation !== 'raw') {
      return results.map(result => ({
        timestamp: new Date(result.time_bucket),
        value: parseFloat(result.avg_value),
        metadata: {
          min: parseFloat(result.min_value),
          max: parseFloat(result.max_value),
          count: parseInt(result.count),
          stdDev: parseFloat(result.std_dev)
        }
      }));
    } else {
      return results.map(result => ({
        timestamp: result.sensor_data_data_timestamp,
        value: result.sensor_data_processed_value,
        quality_score: result.sensor_data_quality_score
      }));
    }
  }

  /**
   * 获取数据聚合统计
   */
  async getAggregatedData(
    deviceId: number,
    dataType: string,
    startDate: Date,
    endDate: Date,
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<AggregatedData[]> {
    const query = this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .select([
        `DATE_TRUNC('${period}', sensor_data.data_timestamp) as period`,
        'AVG(sensor_data.processed_value) as avg_value',
        'MIN(sensor_data.processed_value) as min_value',
        'MAX(sensor_data.processed_value) as max_value',
        'COUNT(*) as count',
        'SUM(sensor_data.processed_value) as sum_value'
      ])
      .where('sensor_data.device_id = :deviceId', { deviceId })
      .andWhere('sensor_data.data_type = :dataType', { dataType })
      .andWhere('sensor_data.data_timestamp BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy(`DATE_TRUNC('${period}', sensor_data.data_timestamp)`)
      .orderBy('period', 'ASC');

    const results = await query.getRawMany();

    return results.map(result => ({
      period: result.period,
      avgValue: parseFloat(result.avg_value),
      minValue: parseFloat(result.min_value),
      maxValue: parseFloat(result.max_value),
      count: parseInt(result.count),
      sumValue: parseFloat(result.sum_value)
    }));
  }

  /**
   * 计算KPI指标
   */
  async calculateKPIMetrics(deviceId: number, periodDays: number = 30): Promise<KpiMetrics> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // 计算可用性 (基于设备运行时间)
    const availability = await this.calculateAvailability(deviceId, startDate, endDate);

    // 计算可靠度 (基于故障率)
    const reliability = await this.calculateReliability(deviceId, startDate, endDate);

    // 计算性能 (基于运行效率)
    const performance = await this.calculatePerformance(deviceId, startDate, endDate);

    // 计算质量 (基于报警率)
    const quality = await this.calculateQuality(deviceId, startDate, endDate);

    // 计算整体设备效率 (OEE)
    const oee = (availability * reliability * performance) / 10000;

    return {
      availability: parseFloat(availability.toFixed(2)),
      reliability: parseFloat(reliability.toFixed(2)),
      performance: parseFloat(performance.toFixed(2)),
      quality: parseFloat(quality.toFixed(2)),
      oee: parseFloat(oee.toFixed(2))
    };
  }

  /**
   * 计算设备可用性
   */
  private async calculateAvailability(deviceId: number, startDate: Date, endDate: Date): Promise<number> {
    // 获取设备运行时间数据
    // 这化：假设我们有设备运行状态数据
    // 实际实现需要基于心跳或运行状态日志
    const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    
    // 假设设备正常运行时间为总时间的95%
    // 实际实现需要基于设备状态数据
    return 95.0;
  }

  /**
   * 计算设备可靠度
   */
  private async calculateReliability(deviceId: number, startDate: Date, endDate: Date): Promise<number> {
    // 获取故障次数（严重报警+设备停机）
    const criticalAlarms = await this.alarmsRepository.count({
      where: {
        device_id: deviceId,
        alert_level: 'critical',
        created_at: Between(startDate, endDate)
      }
    });

    // 假设每10个严重报警代表一次重大故障
    const majorFailures = Math.ceil(criticalAlarms / 10);

    // MTBF (平均故障间隔时间) = 总运行时间 / 故障次数
    const totalHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const mtbf = majorFailures > 0 ? totalHours / majorFailures : totalHours;

    // 可靠度 = exp(-t/MTBF)，其中t为观察时间
    const reliability = Math.exp(-totalHours / mtbf) * 100;

    return Math.max(0, Math.min(100, reliability));
  }

  /**
   * 计算设备性能
   */
  private async calculatePerformance(deviceId: number, startDate: Date, endDate: Date): Promise<number> {
    // 获取设备理论产出vs实际产出数据
    // 简化：基于传感器数据的变化频率来估算性能
    const sensorDataCount = await this.sensorDataRepository.count({
      where: {
        device_id: deviceId,
        data_timestamp: Between(startDate, endDate)
      }
    });

    // 假设理想状态下每分钟应产生2个数据点
    const idealDataPoints = (endDate.getTime() - startDate.getTime()) / (1000 * 60) * 2;
    
    const performance = (sensorDataCount / idealDataPoints) * 100;
    
    return Math.max(0, Math.min(100, performance));
  }

  /**
   * 计算设备质量
   */
  private async calculateQuality(deviceId: number, startDate: Date, endDate: Date): Promise<number> {
    // 基于报警率计算质量
    const totalAlarms = await this.alarmsRepository.count({
      where: {
        device_id: deviceId,
        created_at: Between(startDate, endDate)
      }
    });

    const criticalAlarms = await this.alarmsRepository.count({
      where: {
        device_id: deviceId,
        alert_level: 'critical',
        created_at: Between(startDate, endDate)
      }
    });

    // 质量 = 100 - (严重报警比例 * 100)
    const quality = totalAlarms > 0 ? 100 - ((criticalAlarms / totalAlarms) * 100) : 100;

    return Math.max(0, Math.min(100, quality));
  }

  /**
   * 获取设备健康度趋势
   */
  async getDeviceHealthTrend(deviceId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const healthRecords = await this.deviceHealthRepository.find({
      where: {
        device_id: deviceId,
        calculated_at: Between(startDate, new Date())
      },
      order: {
        calculated_at: 'ASC'
      }
    });

    return healthRecords.map(record => ({
      timestamp: record.calculated_at,
      healthScore: record.health_score,
      indicators: record.indicators
    }));
  }

  /**
   * 生成报警统计报告
   */
  async getAlarmStatisticsReport(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 按级别统计
    const levelStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        'alarm.alert_level as level',
        'COUNT(*) as count',
        "COUNT(CASE WHEN alarm.status = 'open' THEN 1 END) as open_count",
        "COUNT(CASE WHEN alarm.status = 'resolved' THEN 1 END) as resolved_count",
        "ROUND(AVG(EXTRACT(EPOCH FROM (alarm.resolved_at - alarm.created_at)) / 3600), 2) as avg_resolution_hours"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.alert_level')
      .getRawMany();

    // 按设备统计
    const deviceStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        'alarm.device_id as device_id',
        'device.name as device_name',
        'COUNT(*) as total_alarms',
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as critical_alarms",
        "COUNT(CASE WHEN alarm.status = 'open' THEN 1 END) as open_alarms"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.device_id, device.name')
      .orderBy('total_alarms', 'DESC')
      .limit(10) // Top 10
      .getRawMany();

    // 按日趋势统计
    const dailyTrend = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        "DATE(alarm.created_at) as date",
        'COUNT(*) as total',
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as critical",
        "COUNT(CASE WHEN alarm.alert_level = 'warning' THEN 1 END) as warning",
        "COUNT(CASE WHEN alarm.status = 'open' THEN 1 END) as open"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy("DATE(alarm.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      period: `Last ${daysBack} days`,
      levelDistribution: levelStats,
      topProblematicDevices: deviceStats,
      dailyTrend: dailyTrend.map(t => ({
        ...t,
        date: t.date,
        total: parseInt(t.total),
        critical: parseInt(t.critical),
        warning: parseInt(t.warning),
        open: parseInt(t.open)
      }))
    };
  }

  /**
   * 生成工单统计报告
   */
  async getWorkOrderStatisticsReport(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 基础统计
    const totalOrders = await this.workOrdersRepository.count({
      where: {
        device: { tenant_id: tenantId },
        created_at: Between(startDate, new Date())
      }
    });

    const statusStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        'work_order.status as status',
        'COUNT(*) as count',
        "COUNT(CASE WHEN work_order.priority = 'urgent' THEN 1 END) as urgent_count",
        "COUNT(CASE WHEN work_order.priority = 'high' THEN 1 END) as high_count"
      ])
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('work_order.status')
      .getRawMany();

    // 工单类型分布
    const typeStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        'work_order.order_type as type',
        'COUNT(*) as count',
        'AVG(EXTRACT(EPOCH FROM (work_order.actual_end_time - work_order.actual_start_time)) / 3600) as avg_duration_hours'
      ])
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .andWhere('work_order.actual_start_time IS NOT NULL')
      .andWhere('work_order.actual_end_time IS NOT NULL')
      .groupBy('work_order.order_type')
      .getRawMany();

    // 平均完成时间
    const avgCompletionTime = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select('AVG(EXTRACT(EPOCH FROM (work_order.actual_end_time - work_order.actual_start_time)) / 3600) as avg_hours')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status = :status', { status: 'completed' })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .getRawOne();

    // 按设备统计
    const deviceStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        'work_order.device_id as device_id',
        'device.name as device_name',
        'COUNT(*) as total_work_orders',
        "COUNT(CASE WHEN work_order.status = 'completed' THEN 1 END) as completed",
        "COUNT(CASE WHEN work_order.status = 'cancelled' THEN 1 END) as cancelled"
      ])
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('work_order.device_id, device.name')
      .orderBy('total_work_orders', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      period: `Last ${daysBack} days`,
      total: totalOrders,
      statusDistribution: statusStats,
      typeDistribution: typeStats,
      avgCompletionTimeHours: avgCompletionTime?.avg_hours ? parseFloat(avgCompletionTime.avg_hours) : 0,
      topActiveDevices: deviceStats
    };
  }

  /**
   * 生成物料消耗报告
   */
  async getMaterialConsumptionReport(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 物料消耗统计
    const consumptionStats = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'material.id as material_id',
        'material.name as material_name',
        'material.unit as unit',
        'SUM(wom.quantity_used) as total_consumed',
        'AVG(wom.cost) as avg_unit_cost',
        'SUM(wom.cost) as total_cost',
        'COUNT(DISTINCT wo.id) as work_orders_used_in',
        'MIN(wom.created_at) as first_used',
        'MAX(wom.created_at) as last_used'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('wom.created_at >= :startDate', { startDate })
      .groupBy('material.id, material.name, material.unit')
      .orderBy('total_consumed', 'DESC')
      .limit(20) // Top 20
      .getRawMany();

    // 成本分析
    const totalMaterialCost = consumptionStats.reduce((sum, item) => sum + parseFloat(item.total_cost || '0'), 0);

    // 按类别汇总
    const categoryBreakdown = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.material', 'material')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'material.category as category',
        'SUM(wom.quantity_used) as total_quantity',
        'SUM(wom.cost) as total_cost',
        'COUNT(DISTINCT material.id) as unique_materials'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('wom.created_at >= :startDate', { startDate })
      .groupBy('material.category')
      .getRawMany();

    return {
      period: `Last ${daysBack} days`,
      totalCost: parseFloat(totalMaterialCost.toFixed(2)),
      topConsumedMaterials: consumptionStats,
      categoryBreakdown: categoryBreakdown,
      costPerCategory: categoryBreakdown.map(cat => ({
        ...cat,
        percentageOfTotal: totalMaterialCost > 0 ? parseFloat(((parseFloat(cat.total_cost) / totalMaterialCost) * 100).toFixed(2)) : 0
      }))
    };
  }

  /**
   * 生成预测性维护报告
   */
  async getPredictiveMaintenanceReport(tenantId: number) {
    const devices = await this.devicesRepository.find({ where: { tenant_id: tenantId } });
    
    const deviceIds = devices.map(d => d.id);
    const predictions = await this.predictiveMaintenanceService.batchPredictiveAnalysis(deviceIds);
    
    // 分析预测结果
    const highRiskDevices = predictions.filter(p => p.maintenancePriority === 'urgent' || p.maintenancePriority === 'high');
    const mediumRiskDevices = predictions.filter(p => p.maintenancePriority === 'medium');
    const lowRiskDevices = predictions.filter(p => p.maintenancePriority === 'low');
    
    // 计算平均指标
    const avgFailureProbability = predictions.reduce((sum, p) => sum + p.failureProbability, 0) / predictions.length;
    const avgTimeToFailure = predictions.reduce((sum, p) => sum + p.estimatedDaysToFailure, 0) / predictions.length;
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    
    // 即将发生故障的设备
    const imminentFailures = predictions.filter(p => p.estimatedDaysToFailure <= 7);
    
    // 异常检测结果
    const anomalyCount = predictions.filter(p => p.anomalyDetected).length;

    return {
      summary: {
        totalDevices: devices.length,
        highRisk: highRiskDevices.length,
        mediumRisk: mediumRiskDevices.length,
        lowRisk: lowRiskDevices.length,
        avgFailureProbability: parseFloat(avgFailureProbability.toFixed(3)),
        avgTimeToFailure: Math.round(avgTimeToFailure),
        avgConfidence: parseFloat(avgConfidence.toFixed(3)),
        anomalyCount,
        imminentFailures: imminentFailures.length
      },
      highRiskDevices: highRiskDevices.map(p => ({
        deviceId: p.deviceId,
        failureProbability: parseFloat(p.failureProbability.toFixed(3)),
        estimatedDaysToFailure: Math.round(p.estimatedDaysToFailure),
        confidence: parseFloat(p.confidence.toFixed(3)),
        recommendations: p.maintenanceRecommendations,
        priority: p.maintenancePriority
      })),
      actionItems: [
        `优先处理 ${highRiskDevices.length} 个高风险设备`,
        `安排 ${imminentFailures.length} 个即将故障的设备维护`,
        `关注 ${anomalyCount} 个检测到异常的设备`
      ]
    };
  }

  /**
   * 生成综合仪表板数据
   */
  async getComprehensiveDashboardData(tenantId: number) {
    const devices = await this.devicesRepository.find({ where: { tenant_id: tenantId } });
    
    // 获取关键指标
    const kpiPromises = devices.map(device => 
      this.calculateKPIMetrics(device.id, 7) // 7天内的KPI
    );
    
    const kpisLoading = await Promise.allSettled(kpiPromises);
    const validKpis = kpisLoading
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<KpiMetrics>).value);
    
    // 计算平均KPI
    const avgKpi: KpiMetrics = {
      availability: validKpis.reduce((sum, kpi) => sum + kpi.availability, 0) / validKpis.length || 0,
      reliability: validKpis.reduce((sum, kpi) => sum + kpi.reliability, 0) / validKpis.length || 0,
      performance: validKpis.reduce((sum, kpi) => sum + kpi.performance, 0) / validKpis.length || 0,
      quality: validKpis.reduce((sum, kpi) => sum + kpi.quality, 0) / validKpis.length || 0,
      oee: validKpis.reduce((sum, kpi) => sum + kpi.oee, 0) / validKpis.length || 0
    };
    
    // 获取最新健康度
    const recentHealthRecords = await this.deviceHealthRepository
      .createQueryBuilder('health')
      .leftJoin('health.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .orderBy('health.calculated_at', 'DESC')
      .limit(devices.length)
      .getMany();
    
    const avgHealth = recentHealthRecords.length > 0 
      ? recentHealthRecords.reduce((sum, record) => sum + (record.health_score || 0), 0) / recentHealthRecords.length
      : 100;
    
    // 获取最近的报警和工单
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentAlarms = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :sevenDaysAgo', { sevenDaysAgo })
      .getCount();
    
    const recentWorkOrders = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :sevenDaysAgo', { sevenDaysAgo })
      .getCount();
    
    // 预测性维护数据
    const predictiveReport = await this.getPredictiveMaintenanceReport(tenantId);

    return {
      overview: {
        totalDevices: devices.length,
        avgHealth: parseFloat(avgHealth.toFixed(2)),
        recentAlarms,
        recentWorkOrders,
        highRiskDevices: predictiveReport.summary.highRisk,
        avgKpi
      },
      charts: {
        kpiTrend: await this.getKPITrend(tenantId),
        alarmTrend: await this.getAlarmTrend(tenantId),
        workOrderTrend: await this.getWorkOrderTrend(tenantId)
      },
      alerts: {
        highPriorityAlarms: await this.getHighPriorityAlarms(tenantId),
        overdueWorkOrders: await this.getOverdueWorkOrders(tenantId),
        lowStockMaterials: await this.getLowStockMaterials(tenantId)
      }
    };
  }

  /**
   * 获取KPI趋势
   */
  private async getKPITrend(tenantId: number, daysBack: number = 30) {
    const result = [];
    const deviceIds = (await this.devicesRepository.find({ where: { tenant_id: tenantId } })).map(d => d.id);
    
    for (let i = daysBack; i >= 0; i--) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() - i);
      
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dailyKpis = await Promise.all(
        deviceIds.map(id => this.calculateKPIMetrics(id, 1))
      );
      
      const avgAvailability = dailyKpis.reduce((sum, kpi) => sum + kpi.availability, 0) / dailyKpis.length;
      const avgOee = dailyKpis.reduce((sum, kpi) => sum + kpi.oee, 0) / dailyKpis.length;
      
      result.push({
        date: currentDate,
        availability: parseFloat(avgAvailability.toFixed(2)),
        oee: parseFloat(avgOee.toFixed(2))
      });
    }
    
    return result;
  }

  /**
   * 获取报警趋势
   */
  private async getAlarmTrend(tenantId: number, daysBack: number = 30) {
    const result = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const dailyStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        "DATE(alarm.created_at) as date",
        'COUNT(*) as total',
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as critical",
        "COUNT(CASE WHEN alarm.alert_level = 'warning' THEN 1 END) as warning"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy("DATE(alarm.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();
    
    return dailyStats.map(stat => ({
      date: stat.date,
      total: parseInt(stat.total),
      critical: parseInt(stat.critical),
      warning: parseInt(stat.warning)
    }));
  }

  /**
   * 获取工单趋势
   */
  private async getWorkOrderTrend(tenantId: number, daysBack: number = 30) {
    const result = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const dailyStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        "DATE(work_order.created_at) as date",
        'COUNT(*) as total',
        "COUNT(CASE WHEN work_order.status = 'completed' THEN 1 END) as completed",
        "COUNT(CASE WHEN work_order.priority = 'urgent' THEN 1 END) as urgent"
      ])
      .leftJoin('work_order.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy("DATE(work_order.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();
    
    return dailyStats.map(stat => ({
      date: stat.date,
      total: parseInt(stat.total),
      completed: parseInt(stat.completed),
      urgent: parseInt(stat.urgent)
    }));
  }

  /**
   * 获取高优先级报警
   */
  private async getHighPriorityAlarms(tenantId: number, limit: number = 5) {
    return await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.device', 'device')
      .leftJoinAndSelect('alarm.rule', 'rule')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.alert_level = :level', { level: 'critical' })
      .andWhere('alarm.status = :status', { status: 'open' })
      .orderBy('alarm.created_at', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * 获取逾期工单
   */
  private async getOverdueWorkOrders(tenantId: number, limit: number = 5) {
    const now = new Date();
    
    return await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoinAndSelect('work_order.device', 'device')
      .leftJoinAndSelect('work_order.assigned_user', 'assigned_user')
      .where('work_order.device.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status IN (:...statuses)', { statuses: ['pending', 'assigned', 'in_progress'] })
      .andWhere('work_order.scheduled_date < :now', { now })
      .orderBy('work_order.scheduled_date', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * 获取低库存物料
   */
  private async getLowStockMaterials(tenantId: number, limit: number = 5) {
    return await this.materialsRepository
      .createQueryBuilder('material')
      .where('material.tenant_id = :tenantId', { tenantId })
      .andWhere('material.current_stock <= material.min_stock')
      .orderBy('material.current_stock', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * 生成自定义报告
   */
  async generateCustomReport(templateId: string, parameters: Record<string, any>) {
    // 根据报告模板和参数生成自定义报告
    // 实际实现会根据templateId获取预定义的查询和格式
    
    switch (templateId) {
      case 'equipment_utilization':
        return this.generateEquipmentUtilizationReport(parameters);
      case 'cost_analysis':
        return this.generateCostAnalysisReport(parameters);
      case 'maintenance_effectiveness':
        return this.generateMaintenanceEffectivenessReport(parameters);
      default:
        throw new Error(`Unknown report template: ${templateId}`);
    }
  }

  /**
   * 生成设备利用率报告
   */
  private async generateEquipmentUtilizationReport(params: Record<string, any>) {
    const { tenantId, startDate, endDate, deviceIds } = params;
    
    const devices = deviceIds 
      ? await this.devicesRepository.findByIds(deviceIds)
      : await this.devicesRepository.find({ where: { tenant_id: tenantId } });
    
    const reportData = [];
    
    for (const device of devices) {
      // 计算设备利用率（简化实现）
      const totalPossibleTime = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60); // 小时
      
      // 获取设备活动时间（基于传感器数据）
      const activityCount = await this.sensorDataRepository.count({
        where: {
          device_id: device.id,
          data_timestamp: Between(new Date(startDate), new Date(endDate))
        }
      });
      
      // 假设每小时正常运行应产生10个数据点
      const expectedActivity = totalPossibleTime * 10;
      const utilizationRate = expectedActivity > 0 ? (activityCount / expectedActivity) * 100 : 0;
      
      reportData.push({
        deviceId: device.id,
        deviceName: device.name,
        utilizationRate: parseFloat(utilizationRate.toFixed(2)),
        totalActivity: activityCount,
        possibleActivity: expectedActivity
      });
    }
    
    return {
      reportType: 'equipment_utilization',
      parameters: params,
      generatedAt: new Date(),
      data: reportData.sort((a, b) => b.utilizationRate - a.utilizationRate)
    };
  }

  /**
   * 生成成本分析报告
   */
  private async generateCostAnalysisReport(params: Record<string, any>) {
    const { tenantId, startDate, endDate } = params;
    
    // 计算维护成本
    const maintenanceCosts = await this.workOrderMaterialsRepository
      .createQueryBuilder('wom')
      .leftJoin('wom.work_order', 'wo')
      .leftJoin('wo.device', 'device')
      .select([
        'SUM(wom.cost) as total_material_cost',
        'COUNT(DISTINCT wo.id) as total_work_orders'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('wom.created_at BETWEEN :start AND :end', { start: new Date(startDate), end: new Date(endDate) })
      .getRawOne();
    
    // 计算潜在故障成本
    const predictiveReport = await this.getPredictiveMaintenanceReport(tenantId);
    const potentialFailureCost = predictiveReport.summary.highRisk * 5000; // 假设每个高风险设备潜在损失5000
    
    // 计算停机成本（简化）
    const downtimeCost = 10000; // 假设值
    
    return {
      reportType: 'cost_analysis',
      parameters: params,
      generatedAt: new Date(),
      costs: {
        maintenanceCost: parseFloat(maintenanceCosts.total_material_cost || '0'),
        potentialFailureCost: parseFloat(potentialFailureCost.toFixed(2)),
        downtimeCost: parseFloat(downtimeCost.toFixed(2)),
        totalRiskCost: parseFloat((parseFloat(maintenanceCosts.total_material_cost || '0') + potentialFailureCost + downtimeCost).toFixed(2))
      },
      metrics: {
        costPerWorkOrder: maintenanceCosts.total_work_orders > 0 
          ? parseFloat((parseFloat(maintenanceCosts.total_material_cost || '0') / parseInt(maintenanceCosts.total_work_orders)).toFixed(2)) 
          : 0,
        roiOnPreventiveMaintenance: 'N/A' // 需要更多数据来计算ROI
      }
    };
  }

  /**
   * 生成维护效果报告
   */
  private async generateMaintenanceEffectivenessReport(params: Record<string, any>) {
    const { tenantId, startDate, endDate } = params;
    
    // 计算维护相关指标
    const workOrders = await this.workOrdersRepository.find({
      where: {
        device: { tenant_id: tenantId },
        created_at: Between(new Date(startDate), new Date(endDate))
      }
    });
    
    // 计算平均修复时间
    let totalRepairTime = 0;
    let completedOrders = 0;
    
    for (const order of workOrders) {
      if (order.actual_start_time && order.actual_end_time) {
        totalRepairTime += (new Date(order.actual_end_time).getTime() - new Date(order.actual_start_time).getTime()) / (1000 * 60 * 60); // 小时
        completedOrders++;
      }
    }
    
    const avgRepairTime = completedOrders > 0 ? totalRepairTime / completedOrders : 0;
    
    // 计算维护类型分布
    const typeDistribution = workOrders.reduce((acc, order) => {
      acc[order.order_type] = (acc[order.order_type] || 0) + 1;
      return acc;
    }, {});
    
    // 计算优先级分布
    const priorityDistribution = workOrders.reduce((acc, order) => {
      acc[order.priority] = (acc[order.priority] || 0) + 1;
      return acc;
    }, {});
    
    return {
      reportType: 'maintenance_effectiveness',
      parameters: params,
      generatedAt: new Date(),
      metrics: {
        totalWorkOrders: workOrders.length,
        completedWorkOrders: completedOrders,
        avgRepairTimeHours: parseFloat(avgRepairTime.toFixed(2)),
        typeDistribution,
        priorityDistribution
      }
    };
  }
}