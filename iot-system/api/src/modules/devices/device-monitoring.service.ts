import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Device } from './entities/device.entity';
import { Dtu } from '../dtus/entities/dtu.entity';
import { SensorData } from '../sensors/entities/sensor-data.entity';
import { Alarm } from '../alarms/entities/alarm.entity';
import { AlarmRule } from '../alarm-rules/entities/alarm-rule.entity';
import { DeviceHealth } from '../device-health/entities/device-health.entity';

export interface DeviceStatus {
  id: number;
  name: string;
  online: boolean;
  healthScore: number;
  lastHeartbeat: Date;
  currentValues: Record<string, number>;
  alerts: number;
  uptime: number;
  location: string;
}

@Injectable()
export class DeviceMonitoringService {
  private logger = new Logger(DeviceMonitoringService.name);

  constructor(
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(Dtu)
    private dtusRepository: Repository<Dtu>,
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
    @InjectRepository(Alarm)
    private alarmsRepository: Repository<Alarm>,
    @InjectRepository(AlarmRule)
    private alarmRulesRepository: Repository<AlarmRule>,
    @InjectRepository(DeviceHealth)
    private deviceHealthRepository: Repository<DeviceHealth>,
  ) {}

  /**
   * 获取设备实时状态
   */
  async getRealTimeStatus(deviceId: number): Promise<DeviceStatus> {
    const device = await this.devicesRepository.findOne({
      where: { id: deviceId },
      relations: ['dtu']
    });

    if (!device) {
      throw new Error(`Device with id ${deviceId} not found`);
    }

    // 获取DTU状态
    const dtu = device.dtu ? await this.dtusRepository.findOne({
      where: { id: device.dtu.id }
    }) : null;

    // 获取最新传感器数据
    const latestData = await this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .where('sensor_data.device_id = :deviceId', { deviceId })
      .orderBy('sensor_data.data_timestamp', 'DESC')
      .limit(10) // 获取最近10条数据
      .getMany();

    // 获取设备健康度
    const healthRecord = await this.deviceHealthRepository
      .createQueryBuilder('health')
      .where('health.device_id = :deviceId', { deviceId })
      .orderBy('health.calculated_at', 'DESC')
      .limit(1)
      .getOne();

    // 获取未处理报警数
    const unhandledAlerts = await this.alarmsRepository.count({
      where: {
        device_id: deviceId,
        status: 'open'
      }
    });

    // 计算运行时间
    const uptime = device.installation_date ? 
      Math.floor((new Date().getTime() - new Date(device.installation_date).getTime()) / (1000 * 60 * 60)) : 0;

    // 构建当前值对象
    const currentValues: Record<string, number> = {};
    latestData.forEach(data => {
      if (data.data_type && data.processed_value !== null) {
        currentValues[data.data_type] = data.processed_value;
      }
    });

    return {
      id: device.id,
      name: device.name,
      online: dtu ? dtu.communication_status === 'online' : false,
      healthScore: healthRecord ? healthRecord.health_score : 100,
      lastHeartbeat: dtu ? dtu.last_heartbeat : null,
      currentValues,
      alerts: unhandledAlerts,
      uptime,
      location: device.location
    };
  }

  /**
   * 获取所有设备的概览状态
   */
  async getDeviceOverview(tenantId: number): Promise<DeviceStatus[]> {
    const devices = await this.devicesRepository.find({
      where: { tenant_id: tenantId },
      relations: ['dtu']
    });

    const statusPromises = devices.map(device => 
      this.getRealTimeStatus(device.id)
    );

    return Promise.all(statusPromises);
  }

  /**
   * 检查设备是否在线（基于心跳）
   */
  async isDeviceOnline(deviceId: number): Promise<boolean> {
    const device = await this.devicesRepository.findOne({
      where: { id: deviceId },
      relations: ['dtu']
    });

    if (!device || !device.dtu) {
      return false;
    }

    const dtu = await this.dtusRepository.findOne({
      where: { id: device.dtu.id }
    });

    if (!dtu || dtu.last_heartbeat === null) {
      return false;
    }

    // 设备在最近5分钟内有心跳则认为在线
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    return dtu.last_heartbeat >= fiveMinutesAgo;
  }

