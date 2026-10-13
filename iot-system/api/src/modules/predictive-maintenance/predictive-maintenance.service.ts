import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { SensorData } from '../sensor-data/entities/sensor-data.entity';
import { MaintenanceSchedule } from '../maintenance-schedules/entities/maintenance-schedule.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { DeviceHealth } from '../device-health/entities/device-health.entity';

export interface HealthIndicator {
  name: string;
  value: number;
  weight: number; // 权重，用于计算综合健康度
  threshold_min?: number;
  threshold_max?: number;
  unit: string;
}

export interface PredictiveModelResult {
  failure_probability: number; // 故障概率 (0-1)
  estimated_days_to_failure: number; // 预估故障天数
  confidence: number; // 预测置信度 (0-1)
  recommendations: string[]; // 维护建议
  health_indicators: HealthIndicator[];
}

@Injectable()
export class PredictiveMaintenanceService {
  private logger = new Logger(PredictiveMaintenanceService.name);

  constructor(
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
    @InjectRepository(MaintenanceSchedule)
    private maintenanceSchedulesRepository: Repository<MaintenanceSchedule>,
    @InjectRepository(WorkOrder)
    private workOrdersRepository: Repository<WorkOrder>,
    @InjectRepository(DeviceHealth)
    private deviceHealthRepository: Repository<DeviceHealth>,
  ) {}

  // 计算设备健康度
  async calculateDeviceHealth(deviceId: number): Promise<number> {
    // 获取设备的最新传感器数据
    const latestData = await this.sensorDataRepository
      .createQueryBuilder('sensor_data')
      .where('sensor_data.device_id = :deviceId', { deviceId })
      .orderBy('sensor_data.data_timestamp', 'DESC')
      .limit(100) // 获取最近100条数据
      .getMany();

    if (!latestData || latestData.length === 0) {
      return 100; // 如果没有数据，默认健康度为100
    }

    // 分析不同类型的传感器数据
    const healthIndicators: HealthIndicator[] = [];

    // 温度指标
    const tempData = latestData.filter(d => d.data_type === 'temperature');
    if (tempData.length > 0) {
      const avgTemp = tempData.reduce((sum, d) => sum + (d.processed_value || 0), 0) / tempData.length;
      const maxTemp = Math.max(...tempData.map(d => d.processed_value || 0));
      
      // 温度越高，健康度越低
      let tempHealth = 100;
      if (maxTemp > 80) tempHealth = 20;
      else if (maxTemp > 70) tempHealth = 50;
      else if (maxTemp > 60) tempHealth = 70;
      
      healthIndicators.push({
        name: 'temperature',
        value: avgTemp,
        weight: 0.3,
        threshold_min: 10,
        threshold_max: 80,
        unit: '°C'
      });
    }

    // 振动指标
    const vibrationData = latestData.filter(d => d.data_type === 'vibration');
    if (vibrationData.length > 0) {
      const avgVibration = vibrationData.reduce((sum, d) => sum + (d.processed_value || 0), 0) / vibrationData.length;
      
      // 振动越大，健康度越低
      let vibrationHealth = 100;
      if (avgVibration > 5) vibrationHealth = 30;
      else if (avgVibration > 3) vibrationHealth = 60;
      else if (avgVibration > 1.5) vibrationHealth = 80;
      
      healthIndicators.push({
        name: 'vibration',
        value: avgVibration,
        weight: 0.25,
        threshold_min: 0,
        threshold_max: 10,
        unit: 'mm/s'
      });
    }

    // 压力指标
    const pressureData = latestData.filter(d => d.data_type === 'pressure');
    if (pressureData.length > 0) {
      const avgPressure = pressureData.reduce((sum, d) => sum + (d.processed_value || 0), 0) / pressureData.length;
      
      // 压力偏离正常范围影响健康度
      let pressureHealth = 100;
      if (avgPressure < 0.8 || avgPressure > 1.2) pressureHealth = 60;
      else if (avgPressure < 0.9 || avgPressure > 1.1) pressureHealth = 80;
      
      healthIndicators.push({
        name: 'pressure',
        value: avgPressure,
        weight: 0.2,
        threshold_min: 0.5,
        threshold_max: 1.5,
        unit: 'MPa'
      });
    }

    // 运行时间指标
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (device && device.installation_date) {
      const runtimeDays = this.calculateDaysDifference(new Date(), new Date(device.installation_date));
      // 运行时间越长，健康度适度降低
      const timeFactor = Math.max(20, 100 - (runtimeDays / 3)); // 每3天减少1点健康度
      
      healthIndicators.push({
        name: 'runtime',
        value: runtimeDays,
        weight: 0.15,
        threshold_min: 0,
        threshold_max: 30000, // 假设设备最大运行时间
        unit: 'days'
      });
    }

    // 计算加权健康度
    let totalWeight = 0;
    let weightedScore = 0;

    for (const indicator of healthIndicators) {
      // 基于阈值计算单项健康度
      let indicatorHealth = 100;
      
      if (indicator.threshold_min !== undefined && indicator.value < indicator.threshold_min) {
        indicatorHealth = Math.max(10, 100 - (indicator.threshold_min - indicator.value) * 5);
      } else if (indicator.threshold_max !== undefined && indicator.value > indicator.threshold_max) {
        indicatorHealth = Math.max(10, 100 - (indicator.value - indicator.threshold_max) * 5);
      }
      
      weightedScore += indicatorHealth * indicator.weight;
      totalWeight += indicator.weight;
    }

    const overallHealth = totalWeight > 0 ? weightedScore / totalWeight : 100;

    // 保存健康度记录
    const healthRecord = new DeviceHealth();
    healthRecord.device_id = deviceId;
    healthRecord.health_score = parseFloat(overallHealth.toFixed(2));
    healthRecord.indicators = healthIndicators;
    healthRecord.calculated_at = new Date();

    await this.deviceHealthRepository.save(healthRecord);

    return parseFloat(overallHealth.toFixed(2));
  }

