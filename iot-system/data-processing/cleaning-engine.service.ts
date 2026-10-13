import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { SensorData } from '../api/src/modules/sensor-data/entities/sensor-data.entity';
import { Device } from '../api/src/modules/devices/entities/device.entity';

export interface CleaningRule {
  id: number;
  name: string;
  device_id?: number;
  data_type: string;
  rule_type: 'filter' | 'transform' | 'fill';
  condition: string; // 条件表达式
  action: string; // 执行动作
  params: Record<string, any>; // 规则参数
  enabled: boolean;
}

@Injectable()
export class CleaningEngineService {
  private logger = new Logger(CleaningEngineService.name);

  constructor(
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
  ) {}

  // 应用清洗规则到数据
  async processData(rawData: any, deviceId: number, dataType: string): Promise<any> {
    // 获取设备相关的清洗规则
    const rules = await this.getCleaningRules(deviceId, dataType);
    
    let processedData = { ...rawData };

    for (const rule of rules) {
      if (!rule.enabled) continue;

      try {
        switch (rule.rule_type) {
          case 'filter':
            processedData = this.applyFilterRule(processedData, rule);
            break;
          case 'transform':
            processedData = this.applyTransformRule(processedData, rule);
            break;
          case 'fill':
            processedData = this.applyFillRule(processedData, rule);
            break;
        }
      } catch (error) {
        this.logger.error(`Error applying rule ${rule.id}: ${error.message}`);
      }
    }

    return processedData;
  }

  // 获取清洗规则
  private async getCleaningRules(deviceId: number, dataType: string): Promise<CleaningRule[]> {
    // 这里应该从数据库获取规则，为了演示暂时返回硬编码规则
    return [
      {
        id: 1,
        name: '去除重复数据',
        device_id: deviceId,
        data_type: dataType,
        rule_type: 'filter',
        condition: 'time_window',
        action: 'remove_duplicates',
        params: { window_minutes: 1 },
        enabled: true
      },
      {
        id: 2,
        name: '过滤无效值',
        device_id: deviceId,
        data_type: dataType,
        rule_type: 'filter',
        condition: 'out_of_range',
        action: 'set_null',
        params: { min: -50, max: 150 }, // 温度范围示例
        enabled: true
      },
      {
        id: 3,
        name: '单位转换',
        device_id: deviceId,
        data_type: dataType,
        rule_type: 'transform',
        condition: 'all_values',
        action: 'convert_unit',
        params: { from: 'fahrenheit', to: 'celsius' },
        enabled: false // 默认禁用单位转换
      }
    ];
  }

  // 应用过滤规则
  private applyFilterRule(data: any, rule: CleaningRule): any {
    switch (rule.action) {
      case 'remove_duplicates':
        // 时间窗口去重逻辑
        return this.removeDuplicates(data, rule.params.window_minutes);
      
      case 'set_null':
        // 过滤超出范围的值
        return this.filterOutOfRange(data, rule.params.min, rule.params.max);
      
      default:
        return data;
    }
  }

  // 应用转换规则
  private applyTransformRule(data: any, rule: CleaningRule): any {
    switch (rule.action) {
      case 'convert_unit':
        // 单位转换逻辑
        return this.convertUnit(data, rule.params.from, rule.params.to);
      
      case 'adjust_precision':
        // 精度调整
        return this.adjustPrecision(data, rule.params.decimals);
      
      default:
        return data;
    }
  }

  // 应用填充规则
  private applyFillRule(data: any, rule: CleaningRule): any {
    switch (rule.action) {
      case 'linear_interpolation':
        // 线性插值填充
        return this.linearInterpolation(data);
      
      case 'forward_fill':
        // 前向填充
        return this.forwardFill(data);
      
      default:
        return data;
    }
  }

  // 去除重复数据（时间窗口内）
  private removeDuplicates(data: any, windowMinutes: number): any {
    // 简化实现：假设data包含时间戳
    if (!Array.isArray(data)) return data;

    const windowMs = windowMinutes * 60 * 1000;
    const filteredData = [];
    
    for (const item of data) {
      const timestamp = new Date(item.timestamp).getTime();
      const duplicateIndex = filteredData.findIndex(fItem => 
        Math.abs(new Date(fItem.timestamp).getTime() - timestamp) < windowMs
      );
      
      if (duplicateIndex === -1) {
        filteredData.push(item);
      }
    }

    return filteredData;
  }