  /**
   * 获取设备历史数据
   */
  async getHistoricalData(
    deviceId: number, 
    dataType: string, 
    startTime: Date, 
    endTime: Date,
    aggregation: 'raw' | 'minute' | 'hour' | 'day' = 'raw'
  ) {
    let query = this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .where('sensor_data.device_id = :deviceId', { deviceId })
      .andWhere('sensor_data.data_type = :dataType', { dataType })
      .andWhere('sensor_data.data_timestamp BETWEEN :start AND :end', { 
        start: startTime, 
        end: endTime 
      })
      .orderBy('sensor_data.data_timestamp', 'ASC');

    if (aggregation !== 'raw') {
      // 根据聚合级别调整查询
      if (aggregation === 'minute') {
        query.addSelect('DATE_TRUNC(\'minute\', sensor_data.data_timestamp)', 'time_bucket')
             .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
             .addSelect('MIN(sensor_data.processed_value)', 'min_value')
             .addSelect('MAX(sensor_data.processed_value)', 'max_value')
             .addSelect('COUNT(*)', 'count')
             .groupBy('time_bucket')
             .orderBy('time_bucket', 'ASC');
      } else if (aggregation === 'hour') {
        query.addSelect('DATE_TRUNC(\'hour\', sensor_data.data_timestamp)', 'time_bucket')
             .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
             .addSelect('MIN(sensor_data.processed_value)', 'min_value')
             .addSelect('MAX(sensor_data.processed_value)', 'max_value')
             .addSelect('COUNT(*)', 'count')
             .groupBy('time_bucket')
             .orderBy('time_bucket', 'ASC');
      } else if (aggregation === 'day') {
        query.addSelect('DATE_TRUNC(\'day\', sensor_data.data_timestamp)', 'time_bucket')
             .addSelect('AVG(sensor_data.processed_value)', 'avg_value')
             .addSelect('MIN(sensor_data.processed_value)', 'min_value')
             .addSelect('MAX(sensor_data.processed_value)', 'max_value')
             .addSelect('COUNT(*)', 'count')
             .groupBy('time_bucket')
             .orderBy('time_bucket', 'ASC');
      }
    }

    const results = await query.getRawMany();

    if (aggregation !== 'raw') {
      return results.map(result => ({
        timestamp: new Date(result.time_bucket),
        avgValue: parseFloat(result.avg_value),
        minValue: parseFloat(result.min_value),
        maxValue: parseFloat(result.max_value),
        count: parseInt(result.count)
      }));
    } else {
      return results.map(result => ({
        timestamp: result.sensor_data_data_timestamp,
        value: result.sensor_data_processed_value,
        quality: result.sensor_data_quality_score
      }));
    }
  }

  /**
   * 获取设备性能指标
   */
  async getPerformanceMetrics(deviceId: number) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 获取7天内的数据完整性
    const totalExpectedDataPoints = 7 * 24 * 60; // 假设每分钟一条数据
    const actualDataPoints = await this.sensorDataRepository.count({
      where: {
        device_id: deviceId,
        data_timestamp: MoreThanOrEqual(sevenDaysAgo)
      }
    });