  // 预测性维护分析
  async predictMaintenanceNeeds(deviceId: number): Promise<PredictiveModelResult> {
    // 获取设备信息
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // 获取历史传感器数据
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const historicalData = await this.sensorDataRepository.find({
      where: {
        device_id: deviceId,
        data_timestamp: Between(thirtyDaysAgo, new Date())
      },
      order: {
        data_timestamp: 'ASC'
      }
    });

    // 执行预测分析
    const analysisResult = this.performPredictiveAnalysis(historicalData, device);

    return analysisResult;
  }

  // 执行预测分析的核心算法
  private performPredictiveAnalysis(historicalData: any[], device: Device): PredictiveModelResult {
    // 简化的预测算法 - 在实际应用中，这里会使用更复杂的机器学习模型
    let failureProbability = 0.1; // 基础故障概率
    let estimatedDaysToFailure = 365; // 默认预估一年后故障
    let confidence = 0.7; // 基础置信度
    const recommendations: string[] = [];

    // 基于趋势分析
    const tempData = historicalData.filter(d => d.data_type === 'temperature');
    if (tempData.length >= 10) {
      // 计算温度趋势
      const recentTemps = tempData.slice(-10).map(d => d.processed_value).filter(v => v !== null);
      if (recentTemps.length >= 2) {
        const initialTemp = recentTemps[0];
        const finalTemp = recentTemps[recentTemps.length - 1];
        const tempChangeRate = (finalTemp - initialTemp) / recentTemps.length;

        if (tempChangeRate > 0.5) {
          // 温度持续上升，故障风险增加
          failureProbability += 0.3;
          estimatedDaysToFailure = Math.max(30, estimatedDaysToFailure - 100);
          recommendations.push("温度持续上升，建议检查冷却系统");
        } else if (tempChangeRate < -0.5) {
          // 温度持续下降，可能表示效率问题
          recommendations.push("温度持续下降，检查加热系统");
        }
      }
    }

    // 基于振动分析
    const vibrationData = historicalData.filter(d => d.data_type === 'vibration');
    if (vibrationData.length >= 10) {
      const recentVibrations = vibrationData.slice(-10).map(d => d.processed_value).filter(v => v !== null);
      if (recentVibrations.length > 0) {
        const avgVibration = recentVibrations.reduce((sum, v) => sum + v, 0) / recentVibrations.length;
        
        if (avgVibration > 3) {
          failureProbability += 0.25;
          estimatedDaysToFailure = Math.max(45, estimatedDaysToFailure - 150);
          recommendations.push("振动值过高，建议检查机械部件");
        }
      }
    }

    // 基于设备运行时间
    if (device.installation_date) {
      const daysInService = this.calculateDaysDifference(new Date(), new Date(device.installation_date));
      
      if (daysInService > 1800) { // 超过5年
        failureProbability += 0.2;
        estimatedDaysToFailure = Math.max(60, estimatedDaysToFailure - 120);
        recommendations.push("设备服役时间较长，建议全面检查");
      } else if (daysInService > 365) { // 超过1年
        recommendations.push("设备服役时间较长，注意定期维护");
      }
    }

    // 基于历史维修记录
    const maintenanceRecords = this.workOrdersRepository.find({
      where: { device_id: device.id },
      order: { created_at: 'DESC' },
      take: 5
    }) as any;

    // 如果近期维修频繁，故障风险增加
    if (maintenanceRecords && maintenanceRecords.length > 3) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const recentRepairs = maintenanceRecords.filter((r: any) => 
        new Date(r.created_at) > ninetyDaysAgo
      );
      
      if (recentRepairs.length > 2) {
        failureProbability += 0.2;
        recommendations.push("近期维修频繁，建议深度检修");
      }
    }