  // 过滤超出范围的值
  private filterOutOfRange(data: any, min: number, max: number): any {
    if (typeof data === 'object' && data.value !== undefined) {
      const value = parseFloat(data.value);
      if (isNaN(value) || value < min || value > max) {
        return { ...data, value: null, quality_score: 0.0 };
      }
      return { ...data, quality_score: 1.0 };
    }
    
    return data;
  }

  // 单位转换
  private convertUnit(data: any, from: string, to: string): any {
    if (typeof data !== 'object' || data.value === undefined) return data;
    
    let convertedValue = data.value;
    
    if (from === 'fahrenheit' && to === 'celsius') {
      convertedValue = (data.value - 32) * 5/9;
    } else if (from === 'celsius' && to === 'fahrenheit') {
      convertedValue = (data.value * 9/5) + 32;
    }
    // 可以添加更多单位转换
    
    return { ...data, value: convertedValue };
  }

  // 精度调整
  private adjustPrecision(data: any, decimals: number): any {
    if (typeof data === 'object' && data.value !== undefined) {
      const value = parseFloat(data.value);
      if (!isNaN(value)) {
        return { 
          ...data, 
          value: parseFloat(value.toFixed(decimals)),
          processed_value: parseFloat(value.toFixed(decimals))
        };
      }
    }
    
    return data;
  }

  // 批量清洗历史数据
  async cleanHistoricalData(deviceId: number, startDate: Date, endDate: Date) {
    this.logger.log(`Starting historical data cleaning for device ${deviceId}`);

    // 查询时间段内的原始数据
    const rawData = await this.sensorDataRepository.find({
      where: {
        device_id: deviceId,
        data_timestamp: Between(startDate, endDate)
      }
    });

    let cleanedCount = 0;
    let errorCount = 0;

    for (const record of rawData) {
      try {
        // 获取对应的数据类型
        const cleanedData = await this.processData(
          { value: record.raw_value, timestamp: record.data_timestamp },
          deviceId,
          record.data_type
        );

        // 更新记录的质量评分和处理后值
        await this.sensorDataRepository.update(record.id, {
          quality_score: cleanedData.quality_score ?? 1.0,
          processed_value: cleanedData.processed_value ?? parseFloat(cleanedData.value)
        });

        cleanedCount++;
      } catch (error) {
        this.logger.error(`Error cleaning record ${record.id}: ${error.message}`);
        errorCount++;
      }
    }

    this.logger.log(`Historical cleaning completed: ${cleanedCount} cleaned, ${errorCount} errors`);

    return {
      total_records: rawData.length,
      cleaned_count: cleanedCount,
      error_count: errorCount
    };
  }

  // 数据质量分析
  async analyzeDataQuality(deviceId: number, daysBack: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const data = await this.sensorDataRepository.find({
      where: {
        device_id: deviceId,
        data_timestamp: Between(startDate, new Date())
      }
    });

    // 计算质量指标
    const totalRecords = data.length;
    const validRecords = data.filter(d => d.quality_score >= 0.8).length;
    const invalidRecords = data.filter(d => d.quality_score < 0.5).length;
    const avgQualityScore = data.reduce((sum, d) => sum + d.quality_score, 0) / totalRecords || 0;

    // 按数据类型分类统计
    const byDataType: Record<string, any> = {};
    for (const record of data) {
      if (!byDataType[record.data_type]) {
        byDataType[record.data_type] = {
          total: 0,
          valid: 0,
          invalid: 0,
          avgQuality: 0,
          values: []
        };
      }

      byDataType[record.data_type].total++;
      if (record.quality_score >= 0.8) {
        byDataType[record.data_type].valid++;
      } else if (record.quality_score < 0.5) {
        byDataType[record.data_type].invalid++;
      }
      
      byDataType[record.data_type].values.push(record.processed_value);
    }

    // 计算各类型的平均质量
    Object.keys(byDataType).forEach(type => {
      const typeData = byDataType[type];
      typeData.avgQuality = typeData.values.reduce((sum, val) => sum + val, 0) / typeData.values.length || 0;
      delete typeData.values; // 删除临时数组
    });

    return {
      overall: {
        total_records: totalRecords,
        valid_records: validRecords,
        invalid_records: invalidRecords,
        data_completeness: totalRecords > 0 ? (validRecords / totalRecords) * 100 : 0,
        average_quality_score: avgQualityScore
      },
      by_data_type: byDataType
    };
  }
}