    // 获取报警统计
    const alertStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        'COUNT(*) as total_alerts',
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as critical_alerts",
        "COUNT(CASE WHEN alarm.alert_level = 'warning' THEN 1 END) as warning_alerts",
        "COUNT(CASE WHEN alarm.status = 'open' THEN 1 END) as open_alerts"
      ])
      .where('alarm.device_id = :deviceId', { deviceId })
      .andWhere('alarm.created_at >= :sevenDaysAgo', { sevenDaysAgo })
      .getRawOne();

    // 获取平均健康度
    const avgHealth = await this.deviceHealthRepository
      .createQueryBuilder('health')
      .select('AVG(health.health_score)', 'avg_score')
      .where('health.device_id = :deviceId', { deviceId })
      .andWhere('health.calculated_at >= :sevenDaysAgo', { sevenDaysAgo })
      .getRawOne();

    // 计算可用性 (基于心跳)
    const heartbeatData = await this.dtusRepository
      .createQueryBuilder('dtu')
      .select([
        'dtu.last_heartbeat',
        'dtu.created_at as first_seen'
      ])
      .where('dtu.device_id = :deviceId', { deviceId })
      .getRawOne();

    let availability = 100; // 默认100%可用性
    if (heartbeatData && heartbeatData.first_seen) {
      // 这里可以根据心跳数据计算实际可用性
      // 简化实现：假设设备一直在线
    }

    return {
      dataIntegrity: actualDataPoints / totalExpectedDataPoints * 100,
      availability,
      reliability: 100 - (parseInt(alertStats.critical_alerts) / actualDataPoints * 10000), // 简化计算
      avgHealthScore: parseFloat(avgHealth.avg_score) || 100,
      totalAlerts: parseInt(alertStats.total_alerts),
      criticalAlerts: parseInt(alertStats.critical_alerts),
      openAlerts: parseInt(alertStats.open_alerts)
    };
  }

  /**
   * 检查设备是否需要维护
   */
  async checkMaintenanceNeeded(deviceId: number) {
    const device = await this.devicesRepository.findOne({
      where: { id: deviceId },
      relations: ['health_records']
    });

    if (!device) {
      throw new Error(`Device with id ${deviceId} not found`);
    }

    const healthRecords = await this.deviceHealthRepository.find({
      where: { device_id: deviceId },
      order: { calculated_at: 'DESC' },
      take: 10 // 获取最近10次健康检查
    });

    // 检查健康度趋势
    if (healthRecords.length >= 2) {
      const recentHealth = healthRecords[0].health_score;
      const previousHealth = healthRecords[1].health_score;
      
      if (recentHealth < previousHealth && recentHealth < 70) {
        // 健康度下降且低于70%，建议检查
        return {
          needsAttention: true,
          reason: 'Health score declining',
          severity: 'medium'
        };
      }
    }

    // 检查是否超过维护周期
    if (device.next_maintenance_date && new Date() > new Date(device.next_maintenance_date)) {
      return {
        needsAttention: true,
        reason: 'Maintenance due',
        severity: 'high'
      };
    }

    // 检查报警频率
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const alertCount = await this.alarmsRepository.count({
      where: {
        device_id: deviceId,
        created_at: MoreThanOrEqual(thirtyDaysAgo)
      }
    });

    if (alertCount > 10) {
      // 30天内超过10个报警，建议检查
      return {
        needsAttention: true,
        reason: 'High alert frequency',
        severity: alertCount > 20 ? 'high' : 'medium'
      };
    }

    return {
      needsAttention: false,
      reason: 'Normal operation',
      severity: 'low'
    };
  }

  /**
   * 获取设备操作日志
   */
  async getOperationLog(deviceId: number, limit: number = 50) {
    // 这里应该关联维护日志、工单等
    // 由于没有完整的实体关系，这里返回模拟数据
    return [
      {
        id: 1,
        timestamp: new Date('2023-10-15T10:30:00Z'),
        type: 'data_received',
        description: 'Temperature sensor data received',
        value: 24.5,
        unit: '°C'
      },
      {
        id: 2,
        timestamp: new Date('2023-10-15T09:45:00Z'),
        type: 'heartbeat',
        description: 'Device heartbeat received',
        value: null,
        unit: null
      },
      {
        id: 3,
        timestamp: new Date('2023-10-15T08:20:00Z'),
        type: 'alarm_triggered',
        description: 'High temperature alarm triggered',
        value: 85.2,
        unit: '°C',
        alarmId: 123
      }
    ];
  }

  /**
   * 批量更新设备状态
   */
  async batchUpdateStatus(deviceIds: number[]) {
    const results = [];

    for (const deviceId of deviceIds) {
      try {
        const status = await this.getRealTimeStatus(deviceId);
        results.push({
          deviceId,
          status: 'success',
          data: status
        });
      } catch (error) {
        results.push({
          deviceId,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }
}