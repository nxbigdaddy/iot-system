import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { SensorData } from '../sensor-data/entities/sensor-data.entity';
import { Device } from '../devices/entities/device.entity';
import { Alarm } from '../alarms/entities/alarm.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { DeviceHealth } from '../device-health/entities/device-health.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  quality_score?: number;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }>;
}

@Injectable()
export class AnalyticsService {
  private logger = new Logger(AnalyticsService.name);

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
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  // 获取时间序列数据
  async getTimeSeriesData(
    deviceId: number, 
    dataType: string, 
    startDate: Date, 
    endDate: Date,
    aggregation: 'raw' | 'hourly' | 'daily' = 'raw'
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

    // 根据聚合级别调整查询
    if (aggregation !== 'raw') {
      query.addSelect('DATE_TRUNC(:interval, sensor_data.data_timestamp)', 'time_group')
           .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
           .addSelect('COUNT(sensor_data.id)', 'count')
           .groupBy('time_group')
           .setParameter('interval', aggregation === 'hourly' ? 'hour' : 'day');
    }

    const results = await query.getRawMany();

    if (aggregation !== 'raw') {
      return results.map(result => ({
        timestamp: new Date(result.time_group),
        value: parseFloat(result.avg_value),
        quality_score: parseFloat(result.count) // 使用计数作为质量指标
      }));
    } else {
      return results.map(result => ({
        timestamp: result.sensor_data_data_timestamp,
        value: result.sensor_data_processed_value,
        quality_score: result.sensor_data_quality_score
      }));
    }
  }