    // 更新置信度
    if (historicalData.length < 30) {
      confidence = 0.5; // 数据不足，置信度较低
    } else if (historicalData.length > 100) {
      confidence = 0.85; // 数据充分，置信度较高
    }

    // 计算健康指标
    const healthIndicators: HealthIndicator[] = [
      {
        name: 'temperature_trend',
        value: tempData.length > 0 ? 
          tempData.slice(-5).reduce((sum, d) => sum + (d.processed_value || 0), 0) / 5 : 0,
        weight: 0.4,
        unit: '°C'
      },
      {
        name: 'vibration_level',
        value: vibrationData.length > 0 ?
          vibrationData.slice(-5).reduce((sum, d) => sum + (d.processed_value || 0), 0) / 5 : 0,
        weight: 0.3,
        unit: 'mm/s'
      },
      {
        name: 'uptime_ratio',
        value: device.installation_date ? 
          Math.min(100, 95 + Math.random() * 5) : 100, // 简化的运行率计算
        weight: 0.3,
        unit: '%'
      }
    ];

    return {
      failure_probability: Math.min(0.95, parseFloat(failureProbability.toFixed(2))),
      estimated_days_to_failure: Math.floor(estimatedDaysToFailure),
      confidence: parseFloat(confidence.toFixed(2)),
      recommendations,
      health_indicators: healthIndicators
    };
  }

  // 生成维护工单
  async generateMaintenanceOrder(deviceId: number, prediction: PredictiveModelResult) {
    if (prediction.failure_probability > 0.6) {
      // 如果故障概率超过60%，生成预防性维护工单
      const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
      
      const workOrder = new WorkOrder();
      workOrder.device_id = deviceId;
      workOrder.tenant_id = device.tenant_id;
      workOrder.order_type = 'maintenance';
      workOrder.title = `预测性维护 - ${device.name}`;
      workOrder.description = `
        根据预测性维护算法分析，设备存在较高故障风险。
        
        分析结果：
        - 故障概率: ${(prediction.failure_probability * 100).toFixed(1)}%
        - 预估故障时间: 约${prediction.estimated_days_to_failure}天后
        - 预测置信度: ${(prediction.confidence * 100).toFixed(1)}%
        
        维护建议：
        ${prediction.recommendations.join('\n- ')}

        请尽快安排维护以避免意外停机。
      `;
      workOrder.priority = prediction.failure_probability > 0.8 ? 'high' : 'medium';
      workOrder.status = 'pending';
      workOrder.scheduled_date = new Date();
      workOrder.scheduled_date.setDate(workOrder.scheduled_date.getDate() + 3); // 3天内安排

      return await this.workOrdersRepository.save(workOrder);
    }

    return null;
  }

  // 获取维护建议
  async getMaintenanceRecommendations(deviceId: number) {
    const prediction = await this.predictMaintenanceNeeds(deviceId);
    
    return {
      device_id: deviceId,
      failure_risk: prediction.failure_probability > 0.7 ? 'high' : 
                   prediction.failure_probability > 0.4 ? 'medium' : 'low',
      recommended_actions: prediction.recommendations,
      next_maintenance_date: prediction.estimated_days_to_failure > 30 ?
        new Date(Date.now() + (prediction.estimated_days_to_failure - 30) * 24 * 60 * 60 * 1000) :
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 如果预计很快故障，则建议一周内维护
      confidence_level: prediction.confidence
    };
  }

  // 计算两个日期之间的天数差
  private calculateDaysDifference(date1: Date, date2: Date): number {
    const timeDiff = Math.abs(date1.getTime() - date2.getTime());
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  // 批量处理多个设备的预测性维护分析
  async batchPredictiveAnalysis(deviceIds: number[]) {
    const results = [];

    for (const deviceId of deviceIds) {
      try {
        const prediction = await this.predictMaintenanceNeeds(deviceId);
        results.push({
          device_id: deviceId,
          prediction,
          health_score: await this.calculateDeviceHealth(deviceId)
        });
      } catch (error) {
        this.logger.error(`Error analyzing device ${deviceId}: ${error.message}`);
        results.push({
          device_id: deviceId,
          error: error.message
        });
      }
    }

    return results;
  }
}