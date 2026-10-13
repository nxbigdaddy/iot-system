import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { SensorData } from '../sensors/entities/sensor-data.entity';
import { MaintenanceSchedule } from '../maintenance-schedules/entities/maintenance-schedule.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { DeviceHealth } from '../device-health/entities/device-health.entity';
import { PredictionModel } from './entities/prediction-model.entity';

export interface HealthIndicator {
  name: string;
  value: number;
  baseline: number;
  thresholdMin?: number;
  thresholdMax?: number;
  weight: number; // 权重，用于计算综合健康度
  unit: string;
  trend: 'increasing' | 'decreasing' | 'stable'; // 趋势
}

export interface PredictionResult {
  deviceId: number;
  failureProbability: number; // 故障概率 0-1
  estimatedDaysToFailure: number; // 预估故障天数
  confidence: number; // 预测置信度 0-1
  healthIndicators: HealthIndicator[];
  maintenanceRecommendations: string[];
  maintenancePriority: 'low' | 'medium' | 'high' | 'urgent';
  nextMaintenanceDate?: Date;
  anomalyDetected: boolean; // 是否检测到异常
  anomalyType?: string; // 异常类型
  trendAnalysis: {
    shortTerm: 'improving' | 'declining' | 'stable'; // 短期趋势 (7天)
    mediumTerm: 'improving' | 'declining' | 'stable'; // 中期趋势 (30天)
    longTerm: 'improving' | 'declining' | 'stable'; // 长期趋势 (90天)
  };
}

export interface ModelTrainingResult {
  modelId: string;
  trainingAccuracy: number;
  trainingDate: Date;
  featuresUsed: string[];
  algorithmUsed: string;
}