  // 获取设备健康度趋势
  async getDeviceHealthTrend(deviceId: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

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
      health_score: record.health_score,
      indicators: record.indicators
    }));
  }

  // 获取设备状态统计
  async getDeviceStatusStats(tenantId: number) {
    const devices = await this.devicesRepository.find({
      where: { tenant_id: tenantId }
    });

    const statusCounts = {
      active: 0,
      maintenance: 0,
      decommissioned: 0
    };

    for (const device of devices) {
      statusCounts[device.status]++;
    }

    return statusCounts;
  }

  // 获取报警统计
  async getAlarmStats(tenantId: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 按级别统计
    const levelStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select(['alarm.alert_level as level', 'COUNT(*) as count'])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.alert_level')
      .getRawMany();

    // 按设备统计
    const deviceStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select(['alarm.device_id as deviceId', 'COUNT(*) as count'])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.device_id')
      .orderBy('count', 'DESC')
      .limit(10) // Top 10
      .getRawMany();

    // 按日期统计
    const dailyStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        "DATE(alarm.created_at) as date",
        "COUNT(*) as count",
        "SUM(CASE WHEN alarm.alert_level = 'critical' THEN 1 ELSE 0 END) as critical",
        "SUM(CASE WHEN alarm.alert_level = 'warning' THEN 1 ELSE 0 END) as warning"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('DATE(alarm.created_at)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      by_level: levelStats,
      by_device: deviceStats,
      by_date: dailyStats
    };
  }

  // 获取工单统计
  async getWorkOrderStats(tenantId: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 按状态统计
    const statusStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select(['work_order.status as status', 'COUNT(*) as count'])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('work_order.status')
      .getRawMany();

    // 按类型统计
    const typeStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select(['work_order.order_type as type', 'COUNT(*) as count'])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('work_order.order_type')
      .getRawMany();

    // 按优先级统计
    const priorityStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select(['work_order.priority as priority', 'COUNT(*) as count'])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :startDate', { startDate })
      .groupBy('work_order.priority')
      .getRawMany();

    // 平均处理时间
    const avgProcessingTime = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select([
        "AVG(EXTRACT(EPOCH FROM (work_order.actual_end_time - work_order.actual_start_time)) / 3600) as avg_hours"
      ])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status = :status', { status: 'completed' })
      .andWhere('work_order.actual_start_time IS NOT NULL')
      .andWhere('work_order.actual_end_time IS NOT NULL')
      .getRawOne();

    return {
      by_status: statusStats,
      by_type: typeStats,
      by_priority: priorityStats,
      avg_processing_time_hours: parseFloat(avgProcessingTime.avg_hours || 0)
    };
  }

  // 生成综合仪表板数据
  async getDashboardData(tenantId: number) {
    // 设备总数和在线状态
    const totalDevices = await this.devicesRepository.count({ where: { tenant_id: tenantId } });
    const activeDevices = await this.devicesRepository.count({ 
      where: { tenant_id: tenantId, status: 'active' } 
    });

    // 计算在线设备数（基于DTU通信状态）
    const onlineDevices = await this.devicesRepository
      .createQueryBuilder('device')
      .innerJoin('device.dtu', 'dtu')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('dtu.communication_status = :status', { status: 'online' })
      .getCount();

    // 最近24小时的报警数
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentAlarms = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :yesterday', { yesterday })
      .getCount();

    // 最近24小时的工单数
    const recentWorkOrders = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at >= :yesterday', { yesterday })
      .getCount();

    // 设备平均健康度
    const recentHealthRecords = await this.deviceHealthRepository
      .createQueryBuilder('health')
      .innerJoin('health.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .orderBy('health.calculated_at', 'DESC')
      .limit(totalDevices) // 获取每个设备最新的健康记录
      .getMany();

    const avgHealth = recentHealthRecords.length > 0
      ? recentHealthRecords.reduce((sum, record) => sum + (record.health_score || 0), 0) / recentHealthRecords.length
      : 100;

    // 预测性维护指标
    const highRiskDevices = recentHealthRecords.filter(record => 
      record.health_score < 70
    ).length;

    return {
      overview: {
        total_devices: totalDevices,
        active_devices: activeDevices,
        online_devices: onlineDevices,
        recent_alarms: recentAlarms,
        recent_work_orders: recentWorkOrders,
        average_health: parseFloat(avgHealth.toFixed(2)),
        high_risk_devices: highRiskDevices
      },
      charts: {
        // 设备状态分布饼图
        device_status: await this.getDeviceStatusDistribution(tenantId),
        // 报警趋势线图
        alarm_trend: await this.getAlarmTrend(tenantId),
        // 工单类型分布
        work_order_types: await this.getWorkOrderTypeDistribution(tenantId)
      },
      alerts: {
        high_priority_alarms: await this.getHighPriorityAlarms(tenantId),
        overdue_work_orders: await this.getOverdueWorkOrders(tenantId),
        low_stock_materials: await this.getLowStockMaterials(tenantId)
      }
    };
  }

  // 获取设备状态分布数据
  private async getDeviceStatusDistribution(tenantId: number): Promise<ChartData> {
    const stats = await this.getDeviceStatusStats(tenantId);
    
    return {
      labels: ['运行中', '维护中', '已停用'],
      datasets: [{
        label: '设备状态分布',
        data: [stats.active, stats.maintenance, stats.decommissioned],
        backgroundColor: ['#4CAF50', '#FFC107', '#9E9E9E']
      }]
    };
  }

  // 获取报警趋势数据
  private async getAlarmTrend(tenantId: number, days: number = 7): Promise<ChartData> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dailyStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        "TO_CHAR(alarm.created_at, 'MM-DD') as date_label",
        "COUNT(*) as count",
        "SUM(CASE WHEN alarm.alert_level = 'critical' THEN 1 ELSE 0 END) as critical"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy("TO_CHAR(alarm.created_at, 'MM-DD')")
      .orderBy('date_label', 'ASC')
      .getRawMany();

    const labels = dailyStats.map(s => s.date_label);
    const counts = dailyStats.map(s => parseInt(s.count));
    const critical = dailyStats.map(s => parseInt(s.critical));

    return {
      labels,
      datasets: [
        {
          label: '总报警数',
          data: counts,
          borderColor: '#FF6384',
          backgroundColor: 'rgba(255,99,132,0.2)'
        },
        {
          label: '严重报警',
          data: critical,
          borderColor: '#FF0000',
          backgroundColor: 'rgba(255,0,0,0.2)'
        }
      ]
    };
  }

  // 获取工单类型分布
  private async getWorkOrderTypeDistribution(tenantId: number): Promise<ChartData> {
    const typeStats = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .select(['work_order.order_type as type', 'COUNT(*) as count'])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .groupBy('work_order.order_type')
      .getRawMany();

    const labels = typeStats.map(s => this.getOrderTypeName(s.type));
    const data = typeStats.map(s => parseInt(s.count));

    return {
      labels,
      datasets: [{
        label: '工单类型分布',
        data,
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0']
      }]
    };
  }

  // 获取高优先级报警
  private async getHighPriorityAlarms(tenantId: number) {
    return await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.device', 'device')
      .leftJoinAndSelect('alarm.rule', 'rule')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.alert_level = :level', { level: 'critical' })
      .andWhere('alarm.status = :status', { status: 'open' })
      .orderBy('alarm.created_at', 'DESC')
      .limit(5)
      .getMany();
  }

  // 获取逾期工单
  private async getOverdueWorkOrders(tenantId: number) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    return await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoinAndSelect('work_order.device', 'device')
      .leftJoinAndSelect('work_order.assigned_user', 'assigned_user')
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.status IN (:...statuses)', { statuses: ['pending', 'assigned', 'in_progress'] })
      .andWhere('work_order.created_at <= :weekAgo', { weekAgo })
      .orderBy('work_order.created_at', 'ASC')
      .limit(5)
      .getMany();
  }

  // 获取低库存物料
  private async getLowStockMaterials(tenantId: number) {
    // 这部分需要物料服务的支持
    return []; // 简化实现
  }

  // 获取数据导出
  async exportData(tenantId: number, dataType: string, startDate: Date, endDate: Date) {
    switch (dataType) {
      case 'sensor_data':
        return await this.exportSensorData(tenantId, startDate, endDate);
      case 'alarms':
        return await this.exportAlarms(tenantId, startDate, endDate);
      case 'work_orders':
        return await this.exportWorkOrders(tenantId, startDate, endDate);
      case 'device_health':
        return await this.exportDeviceHealth(tenantId, startDate, endDate);
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  private async exportSensorData(tenantId: number, startDate: Date, endDate: Date) {
    const data = await this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .leftJoin('sensor_data.device', 'device')
      .leftJoin('sensor_data.dtu', 'dtu')
      .select([
        'sensor_data.data_timestamp as timestamp',
        'device.name as device_name',
        'dtu.sn as dtu_sn',
        'sensor_data.data_type as data_type',
        'sensor_data.raw_value as raw_value',
        'sensor_data.processed_value as processed_value',
        'sensor_data.quality_score as quality_score'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('sensor_data.data_timestamp BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('sensor_data.data_timestamp', 'DESC')
      .getRawMany();

    return {
      filename: `sensor_data_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`,
      data
    };
  }

  private async exportAlarms(tenantId: number, startDate: Date, endDate: Date) {
    const data = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoin('alarm.device', 'device')
      .leftJoin('alarm.rule', 'rule')
      .select([
        'alarm.created_at as created_at',
        'device.name as device_name',
        'rule.name as rule_name',
        'alarm.data_type as data_type',
        'alarm.actual_value as actual_value',
        'alarm.threshold_value as threshold_value',
        'alarm.alert_level as alert_level',
        'alarm.status as status'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('alarm.created_at', 'DESC')
      .getRawMany();

    return {
      filename: `alarms_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`,
      data
    };
  }

  private async exportWorkOrders(tenantId: number, startDate: Date, endDate: Date) {
    const data = await this.workOrdersRepository
      .createQueryBuilder('work_order')
      .leftJoin('work_order.device', 'device')
      .leftJoin('work_order.assigned_user', 'assigned_user')
      .select([
        'work_order.created_at as created_at',
        'work_order.title as title',
        'device.name as device_name',
        'work_order.order_type as order_type',
        'work_order.priority as priority',
        'work_order.status as status',
        'assigned_user.username as assigned_user'
      ])
      .where('work_order.tenant_id = :tenantId', { tenantId })
      .andWhere('work_order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('work_order.created_at', 'DESC')
      .getRawMany();

    return {
      filename: `work_orders_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`,
      data
    };
  }

  private async exportDeviceHealth(tenantId: number, startDate: Date, endDate: Date) {
    const data = await this.deviceHealthRepository
      .createQueryBuilder('health')
      .leftJoin('health.device', 'device')
      .select([
        'health.calculated_at as calculated_at',
        'device.name as device_name',
        'health.health_score as health_score'
      ])
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('health.calculated_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('health.calculated_at', 'DESC')
      .getRawMany();

    return {
      filename: `device_health_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`,
      data
    };
  }

  private getOrderTypeName(type: string): string {
    const typeNames = {
      'inspection': '巡检',
      'repair': '维修',
      'maintenance': '保养'
    };
    return typeNames[type] || type;
  }
}