@Injectable()
export class AdvancedPredictiveMaintenanceService {
  private logger = new Logger(AdvancedPredictiveMaintenanceService.name);

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
    @InjectRepository(PredictionModel)
    private predictionModelsRepository: Repository<PredictionModel>,
  ) {}

  /**
   * 执行预测性分析
   */
  async performPredictiveAnalysis(deviceId: number): Promise<PredictionResult> {
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new Error(`Device with id ${deviceId} not found`);
    }

    // 获取历史数据
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const historicalData = await this.sensorDataRepository.find({
      where: {
        device_id: deviceId,
        data_timestamp: Between(ninetyDaysAgo, new Date())
      },
      order: {
        data_timestamp: 'ASC'
      }
    });

    if (!historicalData || historicalData.length < 10) {
      // 数据不足时返回默认值
      return this.getDefaultPredictionResult(deviceId, device.name);
    }

    // 分析各项指标
    const healthIndicators = await this.analyzeHealthIndicators(historicalData, device);
    
    // 计算故障概率
    const failureProbability = this.calculateFailureProbability(healthIndicators);
    
    // 预估故障时间
    const estimatedDaysToFailure = this.estimateTimeToFailure(healthIndicators, device);
    
    // 计算置信度
    const confidence = this.calculateConfidence(historicalData.length, healthIndicators);
    
    // 生成维护建议
    const maintenanceRecommendations = this.generateMaintenanceRecommendations(healthIndicators, device);
    
    // 确定维护优先级
    const maintenancePriority = this.determineMaintenancePriority(failureProbability, estimatedDaysToFailure);
    
    // 检测异常
    const anomalyResult = this.detectAnomalies(historicalData);
    
    // 趋势分析
    const trendAnalysis = this.analyzeTrends(historicalData);

    // 计算下一个维护日期
    const nextMaintenanceDate = this.calculateNextMaintenanceDate(device, estimatedDaysToFailure);

    return {
      deviceId,
      failureProbability,
      estimatedDaysToFailure,
      confidence,
      healthIndicators,
      maintenanceRecommendations,
      maintenancePriority,
      nextMaintenanceDate,
      anomalyDetected: anomalyResult.detected,
      anomalyType: anomalyResult.type,
      trendAnalysis
    };
  }

  /**
   * 分析健康指标
   */
  private async analyzeHealthIndicators(historicalData: any[], device: Device): Promise<HealthIndicator[]> {
    const indicators: HealthIndicator[] = [];
    
    // 温度指标分析
    const tempData = historicalData.filter(d => d.data_type === 'temperature');
    if (tempData.length > 0) {
      const values = tempData.map(d => d.processed_value).filter(v => v !== null);
      if (values.length > 0) {
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        const baseline = this.calculateBaseline(tempData, 'temperature');
        const trend = this.calculateTrend(values);
        
        indicators.push({
          name: 'temperature',
          value: avgValue,
          baseline,
          thresholdMin: 10,
          thresholdMax: 80,
          weight: 0.3,
          unit: '°C',
          trend
        });
      }
    }

    // 振动指标分析
    const vibrationData = historicalData.filter(d => d.data_type === 'vibration');
    if (vibrationData.length > 0) {
      const values = vibrationData.map(d => d.processed_value).filter(v => v !== null);
      if (values.length > 0) {
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        const baseline = this.calculateBaseline(vibrationData, 'vibration');
        const trend = this.calculateTrend(values);
        
        indicators.push({
          name: 'vibration',
          value: avgValue,
          baseline,
          thresholdMin: 0,
          thresholdMax: 10,
          weight: 0.25,
          unit: 'mm/s',
          trend
        });
      }
    }

    // 压力指标分析
    const pressureData = historicalData.filter(d => d.data_type === 'pressure');
    if (pressureData.length > 0) {
      const values = pressureData.map(d => d.processed_value).filter(v => v !== null);
      if (values.length > 0) {
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        const baseline = this.calculateBaseline(pressureData, 'pressure');
        const trend = this.calculateTrend(values);
        
        indicators.push({
          name: 'pressure',
          value: avgValue,
          baseline,
          thresholdMin: 0.5,
          thresholdMax: 1.5,
          weight: 0.2,
          unit: 'MPa',
          trend
        });
      }
    }

    // 电流指标分析
    const currentData = historicalData.filter(d => d.data_type === 'current');
    if (currentData.length > 0) {
      const values = currentData.map(d => d.processed_value).filter(v => v !== null);
      if (values.length > 0) {
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        const baseline = this.calculateBaseline(currentData, 'current');
        const trend = this.calculateTrend(values);
        
        indicators.push({
          name: 'current',
          value: avgValue,
          baseline,
          thresholdMin: 5,
          thresholdMax: 15,
          weight: 0.15,
          unit: 'A',
          trend
        });
      }
    }

    // 运行时间指标（基于设备安装日期）
    if (device.installation_date) {
      const runtimeDays = this.calculateDaysDifference(new Date(), new Date(device.installation_date));
      const baseline = this.estimateBaselineRuntime(device.device_type);
      
      indicators.push({
        name: 'runtime',
        value: runtimeDays,
        baseline,
        thresholdMin: 0,
        thresholdMax: 8760, // 假设设备寿命为1年（8760小时）
        weight: 0.1,
        unit: 'hours',
        trend: 'increasing' // 运行时间总是增加的
      });
    }

    return indicators;
  }

  /**
   * 计算基线值
   */
  private calculateBaseline(data: any[], dataType: string): number {
    if (data.length === 0) return 0;

    // 使用历史数据的百分位数作为基线（比如第25百分位数）
    const values = data
      .map(d => d.processed_value)
      .filter(v => v !== null)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;

    // 计算第25百分位数作为基线
    const percentileIndex = Math.floor(values.length * 0.25);
    return values[percentileIndex];
  }

  /**
   * 估算基线运行时间
   */
  private estimateBaselineRuntime(deviceType: string): number {
    // 根据设备类型估算基线运行时间
    switch (deviceType) {
      case 'sensor':
        return 8760; // 传感器通常可运行1年
      case 'controller':
        return 4380; // 控制器可能需要更频繁维护
      case 'actuator':
        return 2190; // 执行器磨损较快
      default:
        return 4380; // 默认半年
    }
  }

  /**
   * 计算趋势
   */
  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 3) return 'stable';

    // 使用线性回归简单判断趋势
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (slope > 0.1) return 'increasing';
    if (slope < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * 计算故障概率
   */
  private calculateFailureProbability(indicators: HealthIndicator[]): number {
    let probability = 0.1; // 基础故障概率

    for (const indicator of indicators) {
      // 根据偏离基线的程度计算影响
      const deviation = Math.abs(indicator.value - indicator.baseline) / indicator.baseline;
      
      // 根据是否超出阈值增加故障概率
      if (indicator.thresholdMin !== undefined && indicator.value < indicator.thresholdMin) {
        probability += deviation * indicator.weight * 2;
      } else if (indicator.thresholdMax !== undefined && indicator.value > indicator.thresholdMax) {
        probability += deviation * indicator.weight * 2;
      } else if (deviation > 0.2) { // 即使在阈值内，大幅偏离也会增加风险
        probability += deviation * indicator.weight;
      }

      // 趋势恶化也会增加故障概率
      if (indicator.trend === 'increasing' && 
          ['temperature', 'vibration', 'current'].includes(indicator.name) &&
          indicator.value > (indicator.thresholdMax || indicator.baseline * 1.2)) {
        probability += 0.1;
      }
    }

    // 限制概率在0-1之间
    return Math.min(0.95, Math.max(0.05, probability));
  }

  /**
   * 预估故障时间
   */
  private estimateTimeToFailure(indicators: HealthIndicator[], device: Device): number {
    let minEstimatedDays = 365; // 默认1年
    
    for (const indicator of indicators) {
      if (indicator.value > (indicator.thresholdMax || indicator.baseline * 1.5)) {
        // 如果指标严重超标，预估故障时间缩短
        let daysToFailure = 30; // 默认30天
        
        // 根据超标程度调整
        const excessRatio = (indicator.value - (indicator.thresholdMax || indicator.baseline)) / 
                          (indicator.thresholdMax || indicator.baseline);
        
        daysToFailure = Math.max(7, Math.round(daysToFailure / (1 + excessRatio * 10)));
        
        minEstimatedDays = Math.min(minEstimatedDays, daysToFailure);
      }
    }

    // 考虑设备年龄因素
    if (device.installation_date) {
      const ageInDays = this.calculateDaysDifference(new Date(), new Date(device.installation_date));
      
      // 老旧设备故障概率更高
      if (ageInDays > 1095) { // 超过3年
        minEstimatedDays = Math.min(minEstimatedDays, 30);
      } else if (ageInDays > 730) { // 超过2年
        minEstimatedDays = Math.min(minEstimatedDays, 60);
      }
    }

    return minEstimatedDays;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(dataPoints: number, indicators: HealthIndicator[]): number {
    let confidence = 0.5; // 基础置信度

    // 数据点越多置信度越高
    if (dataPoints > 100) {
      confidence += 0.3;
    } else if (dataPoints > 50) {
      confidence += 0.2;
    } else if (dataPoints > 20) {
      confidence += 0.1;
    }

    // 指标覆盖度也影响置信度
    const coveredIndicators = indicators.length;
    if (coveredIndicators >= 4) {
      confidence += 0.2;
    } else if (coveredIndicators >= 2) {
      confidence += 0.1;
    }

    return Math.min(0.95, Math.max(0.3, confidence));
  }

  /**
   * 生成维护建议
   */
  private generateMaintenanceRecommendations(indicators: HealthIndicator[], device: Device): string[] {
    const recommendations: string[] = [];

    for (const indicator of indicators) {
      if (indicator.value > (indicator.thresholdMax || indicator.baseline * 1.3)) {
        recommendations.push(
          `${indicator.name}值(${indicator.value}${indicator.unit})超出正常范围，建议检查相关部件`
        );
      } else if (indicator.value < (indicator.thresholdMin || indicator.baseline * 0.7)) {
        recommendations.push(
          `${indicator.name}值(${indicator.value}${indicator.unit})偏低，可能存在效能问题`
        );
      } else if (Math.abs(indicator.value - indicator.baseline) / indicator.baseline > 0.2) {
        recommendations.push(
          `${indicator.name}值(${indicator.value}${indicator.unit})偏离基线较多，建议关注`
        );
      }

      // 趋势分析建议
      if (indicator.trend === 'increasing' && 
          ['temperature', 'vibration', 'current'].includes(indicator.name)) {
        recommendations.push(
          `${indicator.name}呈上升趋势，建议加强监控`
        );
      }
    }

    // 如果没有特定建议，提供通用建议
    if (recommendations.length === 0) {
      recommendations.push('设备运行正常，建议继续按计划维护');
    }

    return recommendations;
  }

  /**
   * 确定维护优先级
   */
  private determineMaintenancePriority(failureProbability: number, estimatedDaysToFailure: number): 'low' | 'medium' | 'high' | 'urgent' {
    if (failureProbability > 0.8 || estimatedDaysToFailure < 7) {
      return 'urgent';
    } else if (failureProbability > 0.6 || estimatedDaysToFailure < 30) {
      return 'high';
    } else if (failureProbability > 0.4 || estimatedDaysToFailure < 90) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 检测异常
   */
  private detectAnomalies(historicalData: any[]): { detected: boolean; type?: string } {
    // 简单的异常检测：查找明显偏离正常范围的数据点
    for (const data of historicalData) {
      if (data.data_type === 'temperature' && data.processed_value > 100) {
        return { detected: true, type: 'overheating' };
      }
      if (data.data_type === 'vibration' && data.processed_value > 15) {
        return { detected: true, type: 'excessive_vibration' };
      }
      if (data.data_type === 'current' && data.processed_value > 20) {
        return { detected: true, type: 'overcurrent' };
      }
    }

    return { detected: false };
  }

  /**
   * 趋势分析
   */
  private analyzeTrends(historicalData: any[]): any {
    const now = new Date();
    
    // 短期趋势 (7天)
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const shortTermData = historicalData.filter(d => new Date(d.data_timestamp) >= sevenDaysAgo);
    
    // 中期趋势 (30天)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const mediumTermData = historicalData.filter(d => new Date(d.data_timestamp) >= thirtyDaysAgo);
    
    // 长期趋势 (90天)
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const longTermData = historicalData.filter(d => new Date(d.data_timestamp) >= ninetyDaysAgo);

    return {
      shortTerm: this.analyzePeriodTrend(shortTermData),
      mediumTerm: this.analyzePeriodTrend(mediumTermData),
      longTerm: this.analyzePeriodTrend(longTermData)
    };
  }

  /**
   * 分析特定时间段的趋势
   */
  private analyzePeriodTrend(periodData: any[]): 'improving' | 'declining' | 'stable' {
    if (periodData.length < 3) return 'stable';

    // 获取温度、振动、电流数据的趋势
    const tempData = periodData
      .filter(d => d.data_type === 'temperature')
      .map(d => ({ time: new Date(d.data_timestamp).getTime(), value: d.processed_value }))
      .sort((a, b) => a.time - b.time);

    const vibrationData = periodData
      .filter(d => d.data_type === 'vibration')
      .map(d => ({ time: new Date(d.data_timestamp).getTime(), value: d.processed_value }))
      .sort((a, b) => a.time - b.time);

    // 简单的趋势判断
    if (tempData.length >= 2) {
      const firstValue = tempData[0].value;
      const lastValue = tempData[tempData.length - 1].value;
      if (lastValue > firstValue * 1.1) return 'declining';
      if (lastValue < firstValue * 0.9) return 'improving';
    }

    if (vibrationData.length >= 2) {
      const firstValue = vibrationData[0].value;
      const lastValue = vibrationData[vibrationData.length - 1].value;
      if (lastValue > firstValue * 1.1) return 'declining';
      if (lastValue < firstValue * 0.9) return 'improving';
    }

    return 'stable';
  }

  /**
   * 计算下次维护日期
   */
  private calculateNextMaintenanceDate(device: Device, estimatedDaysToFailure: number): Date {
    const nextDate = new Date();
    
    // 根据预估故障时间和维护优先级设置下次维护日期
    let daysToAdd: number;
    
    if (device.maintenance_interval_months) {
      // 基于设备维护间隔
      daysToAdd = device.maintenance_interval_months * 30;
    } else {
      // 基于预估故障时间
      daysToAdd = Math.min(estimatedDaysToFailure, 180); // 最多提前180天安排
    }

    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  }

  /**
   * 获取默认预测结果（数据不足时）
   */
  private getDefaultPredictionResult(deviceId: number, deviceName: string): PredictionResult {
    return {
      deviceId,
      failureProbability: 0.1,
      estimatedDaysToFailure: 365,
      confidence: 0.3,
      healthIndicators: [],
      maintenanceRecommendations: [`设备 ${deviceName} 数据不足，建议加强数据采集`],
      maintenancePriority: 'low',
      anomalyDetected: false,
      trendAnalysis: {
        shortTerm: 'unknown',
        mediumTerm: 'unknown',
        longTerm: 'unknown'
      }
    };
  }

  /**
   * 批量预测分析
   */
  async batchPredictiveAnalysis(deviceIds: number[]): Promise<PredictionResult[]> {
    const results: PredictionResult[] = [];

    for (const deviceId of deviceIds) {
      try {
        const result = await this.performPredictiveAnalysis(deviceId);
        results.push(result);
      } catch (error) {
        this.logger.error(`Error analyzing device ${deviceId}: ${error.message}`);
        
        // 返回错误情况下的默认结果
        results.push(this.getDefaultPredictionResult(deviceId, `Device ${deviceId}`));
      }
    }

    return results;
  }

  /**
   * 获取预测分析统计
   */
  async getPredictionStatistics(tenantId: number) {
    const devices = await this.devicesRepository.find({ where: { tenant_id: tenantId } });
    
    const analysisResults = await this.batchPredictiveAnalysis(devices.map(d => d.id));
    
    // 统计各类别的设备数量
    const priorityCounts = {
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    const failureRiskRanges = {
      '0-20%': 0,
      '21-40%': 0,
      '41-60%': 0,
      '61-80%': 0,
      '81-100%': 0
    };
    
    for (const result of analysisResults) {
      priorityCounts[result.maintenancePriority]++;
      
      const riskRange = Math.floor(result.failureProbability * 100 / 20);
      const rangeKey = `${riskRange * 20}-${(riskRange + 1) * 20}%`;
      if (failureRiskRanges.hasOwnProperty(rangeKey)) {
        failureRiskRanges[rangeKey as keyof typeof failureRiskRanges]++;
      }
    }
    
    // 计算平均指标
    const avgFailureProbability = analysisResults.reduce((sum, r) => sum + r.failureProbability, 0) / analysisResults.length;
    const avgTimeToFailure = analysisResults.reduce((sum, r) => sum + r.estimatedDaysToFailure, 0) / analysisResults.length;
    const avgConfidence = analysisResults.reduce((sum, r) => sum + r.confidence, 0) / analysisResults.length;
    
    return {
      totalDevices: devices.length,
      analysisResults,
      priorityDistribution: priorityCounts,
      failureRiskDistribution: failureRiskRanges,
      averages: {
        avgFailureProbability: parseFloat(avgFailureProbability.toFixed(3)),
        avgTimeToFailure: Math.round(avgTimeToFailure),
        avgConfidence: parseFloat(avgConfidence.toFixed(3))
      }
    };
  }

  /**
   * 训练预测模型
   */
  async trainPredictionModel(deviceType: string): Promise<ModelTrainingResult> {
    // 这里是模型训练的简化实现
    // 实际应用中，这里会使用机器学习库如TensorFlow.js或连接到外部ML服务
    
    const featuresUsed = [
      'temperature_mean', 
      'temperature_std', 
      'vibration_mean', 
      'vibration_std', 
      'pressure_mean', 
      'current_mean',
      'runtime_hours',
      'days_since_last_maintenance'
    ];
    
    // 模拟训练过程
    await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟训练时间
    
    const trainingResult = {
      modelId: `model_${deviceType}_${Date.now()}`,
      trainingAccuracy: 0.85 + Math.random() * 0.1, // 随机准确率 85-95%
      trainingDate: new Date(),
      featuresUsed,
      algorithmUsed: 'RandomForest' // 使用随机森林算法
    };
    
    // 保存模型信息到数据库
    const model = new PredictionModel();
    model.model_id = trainingResult.modelId;
    model.device_type = deviceType;
    model.accuracy = trainingResult.trainingAccuracy;
    model.training_date = trainingResult.trainingDate;
    model.features_used = featuresUsed;
    model.algorithm_used = trainingResult.algorithmUsed;
    
    await this.predictionModelsRepository.save(model);
    
    return trainingResult;
  }

  /**
   * 获取最佳维护窗口
   */
  async getOptimalMaintenanceWindow(deviceId: number, preferredDates: Date[]): Promise<Date> {
    // 这里可以根据设备运行模式、生产计划等因素确定最佳维护时间
    // 简化实现：返回第一个可用日期
    return preferredDates.length > 0 ? preferredDates[0] : new Date();
  }

  /**
   * 生成维护计划
   */
  async generateMaintenancePlan(deviceId: number, prediction: PredictionResult) {
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new Error(`Device with id ${deviceId} not found`);
    }

    // 检查是否已存在维护计划
    const existingSchedule = await this.maintenanceSchedulesRepository.findOne({
      where: { device_id: deviceId }
    });

    if (existingSchedule) {
      // 更新现有计划
      existingSchedule.next_schedule_date = prediction.nextMaintenanceDate;
      existingSchedule.description = `基于预测分析生成的维护计划 - 优先级: ${prediction.maintenancePriority}`;
      existingSchedule.interval_days = Math.max(7, Math.min(365, 
        this.calculateDaysDifference(prediction.nextMaintenanceDate, new Date())));
      
      return await this.maintenanceSchedulesRepository.save(existingSchedule);
    } else {
      // 创建新维护计划
      const schedule = new MaintenanceSchedule();
      schedule.device_id = deviceId;
      schedule.schedule_type = 'predictive';
      schedule.interval_days = Math.max(7, Math.min(365, 
        this.calculateDaysDifference(prediction.nextMaintenanceDate, new Date())));
      schedule.next_schedule_date = prediction.nextMaintenanceDate;
      schedule.description = `基于预测分析生成的维护计划 - 优先级: ${prediction.maintenancePriority}`;
      
      return await this.maintenanceSchedulesRepository.save(schedule);
    }
  }

  /**
   * 计算日期差
   */
  private calculateDaysDifference(date1: Date, date2: Date): number {
    const timeDiff = Math.abs(date1.getTime() - date2.getTime());
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }
}